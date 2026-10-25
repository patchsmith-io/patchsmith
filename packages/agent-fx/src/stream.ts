import { setTimeout as delay } from "node:timers/promises";

import type { UIMessageChunk } from "ai";
import type { FxStreamLine } from "libfx";
import { z } from "zod";

import { getAppAgent } from "./agent";
import { getThreadSession } from "./ownership";

const lineSchema = z.union([
  z.object({
    delta: z.string(),
    messageId: z.string(),
    type: z.literal("text_delta"),
  }),
  z.object({
    delta: z.string(),
    messageId: z.string(),
    type: z.literal("reasoning_delta"),
  }),
  z.object({
    id: z.string(),
    input: z.json().optional(),
    inputPreview: z.undefined().optional(),
    inputTruncated: z.undefined().optional(),
    messageId: z.string(),
    name: z.string(),
    type: z.literal("tool_start"),
  }),
  z.object({
    id: z.string(),
    inputPreview: z.string(),
    inputTruncated: z.literal(true),
    messageId: z.string(),
    name: z.string(),
    type: z.literal("tool_start"),
  }),
  z.object({
    content: z.string().optional(),
    id: z.string(),
    isError: z.boolean(),
    messageId: z.string(),
    name: z.string(),
    type: z.literal("tool_end"),
  }),
  z.object({
    input: z.string().optional(),
    messageId: z.string(),
    sessionId: z.string(),
    type: z.literal("turn_start"),
  }),
  z.object({
    messageId: z.string(),
    sessionId: z.string(),
    type: z.literal("turn_resume"),
  }),
  z.object({ messageId: z.string(), type: z.literal("turn_yield") }),
  z.object({
    id: z.string().optional(),
    messageId: z.string(),
    text: z.string(),
    type: z.literal("user_message"),
  }),
  z.object({
    error: z
      .object({
        code: z.union([z.string(), z.number()]).optional(),
        message: z.string(),
        name: z.string(),
      })
      .optional(),
    messageId: z.string(),
    stopReason: z.enum([
      "end_turn",
      "max_output_tokens",
      "max_model_turns",
      "refused",
      "cancelled",
      "error",
      "unknown",
    ]),
    type: z.literal("turn_end"),
  }),
  z.object({ requestId: z.string(), type: z.literal("idle") }),
]);

const cursorSchema = z.object({
  cursor: z.number().int().nonnegative().optional(),
  epoch: z.number().optional(),
});

/**
 * Parse the persisted native stream; disconnecting cancels only the reader.
 * @yields {FxStreamLine} Validated native events in their stored order.
 */
export const readSessionLines = async function* readSessionLines(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<FxStreamLine> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const cancelReader = async () => {
    try {
      await reader.cancel();
    } catch {
      // The reader may already be errored; its read propagates that failure.
    }
  };

  const cancel = () => {
    void cancelReader();
  };

  signal?.addEventListener("abort", cancel, { once: true });

  if (signal?.aborted === true) {
    cancel();
  }

  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- Decode the stored stream in order.
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      pending += decoder.decode(value, { stream: true });
      let end = pending.indexOf("\n");

      while (end !== -1) {
        const text = pending.slice(0, end);
        pending = pending.slice(end + 1);

        if (text.trim()) {
          const json: unknown = JSON.parse(text);
          yield { ...lineSchema.parse(json), ...cursorSchema.parse(json) };
        }

        end = pending.indexOf("\n");
      }
    }

    if (signal?.aborted === true) {
      return;
    }

    pending += decoder.decode();

    if (pending.trim()) {
      throw new Error("Incomplete native agent stream event.");
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await cancelReader();
    reader.releaseLock();
  }
};

const finishChunks = (
  line: Extract<FxStreamLine, { type: "turn_end" }>,
  messageId: string
): UIMessageChunk[] => {
  if (line.stopReason === "unknown") {
    return [];
  }

  const chunks: UIMessageChunk[] = [
    { id: `${messageId}:text`, type: "text-end" },
    { id: `${messageId}:reasoning`, type: "reasoning-end" },
    { type: "finish-step" },
  ];

  if (line.stopReason === "error") {
    chunks.push({
      errorText: line.error?.message ?? "App agent failed.",
      type: "error",
    });
  }

  if (line.stopReason === "cancelled") {
    chunks.push({ type: "abort" });
  }

  chunks.push({
    finishReason: line.stopReason === "max_output_tokens" ? "length" : "stop",
    type: "finish",
  });

  return chunks;
};

export const toUIChunks = (
  line: FxStreamLine,
  messageId: string
): UIMessageChunk[] => {
  if (!("messageId" in line) || line.messageId !== messageId) {
    return [];
  }

  switch (line.type) {
    case "turn_start": {
      return [
        { messageId, type: "start" },
        { type: "start-step" },
        { id: `${messageId}:text`, type: "text-start" },
        { id: `${messageId}:reasoning`, type: "reasoning-start" },
      ];
    }

    case "text_delta": {
      return [
        { delta: line.delta, id: `${messageId}:text`, type: "text-delta" },
      ];
    }

    case "reasoning_delta": {
      return [
        {
          delta: line.delta,
          id: `${messageId}:reasoning`,
          type: "reasoning-delta",
        },
      ];
    }

    case "tool_start": {
      return [
        {
          dynamic: true,
          input: line.input ?? line.inputPreview ?? {},
          toolCallId: line.id,
          toolName: line.name,
          type: "tool-input-available",
        },
      ];
    }

    case "tool_end": {
      return [
        line.isError
          ? {
              dynamic: true,
              errorText: line.content ?? "Tool failed.",
              toolCallId: line.id,
              type: "tool-output-error",
            }
          : {
              dynamic: true,
              output: line.content ?? "",
              toolCallId: line.id,
              type: "tool-output-available",
            },
      ];
    }

    case "turn_end": {
      return finishChunks(line, messageId);
    }

    case "turn_resume":
    case "turn_yield":
    case "user_message": {
      return [];
    }

    default: {
      return [];
    }
  }
};

interface StreamDependencies {
  loadSession: typeof getThreadSession;
  agent: () => Promise<{
    session: (id: string) => { stream: () => ReadableStream<Uint8Array> };
  }>;
}

const defaultStreamDependencies: StreamDependencies = {
  agent: async () => await getAppAgent(),
  loadSession: getThreadSession,
};

/** Keep startIndex stable by deriving all UI chunks from the persisted native journal. */
export const createAppAgentStream =
  (dependencies: StreamDependencies = defaultStreamDependencies) =>
  (
    appId: string,
    threadId: string,
    runId: string,
    startIndex = 0
  ): ReadableStream<UIMessageChunk> => {
    const controller = new AbortController();

    return new ReadableStream<UIMessageChunk>({
      cancel() {
        controller.abort();
      },
      async start(output) {
        try {
          let saved = await dependencies.loadSession(appId, threadId);

          while (!saved && !controller.signal.aborted) {
            try {
              // oxlint-disable-next-line no-await-in-loop -- Wait for the lifecycle step to publish the session coordinates.
              await delay(100, undefined, { signal: controller.signal });
            } catch (error) {
              if (!controller.signal.aborted) {
                throw error;
              }
            }

            // oxlint-disable-next-line no-await-in-loop -- Recheck setup after each bounded wait.
            saved = await dependencies.loadSession(appId, threadId);
          }

          if (!saved || controller.signal.aborted) {
            return;
          }

          const agent = await dependencies.agent();
          const stream = agent.session(saved.sessionId).stream();
          let index = 0;

          for await (const line of readSessionLines(
            stream,
            controller.signal
          )) {
            if (controller.signal.aborted) {
              return;
            }

            for (const chunk of toUIChunks(line, runId)) {
              if (index >= startIndex) {
                output.enqueue(chunk);
              }

              index += 1;
            }

            if (
              "messageId" in line &&
              line.messageId === runId &&
              line.type === "turn_end" &&
              line.stopReason !== "unknown"
            ) {
              break;
            }
          }

          if (!controller.signal.aborted) {
            output.close();
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            output.error(error);
          }
        }
      },
    });
  };

export const getAppAgentStream = createAppAgentStream();
