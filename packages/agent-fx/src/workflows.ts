import type { HarnessV1ResumeSessionState } from "@ai-sdk/harness";
import type { UIMessageChunk } from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";

import type { AppAgentInput } from "./input";

const prepare = async (input: AppAgentInput, runId: string) => {
  "use step";
  const { startTurn } = await import("./session");

  return await startTurn(input, runId);
};

const turn = async (
  input: AppAgentInput,
  runId: string,
  resumeFrom?: HarnessV1ResumeSessionState
) => {
  "use step";
  const { createAppAgent } = await import("./agent");
  const { assertOwnership } = await import("./session");
  const { getSandbox, sandboxName, sandboxSession } = await import("./sandbox");
  const { runAppAgentTurn } = await import("./run-turn");
  await assertOwnership(input.appId, runId);
  const name = sandboxName(input.threadId);

  return await runAppAgentTurn({
    agent: await createAppAgent(input, name),
    messages: input.messages,
    resumeFrom,
    sandboxSession: sandboxSession(await getSandbox(name)),
    sessionId: input.threadId,
    signal: AbortSignal.timeout(25 * 60_000),
    writable: getWritable<UIMessageChunk>(),
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
    const result = await turn(input, runId, resumeFrom);
    await finish(input.appId, runId, result.resumeFrom);

    return {
      finishReason: result.finishReason,
      sessionId: result.sessionId,
      threadId: input.threadId,
    };
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
