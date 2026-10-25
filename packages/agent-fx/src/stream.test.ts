import type { UIMessageChunk } from "ai";
import { readUIMessageStream } from "ai";
import type { FxStreamLine } from "libfx";
import { expect, it } from "vite-plus/test";

import { createAppAgentStream, readSessionLines } from "./stream";
import { observeNativeTurn } from "./turn";

const lines: FxStreamLine[] = [
  {
    cursor: 1,
    messageId: "wrun_prior",
    sessionId: "wrun_session",
    type: "turn_start",
  },
  {
    cursor: 2,
    delta: "Old reply",
    messageId: "wrun_prior",
    type: "text_delta",
  },
  {
    cursor: 3,
    messageId: "wrun_prior",
    stopReason: "end_turn",
    type: "turn_end",
  },
  {
    cursor: 4,
    messageId: "wrun_current",
    sessionId: "wrun_session",
    type: "turn_start",
  },
  {
    cursor: 5,
    delta: "Before ",
    messageId: "wrun_current",
    type: "text_delta",
  },
  {
    cursor: 6,
    id: "call",
    input: { command: "ls" },
    messageId: "wrun_current",
    name: "bash",
    type: "tool_start",
  },
  { cursor: 7, messageId: "wrun_current", type: "turn_yield" },
  {
    cursor: 8,
    messageId: "wrun_current",
    stopReason: "unknown",
    type: "turn_end",
  },
  {
    cursor: 9,
    messageId: "wrun_current",
    sessionId: "wrun_session",
    type: "turn_resume",
  },
  {
    content: "done",
    cursor: 10,
    id: "call",
    isError: false,
    messageId: "wrun_current",
    name: "bash",
    type: "tool_end",
  },
  { cursor: 11, delta: "after", messageId: "wrun_current", type: "text_delta" },
  {
    cursor: 12,
    messageId: "wrun_current",
    stopReason: "end_turn",
    type: "turn_end",
  },
];

const nativeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      // Exercise incremental UTF-8/NDJSON decoding rather than one event per chunk.
      const text = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
      controller.enqueue(new TextEncoder().encode(text.slice(0, 23)));
      controller.enqueue(new TextEncoder().encode(text.slice(23)));
      controller.close();
    },
  });

const collect = async (stream: ReadableStream<UIMessageChunk>) => {
  const result: UIMessageChunk[] = [];

  for await (const chunk of stream) {
    result.push(chunk);
  }

  return result;
};

it("reconnects from a stable UI index across native yields without duplicating history or losing tool events", async () => {
  const connect = createAppAgentStream({
    agent: async () =>
      await Promise.resolve({ session: () => ({ stream: nativeStream }) }),
    loadSession: async () =>
      await Promise.resolve({
        sessionId: "wrun_session",
        type: "libfx",
        version: 1,
      }),
  });

  const all = await collect(connect("app", "thread", "wrun_current"));
  const resumed = await collect(connect("app", "thread", "wrun_current", 6));
  expect([...all.slice(0, 6), ...resumed]).toEqual(all);
  expect(all.filter((chunk) => chunk.type === "start")).toHaveLength(1);
  expect(all.filter((chunk) => chunk.type === "finish")).toHaveLength(1);
  expect(JSON.stringify(all)).not.toContain("Old reply");
  let finalMessage;

  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of all) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });

  for await (const message of readUIMessageStream({
    stream,
    terminateOnError: true,
  })) {
    finalMessage = message;
  }

  expect(finalMessage?.parts).toContainEqual({
    state: "done",
    text: "Before after",
    type: "text",
  });
  expect(all).toContainEqual(
    expect.objectContaining({
      toolCallId: "call",
      type: "tool-output-available",
    })
  );
});

it("stops only the native stream reader when a client disconnects", async () => {
  let readerCancelled = false;
  const abort = new AbortController();

  const iterator = readSessionLines(
    new ReadableStream({
      cancel() {
        readerCancelled = true;
      },
    }),
    abort.signal
  );

  const pending = iterator.next();
  abort.abort();
  expect(await pending).toEqual({ done: true, value: undefined });
  expect(readerCancelled).toBe(true);
});

it("observes only a recorded terminal result for the selected turn", async () => {
  const progress = await observeNativeTurn(nativeStream(), "wrun_current", 0);
  expect(progress.cursor).toBe(12);
  expect(progress.terminal?.stopReason).toBe("end_turn");
});

it("bounds observation without cancelling the native session or treating a timeout as failure", async () => {
  let readerCancelled = false;

  const progress = await observeNativeTurn(
    new ReadableStream({
      cancel() {
        readerCancelled = true;
      },
    }),
    "wrun_current",
    9,
    10
  );

  expect(progress).toEqual({ cursor: 9 });
  expect(readerCancelled).toBe(true);
});
