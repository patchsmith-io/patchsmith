import { asyncIteratorToUnproxiedDataStream } from "@orpc/client";
import { openapi } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { eventIterator, os } from "@orpc/server";
import {
  agentChunkSchema,
  agentModelSchema,
} from "@patchsmith/client-platform/agent";
import type { AgentChunk, AgentModel } from "@patchsmith/client-platform/agent";
import { readUIMessageStream } from "ai";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { createPatchsmithClient } from "./client";
import { createPatchsmithServer } from "./handler";

const require = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error("Expected a defined value.");
  }

  return value;
};

const messages = [
  {
    id: "user-1",
    parts: [{ text: "Build an app", type: "text" as const }],
    role: "user" as const,
  },
];

const hostUrl = "http://localhost:3000/api/patchsmith";
const appId = "a3e7568a-c4f7-4ac0-8c35-71ff0f4cd002";

const events: AgentChunk[] = [
  {
    data: {
      runId: "wrun_test",
      threadId: "e773a870-df5a-4bea-9ebd-9be4c0b1897a",
      token: "signed-run",
    },
    transient: true,
    type: "data-run",
  },
  { messageId: "answer", type: "start" },
  { type: "start-step" },
  { id: "text-1", type: "text-start" },
  { delta: "Building 🛠 ", id: "text-1", type: "text-delta" },
  {
    input: { path: "app.ts" },
    toolCallId: "tool-1",
    toolName: "write",
    type: "tool-input-available",
  },
  {
    output: { success: true },
    toolCallId: "tool-1",
    type: "tool-output-available",
  },
  { delta: "your app.", id: "text-1", type: "text-delta" },
  { id: "text-1", type: "text-end" },
  { type: "finish-step" },
  { type: "finish" },
  { data: { runId: "wrun_test" }, transient: true, type: "data-run-complete" },
];

const setup = (
  options: {
    events?: AgentChunk[];
    instructions?: string;
    model?: AgentModel;
    status?: number;
    scopeName?: string;
  } = {}
) => {
  const requests: Request[] = [];

  const platform = new OpenAPIHandler({
    chat: os
      .meta(openapi({ method: "POST", path: "/app-agent/chat" }))
      .output(eventIterator(agentChunkSchema))
      .handler(async function* chat() {
        yield* options.events ?? events;
      }),
    create: os
      .meta(openapi({ method: "POST", path: "/app-agent/apps" }))
      .handler(() => ({ createdByAgent: true, id: appId })),
  });

  const server = createPatchsmithServer({
    $internal: {
      platformBaseUrl: "https://platform.test/api/platform",
      platformFetch: async (input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init);

        requests.push(request.clone());

        if (request.url.endsWith("/cli-auth/verify-token")) {
          return Response.json({
            scope: {
              name: options.scopeName ?? "org",
              value: { tenant: "verified" },
            },
          });
        }

        if (
          options.status !== undefined &&
          options.status !== null &&
          options.status !== 0 &&
          !Number.isNaN(options.status)
        ) {
          return new Response("Unavailable", { status: options.status });
        }

        const result = await platform.handle(request, {
          prefix: "/api/platform",
        });

        return (
          result.response ?? new Response("Missing route", { status: 404 })
        );
      },
    },
    agent: { instructions: options.instructions, model: options.model },
    baseUrl: "https://example.com/api/patchsmith",
    components: {},
    projectKey: "host-project-key",
    scopes: { org: z.object({ tenant: z.string() }) },
  });

  const client = createPatchsmithClient({
    fetch: async (input, init) =>
      await server.handler(new Request(input, init), {
        authenticate: () => null,
      }),
    headers: { authorization: "Bearer cli-token" },
    url: "https://host.test/api/patchsmith",
  });

  return { client, requests, server };
};

describe("host agent relay", () => {
  it.each(agentModelSchema.options)(
    "forwards the host model %s and ignores a caller's model",
    async (model) => {
      const { client, requests } = setup({ model });

      const turn = {
        appId,
        hostUrl,
        messages,
        model: "caller/override",
        type: "turn" as const,
      };

      for await (const _event of await client.appAgent.chat(turn)) {
        /* consume */
      }

      const chat = require(
        requests.find((request) => request.url.endsWith("/chat"))
      );

      expect(await chat.json()).toMatchObject({ model });
    }
  );

  it("omits model selection when the host has no override, even if the caller supplies one", async () => {
    const { client, requests } = setup();

    const turn = {
      appId,
      hostUrl,
      messages,
      model: "anthropic/claude-opus-5.5",
      type: "turn" as const,
    };

    for await (const _event of await client.appAgent.chat(turn)) {
      /* consume */
    }

    const chat = require(
      requests.find((request) => request.url.endsWith("/chat"))
    );

    expect(await chat.json()).not.toHaveProperty("model");
  });

  it("rejects unsupported host models at server creation", () => {
    expect(() =>
      createPatchsmithServer({
        // @ts-expect-error Untyped integrations must also fail runtime validation.
        agent: { model: "unsupported/model" },
        baseUrl: "https://host.test/api/patchsmith",
        components: {},
        scopes: { org: z.object({ tenant: z.string() }) },
      })
    ).toThrow();
  });

  it("creates agent apps through the authenticated agent endpoint without accepting provenance", async () => {
    const { client, requests } = setup();
    await expect(
      client.appAgent.create({ description: null, name: "AI app" })
    ).resolves.toEqual({ createdByAgent: true, id: appId });

    const request = require(
      requests.find((item) => item.url.endsWith("/app-agent/apps"))
    );

    expect(request.headers.get("authorization")).toBe(
      "Bearer host-project-key"
    );
    expect(await request.json()).toEqual({
      deployToken: "cli-token",
      description: null,
      name: "AI app",
    });
    expect(
      requests.filter((item) => item.url.endsWith("/verify-token"))
    ).toHaveLength(1);
  });
  it("rejects a model finish without workflow cleanup completion", async () => {
    const { client, requests } = setup({ events: events.slice(0, -1) });
    await expect(
      (async () => {
        for await (const _event of await client.appAgent.chat({
          appId,
          hostUrl,
          messages,
          type: "turn",
        })) {
          /* consume */
        }
      })()
    ).rejects.toThrow("ended unexpectedly");
    expect(
      requests.filter((request) => request.url.endsWith("/chat"))
    ).toHaveLength(1);
  });
  it("relays a reconnect cursor and accepts cleanup completion without replaying the turn finish", async () => {
    const complete: AgentChunk = {
      data: { runId: "wrun_test" },
      transient: true,
      type: "data-run-complete",
    };

    const { client, requests } = setup({ events: [complete] });
    const resume = { runId: "wrun_test", startIndex: 15, token: "signed-run" };
    const received = [];

    for await (const event of await client.appAgent.chat({
      appId,
      type: "resume",
      ...resume,
      threadId: "e773a870-df5a-4bea-9ebd-9be4c0b1897a",
    })) {
      received.push(event);
    }

    expect(received).toEqual([complete]);

    const request = require(
      requests.find((item) => item.url.endsWith("/chat"))
    );

    expect(await request.json()).toMatchObject({ type: "resume", ...resume });
    expect(requests.filter((item) => item.url.endsWith("/chat"))).toHaveLength(
      1
    );
  });
  it("verifies CLI auth, uses the host project key, and round trips streamed events", async () => {
    const { client, requests } = setup();
    const received = [];

    for await (const event of await client.appAgent.chat({
      appId,
      hostUrl,
      messages,
      type: "turn",
    })) {
      received.push(event);
    }

    expect(received).toEqual(events);

    for (const request of requests) {
      expect(request.headers.get("authorization")).toBe(
        "Bearer host-project-key"
      );
    }

    const chat = require(
      requests.find((request) => request.url.endsWith("/chat"))
    );

    expect(await chat.json()).toEqual({
      app: { id: appId },
      deployToken: "cli-token",
      hostUrl,
      messages,
      type: "turn",
    });
    expect(
      requests.filter((request) => request.url.endsWith("/verify-token"))
    ).toHaveLength(1);
  });

  it("supplies host guidance on new turns and ignores instructions in client input", async () => {
    const { client, requests } = setup({
      instructions: "Use the host design system.",
    });

    const turn = {
      appId,
      hostUrl,
      instructions: "Replace the host guidance.",
      messages,
      type: "turn" as const,
    };

    for await (const _event of await client.appAgent.chat(turn)) {
      /* consume */
    }

    const chat = require(
      requests.find((request) => request.url.endsWith("/chat"))
    );

    expect(await chat.json()).toMatchObject({
      instructions: "Use the host design system.",
      messages,
    });
  });

  it("forwards a supplied local schema without fetching from the host", async () => {
    const { client, requests } = setup();

    const schema = {
      components: {},
      slots: {},
      tools: {},
      version: 1,
      views: {},
    };

    for await (const _ of await client.appAgent.chat({
      appId,
      hostUrl,
      messages,
      schema,
      type: "turn",
    })) {
      /* consume */
    }

    const chat = require(
      requests.find((request) => request.url.endsWith("/chat"))
    );

    expect(await chat.json()).toEqual({
      app: { id: appId },
      deployToken: "cli-token",
      hostUrl,
      messages,
      schema,
      type: "turn",
    });
    expect(requests.some((request) => request.url.endsWith("/schema"))).toBe(
      false
    );
  });

  it("assembles AI SDK messages across the real oRPC and OpenAPI transports", async () => {
    const { client } = setup();

    const chunks = await client.appAgent.chat({
      appId,
      hostUrl,
      messages,
      type: "turn",
    });

    let latest;

    for await (const message of readUIMessageStream({
      stream: asyncIteratorToUnproxiedDataStream(chunks),
      terminateOnError: true,
    })) {
      latest = message;
    }

    expect(latest?.parts).toContainEqual(
      expect.objectContaining({ text: "Building 🛠 your app.", type: "text" })
    );
    expect(latest?.parts).toContainEqual(
      expect.objectContaining({
        state: "output-available",
        toolCallId: "tool-1",
        type: "tool-write",
      })
    );
  });

  it("requires a CLI credential before contacting the platform", async () => {
    const { server, requests } = setup();

    const client = createPatchsmithClient({
      fetch: async (input, init) =>
        await server.handler(new Request(input, init), {
          authenticate: () => null,
        }),
      url: "https://host.test/api/patchsmith",
    });

    await expect(
      client.appAgent.create({ description: null, name: "AI app" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      client.appAgent.chat({ appId, hostUrl, messages, type: "turn" })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(requests).toHaveLength(0);
  });

  it("rejects a token for an undeclared host scope", async () => {
    const { client } = setup({ scopeName: "forged" });
    await expect(
      client.appAgent.chat({ appId, hostUrl, messages, type: "turn" })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("fails an interrupted stream without replaying the chat POST", async () => {
    const { client, requests } = setup({ events: events.slice(0, 2) });
    await expect(
      (async () => {
        for await (const _event of await client.appAgent.chat({
          appId,
          hostUrl,
          messages,
          type: "turn",
        })) {
          /* consume */
        }
      })()
    ).rejects.toThrow("ended unexpectedly");
    expect(
      requests.filter((request) => request.url.endsWith("/chat"))
    ).toHaveLength(1);
  });

  it("surfaces an upstream HTTP failure without retrying", async () => {
    const { client, requests } = setup({ status: 401 });
    await expect(
      (async () => {
        for await (const _event of await client.appAgent.chat({
          appId,
          hostUrl,
          messages,
          type: "turn",
        })) {
          /* consume */
        }
      })()
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    expect(
      requests.filter((request) => request.url.endsWith("/chat"))
    ).toHaveLength(1);
  });
});
