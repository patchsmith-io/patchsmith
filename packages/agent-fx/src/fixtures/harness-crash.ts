import { mkdir } from "node:fs/promises";
import nodePath from "node:path";

import { createFx } from "@ai-sdk/harness-fx";
import { HarnessAgent } from "@ai-sdk/harness/agent";

import { localSession } from "#fixtures/local-sandbox.ts";
import { runAppAgentTurn } from "#run-turn.ts";

const { join } = nodePath;
const [directory, action] = process.argv.slice(2);

if (
  directory === undefined ||
  directory === "" ||
  action === undefined ||
  action === ""
) {
  throw new Error("Expected fixture directory and start/recover action.");
}

const workspace = join(directory, "app");
const home = join(directory, "home");

await mkdir(workspace, { recursive: true });

await mkdir(home, { recursive: true });

const originalSession = localSession(workspace, home);

const run: typeof originalSession.run = async (options) => {
  const result = await originalSession.run(options);

  if (action === "start" && options.command.includes("executions.txt")) {
    // Die after the shell effect, before the harness can save its tool result.
    process.exit(73);
  }

  return result;
};

const sandboxSession = { ...originalSession, run };

let requests = 0;

globalThis.fetch = async (url, init) => {
  const request = new Request(url, init);

  if (request.method === "GET") {
    return Response.json({
      data: [{ id: "openai/gpt-6.1-sol", type: "language" }],
    });
  }

  await request.text();
  requests += 1;
  const tool = requests === 1;

  const parts = [
    { type: "stream-start", warnings: [] },
    ...(tool
      ? [
          {
            input: JSON.stringify(
              action === "start"
                ? {
                    command:
                      "printf 'once\\n' >> executions.txt; printf saved > artifact.txt",
                  }
                : { file_path: "artifact.txt" }
            ),
            toolCallId: "call1",
            toolName: action === "start" ? "bash" : "read",
            type: "tool-call",
          },
        ]
      : [
          { id: "text1", type: "text-start" },
          {
            delta: "Recovered from saved source",
            id: "text1",
            type: "text-delta",
          },
          { id: "text1", type: "text-end" },
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

  return new Response(
    parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } }
  );
};

const agent = new HarnessAgent({
  harness: createFx({
    auth: {
      AI_GATEWAY_API_KEY: "fixture",
      AI_GATEWAY_BASE_URL: "https://fixture.test",
    },
  }),
  model: "openai/gpt-6.1-sol",
  sandboxConfig: { workDir: "." },
});

const result = await runAppAgentTurn({
  agent,
  messages: [
    {
      content:
        action === "start"
          ? "Write an artifact"
          : "Inspect the existing source and recover",
      role: "user",
    },
  ],
  sandboxSession,
  sessionId: action === "start" ? "interrupted" : "new-conversation",
  signal: AbortSignal.timeout(10_000),
  writable: new WritableStream(),
});

console.log(JSON.stringify({ finishReason: result.finishReason, requests }));
