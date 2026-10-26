import type { HarnessV1ResumeSessionState } from "@ai-sdk/harness";
import { and, eq, isNotNull } from "drizzle-orm";
import { FatalError } from "workflow";
import { getRun } from "workflow/api";
import { z } from "zod";

import type { AppAgentInput } from "./input";
import {
  deleteSandboxByName,
  getSandbox,
  prepareSandbox,
  sandboxName,
} from "./sandbox";
import type { AppSandboxSession } from "./sandbox-session";
import { sessionStore } from "./store";
import type { SessionStore } from "./store";
import { hostSchemaPath, prepareWorkspace } from "./workspace";

const resumeSchema = z.custom<HarnessV1ResumeSessionState>(
  (value) =>
    z
      .object({
        data: z.json(),
        harnessId: z.literal("fx"),
        specificationVersion: z.literal("harness-v1"),
        type: z.literal("resume-session"),
      })
      .safeParse(value).success
);

interface SessionDependencies {
  store: () => Promise<SessionStore>;
  prepareSandbox: (
    input: AppAgentInput,
    resume: boolean
  ) => Promise<{ currentSession: () => AppSandboxSession }>;
  prepareWorkspace: typeof prepareWorkspace;
  getSandbox: (name: string) => Promise<{ stop: () => Promise<void> }>;
  deleteSandbox: typeof deleteSandboxByName;
  runStatus: (runId: string) => ReturnType<typeof getRun>["status"];
}

const defaultSessionDependencies: SessionDependencies = {
  deleteSandbox: deleteSandboxByName,
  getSandbox: async (name) => {
    const sandbox = await getSandbox(name);

    return {
      stop: async () => {
        await sandbox.stop();
      },
    };
  },
  prepareSandbox,
  prepareWorkspace,
  runStatus: async (runId) => await getRun(runId).status,
  store: sessionStore,
};

export const createSessionLifecycle = (
  dependencies: SessionDependencies = defaultSessionDependencies
) => {
  const { store } = dependencies;

  const assertOwnership = async (appId: string, runId: string) => {
    const { db, appAgentLease } = await store();

    const [lease] = await db
      .select()
      .from(appAgentLease)
      .where(
        and(
          eq(appAgentLease.appId, appId),
          eq(appAgentLease.activeRunId, runId)
        )
      );

    if (!lease) {
      throw new FatalError("This run no longer owns the app workspace.");
    }
  };

  /** Keep the row locked until the VM is stopped/deleted; cleanup is safe to repeat. */
  const finishTurn = async (
    appId: string,
    runId: string,
    resumeFrom?: HarnessV1ResumeSessionState
  ) => {
    const { db, appAgentLease, appAgentThread } = await store();
    await db.transaction(async (tx) => {
      const [lease] = await tx
        .select()
        .from(appAgentLease)
        .where(eq(appAgentLease.appId, appId))
        .for("update");

      if (lease?.activeRunId !== runId) {
        return;
      }

      const threadId = lease.activeThreadId;

      const threads =
        threadId === null
          ? []
          : await tx
              .select()
              .from(appAgentThread)
              .where(eq(appAgentThread.id, threadId));

      const [thread] = threads;

      const cleanupName =
        lease.cleanupSandboxName ??
        thread?.sandboxName ??
        (threadId === null ? undefined : sandboxName(threadId));

      if (resumeFrom === undefined || threadId === null) {
        if (cleanupName !== undefined) {
          await dependencies.deleteSandbox(cleanupName);
        }

        if (threadId !== null) {
          await tx
            .update(appAgentThread)
            .set({
              invalidatedAt: new Date(),
              resumeState: null,
              sandboxName: null,
            })
            .where(eq(appAgentThread.id, threadId));
        }
      } else {
        const sandbox = await dependencies.getSandbox(
          thread?.sandboxName ?? sandboxName(threadId)
        );

        await sandbox.stop();
        await tx
          .update(appAgentThread)
          .set({
            resumeState: JSON.stringify(resumeFrom),
            sandboxName: cleanupName,
          })
          .where(eq(appAgentThread.id, threadId));
      }

      await tx
        .update(appAgentLease)
        .set({
          activeRunId: null,
          activeThreadId: null,
          cleanupSandboxName: null,
          leaseExpiresAt: null,
        })
        .where(eq(appAgentLease.appId, appId));
    });
  };

  const cancelTurn = async (appId: string, runId: string) => {
    await finishTurn(appId, runId);
  };

  const reconcileApp = async (appId: string) => {
    const { db, appAgentLease } = await store();

    const [lease] = await db
      .select()
      .from(appAgentLease)
      .where(eq(appAgentLease.appId, appId));

    if (lease?.activeRunId === undefined || lease.activeRunId === null) {
      return;
    }

    const status = await dependencies.runStatus(lease.activeRunId);

    if (status === "pending" || status === "running") {
      return;
    }

    await cancelTurn(appId, lease.activeRunId);
  };

  const reconcileTurns = async () => {
    const { db, appAgentLease } = await store();

    const leases = await db
      .select({ appId: appAgentLease.appId })
      .from(appAgentLease)
      .where(isNotNull(appAgentLease.activeRunId));

    const failures: Error[] = [];

    for (const lease of leases) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Serial cleanup bounds infrastructure operations while inspecting every lease.
        await reconcileApp(lease.appId);
      } catch (error) {
        failures.push(
          error instanceof Error
            ? error
            : new Error("App agent reconciliation failed.")
        );
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "Some app agent cleanups need retrying."
      );
    }

    return leases.length;
  };

  const startTurn = async (
    input: AppAgentInput,
    runId: string
  ): Promise<HarnessV1ResumeSessionState | undefined> => {
    // Reconcile a previous externally cancelled run before trying to acquire its Drive.
    await reconcileApp(input.appId);
    const { db, appAgentLease, appAgentThread } = await store();

    const { state, resume } = await db.transaction(async (tx) => {
      await tx
        .insert(appAgentLease)
        .values({ appId: input.appId })
        .onConflictDoNothing();

      const [lease] = await tx
        .select()
        .from(appAgentLease)
        .where(eq(appAgentLease.appId, input.appId))
        .for("update");

      if (
        !lease ||
        (lease.activeRunId !== null && lease.activeRunId !== runId)
      ) {
        throw new FatalError(
          "This app is already being edited. Retry after the active turn finishes."
        );
      }

      const [thread] = await tx
        .select()
        .from(appAgentThread)
        .where(
          and(
            eq(appAgentThread.appId, input.appId),
            eq(appAgentThread.id, input.threadId)
          )
        );

      if (!thread || thread.invalidatedAt !== null) {
        throw new FatalError(
          "This conversation cannot be resumed. Start a new thread."
        );
      }

      const saved =
        thread.resumeState === null
          ? undefined
          : resumeSchema.safeParse(JSON.parse(thread.resumeState));

      if (saved && !saved.success) {
        throw new FatalError(
          "Start a new conversation to use fx for this app."
        );
      }

      await tx
        .update(appAgentLease)
        .set({
          activeRunId: runId,
          activeThreadId: input.threadId,
          cleanupSandboxName: sandboxName(input.threadId),
          leaseExpiresAt: new Date(Date.now() + 30 * 60_000),
        })
        .where(eq(appAgentLease.appId, input.appId));

      return { resume: saved?.data !== undefined, state: saved?.data };
    });

    const sandbox = await dependencies.prepareSandbox(input, resume);

    try {
      if (input.schema !== undefined) {
        await sandbox.currentSession().writeFiles([
          {
            content: Buffer.from(JSON.stringify(input.schema)),
            path: hostSchemaPath,
          },
        ]);
      }

      await dependencies.prepareWorkspace(sandbox.currentSession(), input);
      await assertOwnership(input.appId, runId);
      await db
        .update(appAgentThread)
        .set({ sandboxName: sandboxName(input.threadId) })
        .where(eq(appAgentThread.id, input.threadId));
    } catch (error) {
      // Setup may finish after an external cancellation removed its lease.
      const ownership = await db
        .select()
        .from(appAgentLease)
        .where(
          and(
            eq(appAgentLease.appId, input.appId),
            eq(appAgentLease.activeRunId, runId)
          )
        );

      if (ownership.length === 0) {
        await dependencies.deleteSandbox(sandboxName(input.threadId));
      }

      throw error;
    }

    return state;
  };

  return {
    assertOwnership,
    cancelTurn,
    finishTurn,
    reconcileApp,
    reconcileTurns,
    startTurn,
  };
};

export const {
  assertOwnership,
  startTurn,
  finishTurn,
  cancelTurn,
  reconcileApp,
  reconcileTurns,
} = createSessionLifecycle();

export type { SessionStore } from "./store";
