import type { HarnessV1ResumeSessionState } from "@ai-sdk/harness";
import { toUIMessageStream } from "ai";
import type {
  FinishReason,
  ModelMessage,
  TextStreamPart,
  ToolSet,
  UIMessageChunk,
} from "ai";

import type { createAppAgent } from "./agent";

type AppAgent = Awaited<ReturnType<typeof createAppAgent>>;

type SandboxSession = NonNullable<
  NonNullable<Parameters<AppAgent["createSession"]>[0]>["sandboxSession"]
>;

interface TurnAgent {
  createSession: AppAgent["createSession"];
  stream: (options: {
    session: Awaited<ReturnType<AppAgent["createSession"]>>;
    prompt: ModelMessage[];
    abortSignal: AbortSignal;
  }) => Promise<{
    stream: ReadableStream<TextStreamPart<ToolSet>>;
    finishReason: PromiseLike<FinishReason>;
  }>;
}

interface RunTurnOptions {
  agent: TurnAgent;
  messages: ModelMessage[];
  sessionId: string;
  sandboxSession: SandboxSession;
  resumeFrom?: HarnessV1ResumeSessionState;
  writable: WritableStream<UIMessageChunk>;
  signal: AbortSignal;
}

/** One complete user turn: let the harness own tools and AI SDK streaming. */
export const runAppAgentTurn = async (options: RunTurnOptions) => {
  const message = options.messages.findLast((entry) => entry.role === "user");

  if (!message) {
    throw new Error("An app agent turn requires a user message.");
  }

  const session = await options.agent.createSession({
    abortSignal: options.signal,
    resumeFrom: options.resumeFrom,
    sandboxSession: options.sandboxSession,
    sessionId: options.sessionId,
  });

  let stopped = false;

  try {
    const result = await options.agent.stream({
      abortSignal: options.signal,
      prompt: [message],
      session,
    });

    await toUIMessageStream({ stream: result.stream }).pipeTo(options.writable);
    options.signal.throwIfAborted();
    const finishReason = await result.finishReason;

    if (finishReason === "error" || session.hasUnfinishedTurn()) {
      throw new Error("The app agent did not complete its turn.");
    }

    const resumeFrom = await session.stop();
    stopped = true;

    return { finishReason, resumeFrom, sessionId: options.sessionId };
  } finally {
    if (!stopped) {
      await session.destroy();
    }
  }
};
