import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
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
import type { Experimental_SandboxSession } from "ai";
import { expect, it, vi } from "vite-plus/test";

import { createAppAgent } from "./agent";
import { appAgentSkills } from "./skills";

const authentication = vi.hoisted(() => {
  const env: Record<string, string> = {};

  return { env };
});

vi.mock("#env", () => ({ env: authentication.env }));

const { dirname, join } = nodePath;

// oxlint-disable-next-line typescript/strict-void-return -- execFile also returns a ChildProcess; promisify consumes its completion callback, not that return value.
const execute = promisify(execFile);

const bytes = async (path: string) => await readFile(path).catch(() => null);

const write = async (path: string, content: Uint8Array | string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

/** Fixed test commands execute only against a disposable local workspace. */
const localSession = (
  workspace: string,
  sessionHome: string
): Experimental_SandboxSession => ({
  description: "Disposable local integration fixture",
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
  run: async ({ command, env, workingDirectory, abortSignal }) => {
    if (command === 'printf "%s" "$HOME"') {
      return { exitCode: 0, stderr: "", stdout: sessionHome };
    }

    const { stdout, stderr } = await execute("bash", ["-c", command], {
      cwd: workingDirectory ?? workspace,
      env: { PATH: "/usr/bin:/bin", ...env },
      signal: abortSignal,
    });

    return { exitCode: 0, stderr, stdout };
  },
  spawn: () => {
    throw new Error(
      "Pi should use the filesystem/shell API, not spawn a bridge."
    );
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

const messageEvents = (call: number, text: string) => {
  const first = call === 1;

  const item = first
    ? {
        arguments: JSON.stringify({
          content: "First turn",
          file_path: "example.txt",
        }),
        call_id: "write-1",
        id: "fc_write1",
        name: "write",
        type: "function_call",
      }
    : {
        content: [{ annotations: [], text, type: "output_text" }],
        id: `msg_${call}`,
        role: "assistant",
        type: "message",
      };

  const events = [
    { response: { id: `resp_${call}` }, type: "response.created" },
    { item, output_index: 0, type: "response.output_item.added" },
    ...(first
      ? []
      : [
          {
            content_index: 0,
            item_id: item.id,
            output_index: 0,
            part: { annotations: [], text: "", type: "output_text" },
            type: "response.content_part.added",
          },
          {
            content_index: 0,
            delta: text,
            item_id: item.id,
            output_index: 0,
            type: "response.output_text.delta",
          },
        ]),
    { item, output_index: 0, type: "response.output_item.done" },
    {
      response: {
        id: `resp_${call}`,
        output: [item],
        status: "completed",
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      },
      type: "response.completed",
    },
  ];

  return events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
};

it.each([
  { mode: "api-key", modelId: "openai/gpt-6.1-sol" },
  { mode: "runtime-oidc", modelId: "openai/gpt-6.1-sol" },
  { mode: "api-key", modelId: "openai/gpt-6.1-sol-fast" },
  { mode: "runtime-oidc", modelId: "openai/gpt-6.1-sol-fast" },
])(
  "streams typed Pi tools and restores history using $mode authentication and $modelId",
  async ({ mode, modelId }) => {
    authentication.env.AI_GATEWAY_BASE_URL = "https://gateway.test";
    delete authentication.env.AI_GATEWAY_API_KEY;
    delete authentication.env.VERCEL_OIDC_TOKEN;

    const token =
      mode === "api-key"
        ? "local-test-key"
        : `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`;

    if (mode === "api-key") {
      authentication.env.AI_GATEWAY_API_KEY = token;
      authentication.env.VERCEL_OIDC_TOKEN = "unused-oidc-token";
    }

    // Production Vercel Functions expose OIDC through this request context.
    vi.stubGlobal(Symbol.for("@vercel/request-context"), {
      get: () => ({
        headers:
          mode === "runtime-oidc" ? { "x-vercel-oidc-token": token } : {},
      }),
    });

    const directory = await realpath(
      await mkdtemp(join(tmpdir(), "patchsmith-pi-"))
    );

    const workspace = join(directory, "app");
    const sessionHome = join(directory, "home");
    const sessionId = randomUUID();
    const hostJournal = join(tmpdir(), "ai-sdk-harness", "pi", sessionId);
    const otherSessionId = randomUUID();

    const otherHostJournal = join(
      tmpdir(),
      "ai-sdk-harness",
      "pi",
      otherSessionId
    );

    await mkdir(workspace);
    await mkdir(sessionHome);
    const requests: string[] = [];
    const endpoints: { authorization: string | null; url: string }[] = [];
    let modelCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, options) => {
        const request = new Request(url, options);
        const endpoint = new URL(request.url);
        endpoints.push({
          authorization: request.headers.get("authorization"),
          url: `${endpoint.origin}${endpoint.pathname}`,
        });
        requests.push(await request.text());
        modelCalls += 1;

        return new Response(
          messageEvents(
            modelCalls,
            requests.at(-1)?.includes("Now update it") === true
              ? "Updated"
              : "Built"
          ),
          {
            headers: { "content-type": "text/event-stream" },
          }
        );
      })
    );

    const input = {
      agentToken: "private-token",
      appId: randomUUID(),
      hostUrl: "https://host.test/api/patchsmith",
      messages: [],
      model: modelId,
      threadId: sessionId,
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
      expect(agent.harnessId).toBe("pi");
      expect(endpoints).toHaveLength(0);
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
          prompt: "Build a file",
          sessionId,
        }),
        writable: writable(),
      });

      expect(state.status).toBe("ready_for_next_step");
      expect(state.continueFrom).toBeDefined();
      // Pi can begin the next model call before its host receives the step boundary.
      expect(requests.length).toBeGreaterThanOrEqual(1);
      await Promise.all(
        appAgentSkills.map(async (skill) => {
          expect(requests[0]).toContain(skill.name);
          expect(
            await readFile(
              join(sessionHome, ".agents/skills", skill.name, "SKILL.md"),
              "utf-8"
            )
          ).toContain(skill.content.trim());
        })
      );
      expect(chunks.some((chunk) => chunk.type === "finish")).toBe(false);
      await rm(hostJournal, { force: true, recursive: true });
      state = await runHarnessAgentStep({
        agent: await createAppAgent(input, "fixture"),
        sandboxSession,
        state,
        writable: writable(),
      });
      expect(state.status).toBe("finished");
      expect(requests.length).toBeGreaterThanOrEqual(2);
      expect(requests[0]).not.toContain("src/components/todo-editor.tsx");
      expect(requests.at(-1)?.match(/Build a file/gu)).toHaveLength(1);
      expect(chunks.filter((chunk) => chunk.type === "start")).toHaveLength(1);
      expect(chunks.filter((chunk) => chunk.type === "finish")).toHaveLength(1);
      expect(chunks).toContainEqual(
        expect.objectContaining({ delta: "Built", type: "text-delta" })
      );
      expect(chunks).toContainEqual(
        expect.objectContaining({
          input: { content: "First turn", file_path: "example.txt" },
          toolName: "write",
          type: "tool-input-available",
        })
      );
      expect(chunks).toContainEqual(
        expect.objectContaining({
          toolCallId: "write-1|fc_write1",
          type: "tool-output-available",
        })
      );
      expect(await readFile(join(workspace, "example.txt"), "utf-8")).toBe(
        "First turn"
      );
      const { resumeFrom } = state;

      if (resumeFrom === undefined) {
        throw new Error("Missing semantic step resume state");
      }

      expect(resumeFrom.harnessId).toBe("pi");
      expect(JSON.stringify(resumeFrom.data)).toMatch(/\.jsonl/u);
      session = undefined;
      // A different workflow worker cannot rely on the previous worker's files.
      await rm(hostJournal, { force: true, recursive: true });

      const nextAgent = await createAppAgent(
        { ...input, agentToken: "fresh-token" },
        "fixture"
      );

      session = await nextAgent.createSession({
        resumeFrom,
        sandboxSession,
        sessionId,
      });
      const followupIndex = requests.length;

      const next = await nextAgent.generate({
        prompt: "Now update it",
        session,
      });

      expect(next.text).toBe("Updated");
      expect(requests).toHaveLength(followupIndex + 1);
      expect(endpoints).toEqual(
        Array.from({ length: requests.length }, () => ({
          authorization: `Bearer ${token}`,
          url: "https://gateway.test/v1/responses",
        }))
      );

      for (const request of requests) {
        expect(JSON.parse(request)).toMatchObject({
          model: modelId,
          reasoning: { effort: "low" },
        });
        expect(request).not.toContain(token);
        expect(request).not.toContain("private-token");
      }

      expect(requests[followupIndex]).toContain("Build a file");
      expect(requests[followupIndex]).toContain("Built");
      expect(requests[followupIndex]).toContain("Now update it");
      const continuedResume = await session.detach();
      session = undefined;

      const otherAgent = await createAppAgent(
        { ...input, threadId: otherSessionId },
        "other-fixture"
      );

      session = await otherAgent.createSession({
        sandboxSession,
        sessionId: otherSessionId,
      });
      await otherAgent.generate({ prompt: "Different task", session });
      expect(requests.at(-1)).not.toContain("Build a file");
      expect(requests.at(-1)).not.toContain("Now update it");
      await session.destroy();
      session = await nextAgent.createSession({
        resumeFrom: continuedResume,
        sandboxSession,
        sessionId,
      });
      await nextAgent.generate({ prompt: "Back to first thread", session });
      expect(requests.at(-1)).toContain("Build a file");
      expect(requests.at(-1)).toContain("Now update it");
      expect(requests.at(-1)).not.toContain("Different task");
    } finally {
      await session?.destroy();
      vi.unstubAllGlobals();
      await rm(directory, { force: true, recursive: true });
      await rm(hostJournal, { force: true, recursive: true });
      await rm(otherHostJournal, { force: true, recursive: true });
    }
  }
);
