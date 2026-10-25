import { verifyAgentToken } from "@patchsmith/api-utils/agent-token";
import type { FxStreamLine } from "libfx";

import { env } from "#env";

import { getAppAgent, getAppInstructions } from "./agent";
import type { AppAgentInput } from "./input";
import { toolContextSchema } from "./native-state";
import type { NativeSessionState } from "./native-state";
import { getTurnPrompt } from "./prompt";
import { readSessionLines } from "./stream";

export const submitTurn = async (
  input: AppAgentInput,
  runId: string,
  state: NativeSessionState
) => {
  if (env.AUTH_SECRET === undefined) {
    throw new Error("Agent authorization is unavailable.");
  }

  const claims = await verifyAgentToken(
    input.agentToken,
    env.AUTH_SECRET,
    env.OPENAPI_SERVER_URL ?? "https://patchsmith.io/api/platform"
  );

  if (claims.appId !== input.appId) {
    throw new Error("Agent grant belongs to another app.");
  }

  const context = toolContextSchema.parse({
    appId: input.appId,
    grant: {
      appId: claims.appId,
      cliTokenId: claims.cliTokenId,
      projectId: claims.projectId,
      scope: claims.scope,
    },
    runId,
    threadId: input.threadId,
  });

  const agent = await getAppAgent();

  const session = agent.session(state.sessionId, {
    context,
    instructions: getAppInstructions(input),
    model:
      input.model === "openai/gpt-6.1-sol"
        ? { effort: "low", id: input.model }
        : input.model,
  });

  const turn = session.prompt(getTurnPrompt(input.messages), {
    messageId: runId,
  });

  await turn.accepted;
};

export interface TurnProgress {
  cursor: number;
  terminal?: Extract<FxStreamLine, { type: "turn_end" }>;
}

/** Observe bounded batches; a timeout does not cancel the durable native turn. */
export const observeNativeTurn = async (
  stream: ReadableStream<Uint8Array>,
  messageId: string,
  cursor: number,
  waitMs = 10_000
): Promise<TurnProgress> => {
  const abort = new AbortController();

  const iterator = readSessionLines(stream, abort.signal)[
    Symbol.asyncIterator
  ]();

  const progress: TurnProgress = { cursor };

  const timer = setTimeout(() => {
    abort.abort();
  }, waitMs);

  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- Read stored events in cursor order.
      const result = await iterator.next();

      if (result.done === true || abort.signal.aborted) {
        return progress;
      }

      const line = result.value;
      progress.cursor = line.cursor ?? progress.cursor;

      if (
        "messageId" in line &&
        line.messageId === messageId &&
        line.type === "turn_end" &&
        line.stopReason !== "unknown"
      ) {
        progress.terminal = line;

        return progress;
      }
    }
  } finally {
    clearTimeout(timer);
    abort.abort();
    // oxlint-disable-next-line unicorn/no-useless-undefined -- AsyncGenerator.return requires the return value argument.
    await iterator.return(undefined);
  }
};

export const observeTurn = async (
  sessionId: string,
  messageId: string,
  cursor: number
) => {
  const agent = await getAppAgent();

  return await observeNativeTurn(
    agent.session(sessionId).stream(cursor),
    messageId,
    cursor
  );
};
