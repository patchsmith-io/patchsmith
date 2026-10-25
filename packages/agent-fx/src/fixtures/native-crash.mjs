import { appendFile, readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createFxAgent } from "libfx";
import { local } from "libfx/durable-local";

const { join } = nodePath;

const [directory, scenario, action] = process.argv.slice(2);

if (!directory || !scenario || !action) {
  throw new Error("Expected directory, interruption scenario and action.");
}

let calls = 0;
let resultObserved = false;
let resultCommitted = false;

const exitAfterCommit = () => {
  if (
    action === "start" &&
    scenario === "completed" &&
    calls >= 2 &&
    resultCommitted
  ) {
    process.exit(73);
  }
};

const requests = [];

const agent = createFxAgent({
  apiKey: "fixture-key",
  durability: local({ dir: join(directory, "sessions") }),
  fetch: async (_url, init) => {
    calls += 1;
    requests.push(await new Request(_url, init).text());

    if (action === "start" && calls === 2) {
      // A completed side effect is only reusable once its result is durably committed.
      exitAfterCommit();

      await delay(60_000);
      throw new Error("Expected the saved-result hook to stop the process.");
    }

    const tool = action === "start";

    const parts = [
      { type: "stream-start", warnings: [] },
      ...(tool
        ? [
            {
              input: "{}",
              toolCallId: "effect-1",
              toolName: "effect",
              type: "tool-call",
            },
          ]
        : [
            { id: "text", type: "text-start" },
            { delta: "Recovered", id: "text", type: "text-delta" },
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

    return new Response(
      parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join(""),
      { headers: { "content-type": "text/event-stream" } }
    );
  },
  hooks: {
    onEvent(event) {
      if (event.type === "tool.result") {
        resultObserved = true;
      }

      if (event.type === "journal.commit" && resultObserved) {
        resultCommitted = true;
        exitAfterCommit();
      }
    },
  },
  model: "openai/gpt-6.1-sol",
  modelCatalog: [{ id: "openai/gpt-6.1-sol", type: "language" }],
  name: "crash-fixture",
  tools: [
    {
      description: "Perform the fixture effect.",
      execute: async (_input, { executionId }) => {
        await appendFile(join(directory, "executions.txt"), `${executionId}\n`);
        await writeFile(join(directory, "artifact.txt"), "done");

        if (action === "start" && scenario !== "completed") {
          process.exit(73);
        }

        return "Effect completed";
      },
      idempotent: scenario === "idempotent",
      inputSchema: {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
      name: "effect",
      writes: true,
    },
  ],
});

try {
  if (action === "start") {
    const id = await agent.newSessionId();
    await writeFile(join(directory, "session.txt"), id);
    await agent
      .session(id)
      .prompt("Run the effect", { messageId: "wrun_effect" }).result;
    throw new Error("Expected the fixture to stop during the first turn.");
  }

  const id = await readFile(join(directory, "session.txt"), "utf-8");
  const result = await agent.session(id).resume().result;
  console.log(JSON.stringify({ requests, result }));
} finally {
  await agent.close();
}
