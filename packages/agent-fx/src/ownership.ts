import { and, eq } from "drizzle-orm";
import { FatalError } from "workflow";

import { nativeSessionSchema } from "./native-state";
import type { NativeSessionState, AppToolContext } from "./native-state";
import { sessionStore } from "./store";
import type { SessionStore } from "./store";

export const createOwnership = (
  store: () => Promise<SessionStore> = sessionStore
) => {
  const getThreadSession = async (
    appId: string,
    threadId: string
  ): Promise<NativeSessionState | undefined> => {
    const { db, appAgentThread } = await store();

    const [thread] = await db
      .select()
      .from(appAgentThread)
      .where(
        and(eq(appAgentThread.appId, appId), eq(appAgentThread.id, threadId))
      );

    if (!thread || thread.invalidatedAt !== null) {
      throw new FatalError(
        "This conversation cannot be resumed. Start a new thread."
      );
    }

    if (thread.resumeState === null) {
      return undefined;
    }

    const parsed = nativeSessionSchema.safeParse(
      JSON.parse(thread.resumeState)
    );

    if (!parsed.success) {
      throw new FatalError(
        "Start a new conversation to use native durable fx."
      );
    }

    return parsed.data;
  };

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

  const assertSessionOwnership = async (
    context: AppToolContext,
    sessionId: string
  ) => {
    if (context.grant.appId !== context.appId) {
      throw new Error("Deployment grant belongs to another app.");
    }

    await assertOwnership(context.appId, context.runId);
    const saved = await getThreadSession(context.appId, context.threadId);

    if (saved?.sessionId !== sessionId) {
      throw new Error("This native session does not own the app workspace.");
    }
  };

  return { assertOwnership, assertSessionOwnership, getThreadSession };
};

export const { getThreadSession, assertOwnership, assertSessionOwnership } =
  createOwnership();
