import { execFile } from "node:child_process";
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

import { readUIMessageStream } from "ai";
import type { UIMessageChunk } from "ai";
import { local } from "libfx/durable-local";
import { expect, it } from "vite-plus/test";

import { createAppAgent, getAppInstructions } from "./agent";
import type { AppSandboxSession } from "./sandbox-session";
import { readSessionLines, toUIChunks } from "./stream";
import { createSandboxTools } from "./tools";

const { join } = nodePath;

// oxlint-disable-next-line typescript/strict-void-return -- promisify consumes execFile's callback, not the ChildProcess return value.
const execute = promisify(execFile);

const gatewayEvents = (index: number) => {
  const tool = index < 3;
  const first = index === 1;

  const parts = [
    { type: "stream-start", warnings: [] },
    ...(tool
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
          { id: "text", type: "text-start" },
          {
            delta: index === 3 ? "Built" : "Updated",
            id: "text",
            type: "text-delta",
          },
          { id: "text", type: "text-end" },
        ]),
    {
      finishReason: {
        raw: tool ? "tool_calls" : "stop",
        unified: tool ? "tool-calls" : "stop",
      },
      type: "finish",
      usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } },
    },
  ];

  return parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join("");
};

it("persists native turns, replays UI events and reuses completed tool results without a harness patch", async () => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "patchsmith-native-fx-"))
  );

  const workspace = join(directory, "workspace");
  await mkdir(join(workspace, "app"), { recursive: true });
  const requests: string[] = [];

  const session: AppSandboxSession = {
    readFileToBuffer: async ({ path }) =>
      await readFile(path.replace("/workspace", workspace)).catch(() => null),
    runCommand: async ({ args = [], signal }) => {
      const result = await execute(
        "bash",
        args.map((arg) => arg.replaceAll("/workspace", workspace)),
        {
          cwd: join(workspace, "app"),
          env: {
            PATH: "/opt/homebrew/opt/coreutils/libexec/gnubin:/usr/bin:/bin",
          },
          signal,
        }
      );

      return {
        exitCode: 0,
        stderr: async () => await Promise.resolve(result.stderr),
        stdout: async () =>
          await Promise.resolve(
            result.stdout.replaceAll(workspace, "/workspace")
          ),
      };
    },
    writeFiles: async (files) => {
      for (const file of files) {
        // oxlint-disable-next-line no-await-in-loop -- Preserve the sandbox write batch order.
        await writeFile(
          file.path.replace("/workspace", workspace),
          file.content
        );
      }
    },
  };

  const tools = createSandboxTools({
    deploy: () => {
      throw new Error("This fixture does not publish.");
    },
    session: async () => await Promise.resolve(session),
  });

  const options = {
    apiKey: "fixture-key",
    durability: local({ dir: join(directory, "sessions") }),
    fetch: async (_url: string, init: RequestInit) => {
      requests.push(await new Request(_url, init).text());

      return new Response(gatewayEvents(requests.length), {
        headers: { "content-type": "text/event-stream" },
      });
    },
    model: "openai/gpt-6.1-sol",
    modelCatalog: [{ id: "openai/gpt-6.1-sol", type: "language" }],
    name: "integration",
    tools,
  };

  let agent = createAppAgent(options);

  try {
    const sessionId = await agent.newSessionId();

    const input = {
      agentToken: "private-token",
      appId: "fixture",
      hostUrl: "https://host.test/api/patchsmith",
      instructions: "Use a purple palette.",
      messages: [],
      model: options.model,
      threadId: "fixture",
    };

    const turn = agent
      .session(sessionId, { instructions: getAppInstructions(input) })
      .prompt("Build a file", { messageId: "wrun_first" });

    await turn.accepted;
    const firstResult = await turn.result;
    expect(firstResult.stopReason).toBe("end_turn");
    expect(await readFile(join(workspace, "app/example.txt"), "utf-8")).toBe(
      "First turn"
    );
    expect(await readFile(join(workspace, "app/executions.txt"), "utf-8")).toBe(
      "once\n"
    );
    expect(requests).toHaveLength(3);

    const chunks: UIMessageChunk[] = [];

    for await (const line of readSessionLines(
      agent.session(sessionId).stream()
    )) {
      chunks.push(...toUIChunks(line, "wrun_first"));

      if (line.type === "turn_end" && line.messageId === "wrun_first") {
        break;
      }
    }

    let finalMessage;

    for await (const message of readUIMessageStream({
      stream: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }

          controller.close();
        },
      }),
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

    await agent.close();
    agent = createAppAgent(options);

    const repeated = agent
      .session(sessionId)
      .prompt("Build a file", { messageId: "wrun_first" });

    const repeatedResult = await repeated.result;
    expect(repeatedResult.repeated).toBe(true);
    expect(requests).toHaveLength(3);
    expect(await readFile(join(workspace, "app/executions.txt"), "utf-8")).toBe(
      "once\n"
    );

    const next = agent
      .session(sessionId, { instructions: "Use a blue palette." })
      .prompt("Now update it", { messageId: "wrun_second" });

    const nextResult = await next.result;
    expect(nextResult.stopReason).toBe("end_turn");
    expect(requests.at(-1)).toContain("Now update it");
    expect(requests.at(-1)).toContain("Build a file");
    expect(requests.at(-1)).toContain("Use a blue palette.");
    expect(requests[0]).toContain("patchsmith-frontend");
    expect(requests[0]).not.toContain(input.agentToken);
  } finally {
    await agent.close();
    await rm(directory, { force: true, recursive: true });
  }
}, 30_000);
