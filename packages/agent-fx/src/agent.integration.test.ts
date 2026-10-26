import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { promisify } from "node:util";

import {
  createHarnessWorkflowState,
  runHarnessAgentStep,
} from "@ai-sdk/workflow-harness";
import type { HarnessWorkflowChunk } from "@ai-sdk/workflow-harness";
import { readUIMessageStream } from "ai";
import type { Experimental_SandboxSession, UIMessageChunk } from "ai";
import { expect, it, vi } from "vite-plus/test";

import { env } from "#env";

import { createAppAgent } from "./agent";

const { dirname, join } = nodePath;

// oxlint-disable-next-line typescript/strict-void-return -- promisify consumes execFile's completion callback, not its ChildProcess return value.
const execute = promisify(execFile);
const bytes = async (path: string) => await readFile(path).catch(() => null);

const write = async (path: string, content: Uint8Array | string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

/** The real fx adapter talks to this disposable filesystem and shell. */
const localSession = (
  workspace: string,
  sessionHome: string
): Experimental_SandboxSession => ({
  description: "Disposable fx integration fixture",
  readBinaryFile: async ({ path }) => await bytes(path),
  readFile: async ({ path }) => {
    const content = await bytes(path);

    return content
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(content);
            controller.close();
          },
        })
      : null;
  },
  readTextFile: async ({ path }) => {
    const content = await bytes(path);

    return content?.toString("utf-8") ?? null;
  },
  run: async ({ command, env: commandEnv, workingDirectory, abortSignal }) => {
    if (command === `printf '%s' "$HOME" | base64 -w0`) {
      return {
        exitCode: 0,
        stderr: "",
        stdout: Buffer.from(sessionHome).toString("base64"),
      };
    }

    const gnu = "/opt/homebrew/opt/coreutils/libexec/gnubin";
    const path = existsSync(gnu) ? `${gnu}:/usr/bin:/bin` : "/usr/bin:/bin";

    const { stdout, stderr } = await execute("bash", ["-c", command], {
      cwd: workingDirectory ?? workspace,
      env: { PATH: path, ...commandEnv },
      signal: abortSignal,
    });

    return { exitCode: 0, stderr, stdout };
  },
  spawn: () => {
    throw new Error("fx must not spawn a sandbox bridge.");
  },
  writeBinaryFile: async ({ path, content }) => {
    await write(path, content);
  },
  writeFile: async ({ path, content }) => {
    const chunks: Uint8Array[] = [];

    for await (const chunk of content) {
      chunks.push(chunk);
    }

    await write(path, Buffer.concat(chunks));
  },
  writeTextFile: async ({ path, content }) => {
    await write(path, content);
  },
});

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

it.each([
  { mode: "api-key", model: "openai/gpt-6.1-sol" },
  { mode: "api-key", model: "anthropic/claude-sonnet-5.5" },
  { mode: "api-key", model: "anthropic/claude-opus-5.5" },
  { mode: "api-key", model: "openai/gpt-6-astra" },
  { mode: "api-key", model: "deepseek/deepseek-v4.1-flash-1017" },
  { mode: "runtime-oidc", model: "openai/gpt-6.1-sol" },
  { mode: "environment-oidc", model: "openai/gpt-6.1-sol" },
])(
  "uses stock fx tools, skills and durable turns with $mode and $model",
  async ({ mode, model }) => {
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
      model: string | null;
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
                id: model,
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
          model: request.headers.get("ai-language-model-id"),
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
      model,
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
      const chunks: HarnessWorkflowChunk[] = [];

      const writable = () =>
        new WritableStream<HarnessWorkflowChunk>({
          write(chunk) {
            chunks.push(chunk);
          },
        });

      let state = await runHarnessAgentStep({
        agent,
        sandboxSession,
        state: createHarnessWorkflowState({
          messages: [{ content: "Build a file", role: "user" }],
          sessionId: input.threadId,
        }),
        writable: writable(),
      });

      expect(state.status).toBe("ready_for_next_step");
      expect(state.continueFrom?.harnessId).toBe("fx");
      expect(chunks.some((chunk) => chunk.type === "finish")).toBe(false);
      expect(await readFile(join(workspace, "example.txt"), "utf-8")).toBe(
        "First turn"
      );
      state = await runHarnessAgentStep({
        agent: await createAppAgent(input, "fixture"),
        sandboxSession,
        state: structuredClone(state),
        writable: writable(),
      });
      expect(state.status).toBe("ready_for_next_step");
      state = await runHarnessAgentStep({
        agent: await createAppAgent(input, "fixture"),
        sandboxSession,
        state: structuredClone(state),
        writable: writable(),
      });
      expect(state.status).toBe("finished");

      // Consume the same event sequence as MCP, including tools after a checkpoint.
      const stream = new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) {
            // SAFETY: These are the UI message chunks returned by the real harness runner.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The runner exposes a structural chunk type to avoid depending on ai.
            controller.enqueue(chunk as UIMessageChunk);
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
          sessionHome,
          ".ai-sdk/harness-fx",
          createHash("sha256").update(input.threadId).digest("hex"),
          "state.json"
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
        expect(request.model).toBe(model);

        if (model === "openai/gpt-6.1-sol") {
          expect(JSON.parse(request.body)).toMatchObject({ reasoning: "low" });
        }

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
