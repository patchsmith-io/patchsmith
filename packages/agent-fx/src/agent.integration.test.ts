import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";

import {
  harnessSessionDataDirectoryPath,
  harnessStateDirectoryPath,
} from "@ai-sdk/harness";
import { readUIMessageStream } from "ai";
import type { UIMessageChunk } from "ai";
import { expect, it, vi } from "vite-plus/test";

import { env } from "#env";

import { createAppAgent } from "./agent";
import { localSession } from "./fixtures/local-sandbox";
import { runAppAgentTurn } from "./run-turn";

const { join } = nodePath;

const gatewayEvents = (requestIndex: number, text: string) => {
  const first = requestIndex === 1;
  const second = requestIndex === 2;
  const toolCall = first || second;

  const parts = [
    { type: "stream-start", warnings: [] },
    ...(toolCall
      ? [
          {
            input: JSON.stringify(
              first
                ? { content: "First turn", file_path: "example.txt" }
                : {
                    command:
                      "printf 'once\\n' >> executions.txt; cat example.txt",
                  }
            ),
            toolCallId: first ? "write-1" : "bash-2",
            toolName: first ? "write" : "bash",
            type: "tool-call",
          },
        ]
      : [
          { id: "text-1", type: "text-start" },
          { delta: text, id: "text-1", type: "text-delta" },
          { id: "text-1", type: "text-end" },
        ]),
    {
      finishReason: {
        raw: toolCall ? "tool_calls" : "stop",
        unified: toolCall ? "tool-calls" : "stop",
      },
      type: "finish",
      usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } },
    },
  ];

  return parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join("");
};

it.each(["api-key", "runtime-oidc", "environment-oidc"])(
  "runs a whole turn and restores the next conversation with %s",
  async (mode) => {
    const originalEnv = { ...env };
    delete env.AI_GATEWAY_API_KEY;
    delete env.VERCEL_OIDC_TOKEN;
    env.AI_GATEWAY_BASE_URL = "https://gateway.test";

    const token =
      mode === "api-key"
        ? "local-test-token"
        : `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`;

    // libfx 0.0.13 caches libc's environment pointer on Linux. Supply test
    // credentials through #env to avoid invalidating it between native sessions.
    if (mode === "api-key") {
      env.AI_GATEWAY_API_KEY = token;
    }

    if (mode === "environment-oidc") {
      env.VERCEL_OIDC_TOKEN = token;
    }

    vi.stubGlobal(Symbol.for("@vercel/request-context"), {
      get: () => ({
        headers:
          mode === "runtime-oidc" ? { "x-vercel-oidc-token": token } : {},
      }),
    });

    const directory = await realpath(
      await mkdtemp(join(tmpdir(), "patchsmith-fx-"))
    );

    const workspace = join(directory, "app");
    const sessionHome = join(directory, "home");
    await mkdir(workspace);
    await mkdir(sessionHome);

    const requests: {
      body: string;
      authorization: string | null;
      url: string;
    }[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, options) => {
        const request = new Request(url, options);

        if (request.method === "GET") {
          return Response.json({
            data: [
              {
                id: "openai/gpt-6.1-sol",
                reasoning_options: [
                  { type: "effort", values: ["low", "medium", "high"] },
                ],
                type: "language",
              },
            ],
          });
        }

        const body = await request.text();
        requests.push({
          authorization: request.headers.get("authorization"),
          body,
          url: request.url,
        });

        return new Response(
          gatewayEvents(
            requests.length,
            body.includes("Now update it") ? "Updated" : "Built"
          ),
          { headers: { "content-type": "text/event-stream" } }
        );
      })
    );

    const input = {
      agentToken: "private-deployment-token",
      appId: randomUUID(),
      hostUrl: "https://host.test/api/patchsmith",
      instructions: "Use the host purple palette and compact layouts.",
      messages: [],
      model: "openai/gpt-6.1-sol",
      threadId: randomUUID(),
    };

    const sandboxSession = localSession(workspace, sessionHome);

    let session:
      | Awaited<
          ReturnType<
            Awaited<ReturnType<typeof createAppAgent>>["createSession"]
          >
        >
      | undefined;

    try {
      const agent = await createAppAgent(input, "fixture");
      expect(agent.harnessId).toBe("fx");
      expect(requests).toHaveLength(0);
      const chunks: UIMessageChunk[] = [];

      const state = await runAppAgentTurn({
        agent,
        messages: [{ content: "Build a file", role: "user" }],
        sandboxSession,
        sessionId: input.threadId,
        signal: AbortSignal.timeout(10_000),
        writable: new WritableStream<UIMessageChunk>({
          write(chunk) {
            chunks.push(chunk);
          },
        }),
      });

      // Consume the same stock AI SDK event sequence as chat and MCP.
      const stream = new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }

          controller.close();
        },
      });

      let finalMessage;

      for await (const message of readUIMessageStream({
        stream,
        terminateOnError: true,
      })) {
        finalMessage = message;
      }

      expect(finalMessage?.parts).toContainEqual({
        state: "done",
        text: "Built",
        type: "text",
      });
      expect(
        chunks.filter((chunk) => chunk.type === "tool-input-available")
      ).toHaveLength(2);
      expect(
        chunks.filter((chunk) => chunk.type === "tool-output-available")
      ).toHaveLength(2);
      expect(await readFile(join(workspace, "executions.txt"), "utf-8")).toBe(
        "once\n"
      );
      expect(chunks.filter((chunk) => chunk.type === "start")).toHaveLength(1);
      expect(chunks.filter((chunk) => chunk.type === "finish")).toHaveLength(1);
      expect(chunks).toContainEqual(
        expect.objectContaining({
          input: { content: "First turn", file_path: "example.txt" },
          toolName: "write",
          type: "tool-input-available",
        })
      );
      expect(chunks).toContainEqual(
        expect.objectContaining({ type: "tool-output-available" })
      );
      expect(chunks).toContainEqual(
        expect.objectContaining({ delta: "Built", type: "text-delta" })
      );
      const { resumeFrom } = state;

      if (resumeFrom === undefined) {
        throw new Error("Missing fx resume state");
      }

      expect(resumeFrom.harnessId).toBe("fx");
      expect(JSON.stringify(resumeFrom)).not.toContain(token);

      const savedState = await readFile(
        join(
          harnessSessionDataDirectoryPath({
            sessionId: input.threadId,
            stateDirectory: harnessStateDirectoryPath({
              sandboxHomeDir: sessionHome,
            }),
          }),
          "fx/state.json"
        ),
        "utf-8"
      );

      expect(savedState).not.toContain(token);
      expect(savedState).not.toContain(input.agentToken);

      const nextAgent = await createAppAgent(
        {
          ...input,
          agentToken: "fresh-deployment-token",
          instructions: "Use the updated host blue palette.",
        },
        "fixture"
      );

      session = await nextAgent.createSession({
        resumeFrom,
        sandboxSession,
        sessionId: input.threadId,
      });

      const next = await nextAgent.generate({
        prompt: "Now update it",
        session,
      });

      expect(next.text).toBe("Updated");
      expect(requests.at(-1)?.body).toContain("Build a file");
      expect(requests.at(-1)?.body).toContain("Now update it");
      expect(requests.at(-1)?.body).toContain(
        "Use the updated host blue palette."
      );

      for (const request of requests) {
        expect(JSON.parse(request.body)).toMatchObject({
          reasoning: "low",
        });
        expect(request.url).toBe("https://gateway.test/v4/ai/language-model");
        expect(request.authorization).toBe(`Bearer ${token}`);
        expect(request.body).not.toContain("private-deployment-token");
        expect(request.body).not.toContain(token);
      }

      for (const name of [
        "patchsmith-frontend",
        "patchsmith-views",
        "patchsmith-functions",
        "patchsmith-database",
      ]) {
        expect(requests[0]?.body).toContain(name);
      }

      expect(requests[0]?.body).toContain(input.instructions);
      expect(requests[0]?.body).toContain(
        "Regeneration uses the configured host URL."
      );
      expect(requests[0]?.body).toContain("deploy");
      expect(requests[0]?.body).not.toContain("src/functions/notes.router.ts");
    } finally {
      await session?.destroy();
      delete env.AI_GATEWAY_API_KEY;
      delete env.AI_GATEWAY_BASE_URL;
      delete env.VERCEL_OIDC_TOKEN;
      Object.assign(env, originalEnv);
      vi.unstubAllGlobals();
      await rm(directory, { force: true, recursive: true });
    }
  },
  30_000
);
