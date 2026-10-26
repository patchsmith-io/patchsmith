import type { HarnessV1ResumeSessionState } from "@ai-sdk/harness";
import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
} from "@ai-sdk/workflow-harness";
import type {
  HarnessWorkflowChunk,
  HarnessWorkflowState,
} from "@ai-sdk/workflow-harness";
import { FatalError, getWorkflowMetadata, getWritable } from "workflow";

import type { AppAgentInput } from "./input";

const prepare = async (input: AppAgentInput, runId: string) => {
  "use step";
  const { startTurn } = await import("./session");

  return await startTurn(input, runId);
};

const turn = async (
  input: AppAgentInput,
  runId: string,
  state: HarnessWorkflowState
) => {
  "use step";
  const { runHarnessAgentStep } = await import("@ai-sdk/workflow-harness");
  const { createAppAgent } = await import("./agent");
  const { assertOwnership } = await import("./session");
  const { getSandbox, sandboxName, sandboxSession } = await import("./sandbox");
  await assertOwnership(input.appId, runId);
  const name = sandboxName(input.threadId);

  const agent = await createAppAgent(input, name);
  const abortSignal = AbortSignal.timeout(25 * 60_000);

  return await runHarnessAgentStep({
    agent: {
      continueStream: async (options) =>
        await agent.continueStream({ ...options, abortSignal }),
      createSession: async (options) =>
        await agent.createSession({ ...options, abortSignal }),
      stream: async (options) =>
        await agent.stream({ ...options, abortSignal }),
    },
    sandboxSession: sandboxSession(await getSandbox(name)),
    state,
    writable: getWritable<HarnessWorkflowChunk>(),
  });
};

// An interrupted turn may have published or run arbitrary shell commands.
// Fail and clean up rather than replaying the entire turn on a step retry.
turn.maxRetries = 0;

const finish = async (
  appId: string,
  runId: string,
  resumeFrom?: HarnessV1ResumeSessionState
) => {
  "use step";
  const { finishTurn } = await import("./session");
  await finishTurn(appId, runId, resumeFrom);
};

finish.maxRetries = 10;

/** Whole user turns are durable boundaries; no per-model or per-tool steps. */
export const appAgent = async (input: AppAgentInput) => {
  "use workflow";
  const runId = getWorkflowMetadata().workflowRunId;

  try {
    const resumeFrom = await prepare(input, runId);

    const initial = createHarnessWorkflowState({
      messages: input.messages,
      resumeFrom,
      sessionId: input.threadId,
    });

    const state = await turn(input, runId, initial);
    const result = finalizeHarnessWorkflow(state);

    if (state.status !== "finished" || !state.resumeFrom) {
      throw new FatalError("The app agent did not complete its turn.");
    }

    await finish(input.appId, runId, state.resumeFrom);

    return { ...result, threadId: input.threadId };
  } catch (error) {
    await finish(input.appId, runId);
    throw error;
  }
};

export const cleanupAppAgent = async (appId: string, runId: string) => {
  "use workflow";
  await finish(appId, runId);
};

/** External cancellation skips workflow catch blocks; start independent cleanup. */
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
