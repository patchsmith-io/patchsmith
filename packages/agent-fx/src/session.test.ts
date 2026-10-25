import { readFile, readdir } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { appAgentLease, appAgentThread } from "@patchsmith/db/schema/apps";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vite-plus/test";

import type { AppToolContext } from "./native-state";
import { createSessionLifecycle } from "./session";
import type { SessionStore } from "./session";

const appId = "a3e7568a-c4f7-4ac0-8c35-71ff0f4cd002";
const threadId = "d280ced1-ae62-4f81-8f38-8654d271c52e";
const otherThreadId = "3e2da2d6-c51c-42f2-9318-b2936e30f569";
const client = new PGlite();
const database = drizzle({ client });
const events: string[] = [];
let deleteFails = false;
let status: "running" | "cancelled" = "running";

const lifecycle = createSessionLifecycle({
  agent: async () =>
    await Promise.resolve({
      newSessionId: async () => await Promise.resolve("wrun_native"),
      session: (id) => ({
        cancel: async () => {
          events.push(`cancel:${id}`);
          await Promise.resolve();
        },
      }),
    }),
  deleteSandbox: async () => {
    events.push("delete");
    await Promise.resolve();

    if (deleteFails) {
      throw new Error("Sandbox unavailable");
    }
  },
  getSandbox: async () =>
    await Promise.resolve({
      stop: async () => {
        events.push("stop");
        await Promise.resolve();
      },
    }),
  prepareSandbox: async () => {
    events.push("prepare");

    return await Promise.resolve({
      currentSession: () => ({
        readFileToBuffer: async () => await Promise.resolve(null),
        runCommand: async () =>
          await Promise.resolve({
            exitCode: 0,
            stderr: async () => await Promise.resolve(""),
            stdout: async () => await Promise.resolve(""),
          }),
        writeFiles: async () => {
          await Promise.resolve();
        },
      }),
    });
  },
  prepareWorkspace: async () => {
    await Promise.resolve();
  },
  runStatus: async () => await Promise.resolve(status),
  store: async () =>
    await Promise.resolve({
      appAgentLease,
      appAgentThread,
      db:
        // SAFETY: Both drivers execute the same PostgreSQL statements; these tests exercise no driver-specific methods or relational queries.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- PGlite's driver has a different PostgreSQL result type.
        database as unknown as SessionStore["db"],
    }),
});

const input = {
  agentToken: "not-persisted",
  appId,
  hostUrl: "https://host.test",
  messages: [],
  model: "fixture",
  threadId,
};

const lease = async () => {
  const [row] = await database
    .select()
    .from(appAgentLease)
    .where(eq(appAgentLease.appId, appId));

  return row;
};

const activeRun = async () => {
  const row = await lease();

  return row?.activeRunId;
};

beforeAll(async () => {
  await client.exec("CREATE TABLE app (id uuid PRIMARY KEY)");
  const root = new URL("../../db/src/migrations/", import.meta.url);

  const names = await readdir(root);

  const entries = names
    .filter(
      (name) =>
        name.endsWith("_app-agent-sessions") || name.endsWith("_agent-threads")
    )
    .toSorted();

  const migrations = await Promise.all(
    entries.map(
      async (entry) =>
        await readFile(new URL(`${entry}/migration.sql`, root), "utf-8")
    )
  );

  for (const migration of migrations) {
    // oxlint-disable-next-line no-await-in-loop -- Apply production migrations in order.
    await client.exec(migration);
  }

  await client.query("INSERT INTO app (id) VALUES ($1)", [appId]);
});

beforeEach(async () => {
  events.length = 0;
  status = "running";
  deleteFails = false;
  await client.exec("TRUNCATE app_agent_lease, app_agent_thread");
  await database.insert(appAgentThread).values([
    { appId, id: threadId },
    { appId, id: otherThreadId },
  ]);
});

afterAll(async () => {
  await client.close();
});

it("saves native coordinates without credentials and holds a single app writer", async () => {
  const state = await lifecycle.startTurn(input, "wrun_first");
  expect(state).toEqual({
    sessionId: "wrun_native",
    type: "libfx",
    version: 1,
  });
  expect(await activeRun()).toBe("wrun_first");
  expect(
    JSON.stringify(await lifecycle.getThreadSession(appId, threadId))
  ).not.toContain(input.agentToken);
  await expect(
    lifecycle.startTurn({ ...input, threadId: otherThreadId }, "wrun_other")
  ).rejects.toThrow("already being edited");

  const context: AppToolContext = {
    appId,
    grant: {
      appId,
      cliTokenId: "grant",
      projectId: "project",
      scope: { name: "tenant", value: {} },
    },
    runId: "wrun_first",
    threadId,
  };

  await lifecycle.assertSessionOwnership(context, state.sessionId);
  await expect(
    lifecycle.assertSessionOwnership(context, "wrun_intruder")
  ).rejects.toThrow("does not own");
});

it("stops a completed sandbox before releasing ownership and preserves the conversation", async () => {
  await lifecycle.startTurn(input, "wrun_first");
  await lifecycle.finishTurn(appId, "wrun_first");
  expect(events).toEqual(["prepare", "stop"]);
  expect(await activeRun()).toBeNull();
  expect(await lifecycle.getThreadSession(appId, threadId)).toBeDefined();
  await lifecycle.startTurn(input, "wrun_next");
  await lifecycle.finishTurn(appId, "wrun_first");
  expect(await activeRun()).toBe("wrun_next");
  expect(events).toEqual(["prepare", "stop", "prepare"]);
});

it("retains the lease after failed cleanup, then safely retries and invalidates the cancelled thread", async () => {
  await lifecycle.startTurn(input, "wrun_first");
  deleteFails = true;
  await expect(lifecycle.cancelTurn(appId, "wrun_first")).rejects.toThrow(
    "Sandbox unavailable"
  );
  expect(await activeRun()).toBe("wrun_first");
  deleteFails = false;
  await lifecycle.cancelTurn(appId, "wrun_first");
  expect(events).toEqual([
    "prepare",
    "cancel:wrun_native",
    "delete",
    "cancel:wrun_native",
    "delete",
  ]);
  expect(await activeRun()).toBeNull();
  await expect(lifecycle.getThreadSession(appId, threadId)).rejects.toThrow(
    "Start a new thread"
  );
  await lifecycle.cancelTurn(appId, "wrun_first");
  expect(events).toHaveLength(5);
});

it("reconciles externally cancelled workflows without touching a running turn", async () => {
  await lifecycle.startTurn(input, "wrun_first");
  await lifecycle.reconcileTurns();
  expect(events).toEqual(["prepare"]);
  status = "cancelled";
  await lifecycle.reconcileTurns();
  expect(events).toEqual(["prepare", "cancel:wrun_native", "delete"]);
  expect(await activeRun()).toBeNull();
});

it("cleans the recorded sandbox and releases ownership even if the thread was deleted", async () => {
  await lifecycle.startTurn(input, "wrun_first");
  await database.delete(appAgentThread).where(eq(appAgentThread.id, threadId));
  status = "cancelled";
  await lifecycle.reconcileTurns();
  expect(events).toEqual(["prepare", "delete"]);
  expect(await activeRun()).toBeNull();
});
