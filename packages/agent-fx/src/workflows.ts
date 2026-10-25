import { FatalError, getWorkflowMetadata, sleep } from "workflow";

import type { AppAgentInput } from "./input";
import type { NativeSessionState } from "./native-state";

const prepare = async (input: AppAgentInput, runId: string) => {
  "use step";
  const { startTurn } = await import("./session");

  return await startTurn(input, runId);
};

const submit = async (
  input: AppAgentInput,
  runId: string,
  state: NativeSessionState
) => {
  "use step";
  const { submitTurn } = await import("./turn");
  const { assertOwnership } = await import("./session");
  await assertOwnership(input.appId, runId);
  await submitTurn(input, runId, state);
};

const observe = async (
  state: NativeSessionState,
  runId: string,
  cursor: number
) => {
  "use step";
  const { observeTurn } = await import("./turn");

  return await observeTurn(state.sessionId, runId, cursor);
};

const cleanup = async (appId: string, runId: string, cancelled: boolean) => {
  "use step";
  const { finishTurn } = await import("./session");
  await finishTurn(appId, runId, cancelled);
};

cleanup.maxRetries = 10;

/** Lifecycle only. libfx owns the whole turn, tool results, recovery and output. */
export const appAgent = async (input: AppAgentInput) => {
  "use workflow";
  const runId = getWorkflowMetadata().workflowRunId;
  const deadline = Date.now() + 30 * 60_000;

  try {
    const state = await prepare(input, runId);
    await submit(input, runId, state);
    let cursor = 0;

    for (;;) {
      if (Date.now() >= deadline) {
        throw new FatalError(
          "The app agent exceeded its 30-minute turn budget."
        );
      }

      // oxlint-disable-next-line no-await-in-loop -- Observe one native turn until its persisted terminal event arrives.
      const progress = await observe(state, runId, cursor);
      ({ cursor } = progress);

      if (progress.terminal) {
        const { stopReason, error } = progress.terminal;

        if (stopReason === "error" || stopReason === "cancelled") {
          throw new FatalError(
            error?.message ?? "App agent turn was cancelled."
          );
        }

        // oxlint-disable-next-line no-await-in-loop -- Finalize once the observed native turn is terminal.
        await cleanup(input.appId, runId, false);

        return {
          finishReason: stopReason === "max_output_tokens" ? "length" : "stop",
          sessionId: state.sessionId,
          threadId: input.threadId,
        };
      }

      // oxlint-disable-next-line no-await-in-loop -- Durable sleep releases the function while native libfx runs independently.
      await sleep("1s");
    }
  } catch (error) {
    await cleanup(input.appId, runId, true);
    throw error;
  }
};

export const cleanupAppAgent = async (appId: string, runId: string) => {
  "use workflow";
  await cleanup(appId, runId, true);
};

/** External cancellation skips workflow catch blocks; start independent durable cleanup. */
export const cancelAppAgent = async (appId: string, runId: string) => {
  const { start } = await import("workflow/api");
  const run = await start(cleanupAppAgent, [appId, runId]);
  await run.returnValue;
};

const reconcile = async () => {
  "use step";
  const { reconcileTurns } = await import("./session");

  return await reconcileTurns();
};

export const reconcileAppAgents = async () => {
  "use workflow";

  return await reconcile();
};
