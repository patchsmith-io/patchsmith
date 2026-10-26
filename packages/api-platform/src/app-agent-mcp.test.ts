import { os } from "@orpc/server";
import type { appAgent } from "@patchsmith/agent-fx/workflows";
import { AppAgentThreadError } from "@patchsmith/agent/threads";
import type * as threadsModule from "@patchsmith/agent/threads";
import { verifyAgentToken } from "@patchsmith/api-utils/agent-token";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type { Context } from "./context";
import { env } from "./env";
import { scopeSchema, canonicalizeScope } from "./scope";

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error("Expected a defined value.");
  }

  return value;
};

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  cancel: vi.fn(),
  cleanup: vi.fn(),
  create: vi.fn(),
  grant: vi.fn(),
  list: vi.fn<
    (options: {
      input: {
        body: {
          page: number;
          pageSize: number;
          scopes: (typeof scope.scope)[];
        };
      };
    }) => Promise<{
      body: { items: (typeof app)[]; pagination: { hasMore: boolean } };
    }>
  >(),
  revoke: vi.fn<(value: { revokedAt: Date }) => void>(),
  start: vi.fn<
    (
      workflow: typeof appAgent,
      args: [Parameters<typeof appAgent>[0]],
      options?: { attributes?: Record<string, string> }
    ) => Promise<{
      runId: string;
      cancel?: () => void | Promise<void>;
      getReadable: (...args: never[]) => ReadableStream;
      returnValue: Promise<unknown>;
    }>
  >(),
  thread: vi.fn<(appId: string, threadId?: string) => Promise<string>>(),
}));

vi.mock("@patchsmith/db", () => ({
  db: {
    insert: () => ({
      values: (value: Parameters<typeof mocks.grant>[0]) => {
        mocks.grant(value);

        return {
          returning: vi
            .fn<() => Promise<{ id: string }[]>>()
            .mockResolvedValue([{ id: "grant" }]),
        };
      },
    }),
    query: { app: { findFirst: mocks.app } },
    update: () => ({
      set: (value: Parameters<typeof mocks.revoke>[0]) => ({
        where: () => {
          mocks.revoke(value);
        },
      }),
    }),
  },
}));

vi.mock("./routes/apps", () => ({
  appRouter: {
    list: os
      .input(
        z.object({
          body: z.object({
            page: z.number(),
            pageSize: z.number(),
            scopes: z.array(scopeSchema),
          }),
        })
      )
      .handler(mocks.list),
  },
  createAppRecord: mocks.create,
}));

vi.mock("@patchsmith/agent-fx/workflows", () => ({
  appAgent: vi.fn(),
  cancelAppAgent: mocks.cleanup,
}));

vi.mock("@patchsmith/agent/threads", async (importOriginal) => ({
  ...(await importOriginal<typeof threadsModule>()),
  resolveAppAgentThread: mocks.thread,
}));

vi.mock("workflow/api", () => ({ start: mocks.start }));

vi.mock("@patchsmith/api-utils/dev-delay", () => ({
  devDelayMiddleware: async <TResult>({ next }: { next: () => TResult }) =>
    await next(),
}));

vi.mock("@patchsmith/api-utils/rate-limiting", () => ({
  createRateLimiter: vi.fn(),
  ratelimitMiddleware:
    () =>
    async <TResult>({ next }: { next: () => TResult }) =>
      await next(),
}));

const { handleAppAgentMcpRequest } = await import("./app-agent-mcp");

const scope = canonicalizeScope({ name: "org", value: { tenant: "one" } });
// SAFETY: This test supplies the context members read by the handler; unrelated request context services are outside this scenario.

const context =
  /* oxlint-disable typescript/no-unsafe-type-assertion -- This test supplies the context members read by the handler; unrelated request context services are outside this scenario. */
  {
    organization: { id: "org" },
    project: { id: "project" },
  } as Context;

/* oxlint-enable typescript/no-unsafe-type-assertion */
const identity = { scopes: { org: scope.scope.value }, subjectId: "user" };
const app = { id: "internal-app", scope: scope.scope, shortId: "public-app" };

const request = (
  name: string,
  args: z.infer<ReturnType<typeof z.json>> = {},
  overrides = {},
  headers = {}
) => {
  const contextValue = {
    ...identity,
    hostUrl: "https://host.test/api/patchsmith",
    ...overrides,
  };

  return new Request("https://platform.test/api/platform/app-agent/mcp", {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        _meta: {
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          progressToken: "progress",
        },
        arguments: args,
        name,
      },
    }),
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-method": "tools/call",
      "mcp-name": name,
      "mcp-protocol-version": "2026-07-28",
      "x-patchsmith-context": Buffer.from(
        JSON.stringify(contextValue),
        "utf-8"
      ).toString("base64url"),
      ...headers,
    },
    method: "POST",
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.thread.mockImplementation(
    async (_appId, id) =>
      await Promise.resolve(id ?? "e773a870-df5a-4bea-9ebd-9be4c0b1897a")
  );
  mocks.app.mockResolvedValue(app);
  mocks.create.mockResolvedValue(app);
  mocks.list.mockResolvedValue({
    body: { items: [app], pagination: { hasMore: false } },
  });
  mocks.start.mockResolvedValue({
    cancel: mocks.cancel,
    getReadable: () =>
      new ReadableStream({
        start(controller) {
          for (const chunk of [
            { messageId: "answer", type: "start" },
            { id: "text", type: "text-start" },
            { delta: "Building", id: "text", type: "text-delta" },
            { id: "text", type: "text-end" },
            { type: "finish" },
          ]) {
            controller.enqueue(chunk);
          }

          controller.close();
        },
      }),
    returnValue: Promise.resolve({ finishReason: "stop" }),
    runId: "run",
  });
});

describe("platform MCP endpoint", () => {
  it("lists only host scopes without starting an agent", async () => {
    const response = await handleAppAgentMcpRequest(
      request("list_apps"),
      context
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("public-app");
    expect(requireValue(mocks.list.mock.lastCall)[0].input.body).toEqual({
      page: 1,
      pageSize: 100,
      scopes: [scope.scope],
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("returns a new thread ID by default and accepts it for a follow-up", async () => {
    const threadId = "e773a870-df5a-4bea-9ebd-9be4c0b1897a";

    const first = await handleAppAgentMcpRequest(
      request("edit_app", { appId: "public-app", prompt: "Build calendar" }),
      context
    );

    expect(await first.text()).toContain(threadId);
    expect(mocks.thread.mock.lastCall).toEqual([app.id, undefined]);

    const next = await handleAppAgentMcpRequest(
      request("edit_app", {
        appId: "public-app",
        prompt: "Make events draggable",
        threadId,
      }),
      context
    );

    expect(await next.text()).toContain(threadId);
    expect(mocks.thread).toHaveBeenLastCalledWith(app.id, threadId);
    expect(requireValue(mocks.start.mock.lastCall)[1][0].threadId).toBe(
      threadId
    );
  });

  it("rejects an unavailable conversation without issuing an agent grant", async () => {
    mocks.thread.mockRejectedValueOnce(new AppAgentThreadError());

    const response = await handleAppAgentMcpRequest(
      request("edit_app", {
        appId: "public-app",
        prompt: "Change it",
        threadId: "266f1673-2079-4e0c-9f68-6cf3f0f98a40",
      }),
      context
    );

    expect(await response.text()).toContain("Thread not found");
    expect(mocks.grant).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("starts an authorized editor, streams events, and revokes its grant after cleanup", async () => {
    const response = await handleAppAgentMcpRequest(
      request("edit_app", { appId: "public-app", prompt: "Change it" }),
      context
    );

    const events = await response.text();
    expect(events).toContain("notifications/progress");
    expect(events).toContain("Building");
    expect(events).toContain('"text":"Building"');
    expect(mocks.start).toHaveBeenCalledOnce();
    const [, [input]] = requireValue(mocks.start.mock.lastCall);
    expect(input).toMatchObject({
      appId: app.id,
      hostUrl: "https://host.test/api/patchsmith",
      messages: [{ content: "Change it", role: "user" }],
      model: "openai/gpt-6.1-sol",
    });
    expect(
      await verifyAgentToken(
        input.agentToken,
        requireValue(env.AUTH_SECRET),
        requireValue(env.OPENAPI_SERVER_URL)
      )
    ).toMatchObject({
      appId: app.id,
      cliTokenId: "grant",
      projectId: "project",
      scope: scope.scope,
    });
    expect(input.schema).toBeUndefined();
    expect(
      requireValue(mocks.start.mock.lastCall)[2]?.attributes
    ).toMatchObject({
      "patchsmith.subjectId": "user",
    });
    expect(requireValue(mocks.grant.mock.lastCall)[0]).toMatchObject({
      projectId: "project",
      scope: scope.scope,
      scopeKey: scope.scopeKey,
    });
    expect(mocks.revoke).toHaveBeenCalledOnce();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("creates the installation in a host scope before launching its builder agent", async () => {
    const response = await handleAppAgentMcpRequest(
      request("create_app", { name: "Todo", prompt: "Build it", scope: "org" }),
      context
    );

    await response.text();
    expect(requireValue(mocks.create.mock.lastCall)[1]).toEqual({
      description: null,
      name: "Todo",
      scope: scope.scope,
    });
    expect(requireValue(mocks.create.mock.lastCall)[2]).toBe(true);
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it.each(["create_app", "edit_app"])(
    "returns a compact %s result without assembling or forwarding internal transcripts",
    async (name) => {
      mocks.start.mockResolvedValueOnce({
        cancel: mocks.cancel,
        getReadable: () =>
          new ReadableStream({
            start(controller) {
              for (const chunk of [
                {
                  delta: "Private reasoning".repeat(10_000),
                  id: "reason",
                  type: "reasoning-delta",
                },
                {
                  input: {
                    content: "Large source code".repeat(10_000),
                    file_path: "src/app.tsx",
                  },
                  toolCallId: "write",
                  toolName: "write",
                  type: "tool-input-available",
                },
                {
                  output: "Large tool output".repeat(10_000),
                  toolCallId: "write",
                  type: "tool-output-available",
                },
                {
                  delta: "Published your app.",
                  id: "text",
                  type: "text-delta",
                },
                { id: "text", type: "text-end" },
                { delta: "Ready for review.", id: "next", type: "text-delta" },
                { id: "next", type: "text-end" },
                { type: "finish" },
              ]) {
                controller.enqueue(chunk);
              }

              controller.close();
            },
          }),
        returnValue: Promise.resolve({
          finishReason: "stop",
          messages: "Internal transcript".repeat(10_000),
          sessionId: "internal-session",
          usage: { inputTokens: 100_000 },
        }),
        runId: "run",
      });

      const response = await handleAppAgentMcpRequest(
        request(
          name,
          name === "create_app"
            ? { name: "App", prompt: "Build it", scope: "org" }
            : { appId: "public-app", prompt: "Change it" }
        ),
        context
      );

      const body = await response.text();

      const final = body
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) =>
          z
            .object({
              result: z
                .object({
                  content: z.array(
                    z.object({ text: z.string(), type: z.literal("text") })
                  ),
                  structuredContent: z.json(),
                })
                .optional(),
            })
            .parse(JSON.parse(line.slice(5)))
        )
        .find(({ result }) => result !== undefined)?.result;

      expect(final?.structuredContent).toEqual({
        answer: "Published your app.\n\nReady for review.",
        appId: "public-app",
        finishReason: "stop",
        runId: "run",
        threadId: "e773a870-df5a-4bea-9ebd-9be4c0b1897a",
      });
      expect(final?.content).toHaveLength(1);
      expect(body.length).toBeLessThan(5000);

      for (const internal of [
        "Private reasoning",
        "Large source code",
        "Large tool output",
        "Internal transcript",
        "internal-session",
        "inputTokens",
      ]) {
        expect(body).not.toContain(internal);
      }
    }
  );

  it.each(["error", "abort"])(
    "cancels and cleans up after a streamed %s",
    async (type) => {
      mocks.start.mockResolvedValueOnce({
        cancel: mocks.cancel,
        getReadable: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue({ errorText: "Private diagnostics", type });
              controller.close();
            },
          }),
        returnValue: Promise.resolve({ finishReason: "stop" }),
        runId: "run",
      });

      const response = await handleAppAgentMcpRequest(
        request("edit_app", { appId: "public-app", prompt: "Change it" }),
        context
      );

      const body = await response.text();
      expect(body).toContain('"isError":true');
      expect(body).not.toContain("Private diagnostics");
      expect(mocks.cancel).toHaveBeenCalledOnce();
      expect(mocks.cleanup).toHaveBeenCalledWith(app.id, "run");
      expect(mocks.revoke).toHaveBeenCalledOnce();
    }
  );

  it("rejects unauthorized app/scope selections without grants or agents", async () => {
    mocks.app.mockResolvedValue(null);

    const missing = await handleAppAgentMcpRequest(
      request("edit_app", { appId: "other", prompt: "Change" }),
      context
    );

    expect(await missing.text()).toContain('"isError":true');

    const invalid = await handleAppAgentMcpRequest(
      request("create_app", { name: "Todo", prompt: "Build", scope: "other" }),
      context
    );

    expect(await invalid.text()).toContain('"isError":true');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.grant).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("rejects service/agent credentials and malformed host identities", async () => {
    await Promise.all(
      [{ runtimeService: true }, { agentToken: {} }].map(async (restricted) => {
        // SAFETY: This test supplies the context members read by the handler; unrelated request context services are outside this scenario.

        const awaitedResult1 = await handleAppAgentMcpRequest(
          request("list_apps"),

          /* oxlint-disable typescript/no-unsafe-type-assertion -- This test supplies the context members read by the handler; unrelated request context services are outside this scenario. */
          {
            ...context,
            ...restricted,
          } as Context
          /* oxlint-enable typescript/no-unsafe-type-assertion */
        );

        expect(awaitedResult1.status).toBe(403);
      })
    );
    await Promise.all(
      [
        { scopes: {} },
        { subjectId: undefined },
        { subjectId: null },
        { subjectId: "" },
        { subjectId: 123 },
        { subjectId: "x".repeat(257) },
        { scopes: { org: {} } },
      ].map(async (invalid) => {
        const awaitedResult2 = await handleAppAgentMcpRequest(
          request("list_apps", {}, invalid),
          context
        );

        expect(awaitedResult2.status).toBe(400);
      })
    );
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("rejects malformed/oversized context headers and cross-origin requests", async () => {
    await Promise.all(
      ["", "not+base64", "eyJ9=", "x".repeat(8193), "_w"].map(
        async (encoded) => {
          const awaitedResult3 = await handleAppAgentMcpRequest(
            request("list_apps", {}, {}, { "x-patchsmith-context": encoded }),
            context
          );

          expect(awaitedResult3.status).toBe(400);
        }
      )
    );

    const unexpected = await handleAppAgentMcpRequest(
      request("list_apps", {}, { schema: {} }),
      context
    );

    expect(unexpected.status).toBe(400);

    const origin = await handleAppAgentMcpRequest(
      request("list_apps", {}, {}, { origin: "https://other.test" }),
      context
    );

    expect(origin.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("keeps header context authoritative when tool arguments try to inject scopes", async () => {
    const response = await handleAppAgentMcpRequest(
      request("edit_app", {
        appId: "public-app",
        prompt: "Change",
        scopes: { org: { tenant: "other" } },
        subjectId: "other-user",
      }),
      context
    );

    expect(await response.text()).toContain('"isError":true');
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("cancels the workflow and deletes its sandbox when the response closes", async () => {
    let revoked!: () => void;

    const revocation = (async () => {
      const {
        promise: pendingPromise,
        resolve,
        reject: rejectPending,
      } = Promise.withResolvers<ReturnType<() => void>>();

      try {
        revoked = resolve;
      } catch (error) {
        rejectPending(error);
      }

      await pendingPromise;
    })();

    mocks.revoke.mockImplementation(revoked);
    mocks.start.mockResolvedValueOnce({
      cancel: mocks.cancel,
      getReadable: () => new ReadableStream(),
      returnValue: Promise.withResolvers().promise,
      runId: "run",
    });

    const response = await handleAppAgentMcpRequest(
      request("edit_app", { appId: "public-app", prompt: "Change" }),
      context
    );

    const reader = requireValue(response.body).getReader();
    await reader.read();
    await reader.cancel();
    await revocation;
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.cleanup).toHaveBeenCalledWith(app.id, "run");
  });

  it("waits for workflow cleanup before sending the terminal result", async () => {
    let finish!: () => void;

    const returnValue = (async () => {
      const {
        promise: pendingPromise,
        resolve,
        reject: rejectPending,
      } = Promise.withResolvers<{ finishReason: "stop" }>();

      try {
        finish = () => {
          resolve({ finishReason: "stop" });
        };
      } catch (error) {
        rejectPending(error);
      }

      return await pendingPromise;
    })();

    mocks.start.mockResolvedValueOnce({
      cancel: mocks.cancel,
      getReadable: () =>
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      returnValue,
      runId: "run",
    });

    const response = await handleAppAgentMcpRequest(
      request("edit_app", { appId: "public-app", prompt: "Change" }),
      context
    );

    const reader = requireValue(response.body).getReader();
    await reader.read();
    const final = reader.read();
    expect(mocks.revoke).not.toHaveBeenCalled();
    finish();
    await final;

    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Read or renew in sequence; the next operation depends on this result.
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }
      /* drain */
    }

    expect(mocks.revoke).toHaveBeenCalledOnce();
  });

  it("cancels an unfinished agent after a stream failure while the request stays active", async () => {
    const input = request("edit_app", {
      appId: "public-app",
      prompt: "Change",
    });

    mocks.start.mockResolvedValueOnce({
      cancel: mocks.cancel,
      getReadable: () =>
        new ReadableStream({
          start(controller) {
            controller.error(new Error("Agent stream failed"));
          },
        }),
      returnValue: Promise.withResolvers().promise,
      runId: "run",
    });
    const response = await handleAppAgentMcpRequest(input, context);
    expect(await response.text()).toContain("Agent stream failed");
    expect(input.signal.aborted).toBe(false);
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.cleanup).toHaveBeenCalledWith(app.id, "run");
    expect(mocks.revoke).toHaveBeenCalledOnce();
  });

  it("still deletes the sandbox and revokes the grant when workflow cancellation fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.cancel.mockRejectedValueOnce(new Error("Cancellation unavailable"));
    mocks.start.mockResolvedValueOnce({
      cancel: mocks.cancel,
      getReadable: () =>
        new ReadableStream({
          start(controller) {
            controller.error(new Error("Agent stream failed"));
          },
        }),
      returnValue: Promise.withResolvers().promise,
      runId: "run",
    });

    try {
      const response = await handleAppAgentMcpRequest(
        request("edit_app", { appId: "public-app", prompt: "Change" }),
        context
      );

      const events = await response.text();
      expect(events).toContain("Agent stream failed");
      expect(events).not.toContain("Cancellation unavailable");
      expect(warning).toHaveBeenCalledOnce();
      expect(mocks.cleanup).toHaveBeenCalledWith(app.id, "run");
      expect(mocks.revoke).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });

  it("surfaces setup failures without waiting for an unopened model stream", async () => {
    mocks.start.mockResolvedValueOnce({
      cancel: mocks.cancel,
      getReadable: () => new ReadableStream(),
      get returnValue() {
        return Promise.reject(new Error("This app is already being edited."));
      },
      runId: "run",
    });

    const response = await handleAppAgentMcpRequest(
      request("edit_app", { appId: "public-app", prompt: "Change" }),
      context
    );

    expect(await response.text()).toContain("already being edited");
    expect(mocks.revoke).toHaveBeenCalledOnce();
  });
});
