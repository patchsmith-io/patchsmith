import { APIError, Drive, Sandbox } from "@vercel/sandbox";

import type { AppAgentInput } from "./input";
import { appAgentReferences, appAgentReferencesDirectory } from "./skills";

export const sandboxName = (threadId: string) => `fx-${threadId}`;
const timeout = 30 * 60_000;

export const getSandbox = async (name: string) => {
  const sandbox = await Sandbox.get({ name, resume: true });
  const remaining = (sandbox.expiresAt?.getTime() ?? Date.now()) - Date.now();

  if (remaining < timeout - 1000) {
    await sandbox.currentSession().extendTimeout(timeout - remaining);
  }

  return sandbox;
};

const prepareWorkspace = async (sandbox: Sandbox) => {
  // Refresh Patchsmith releases immediately while keeping the three-day delay for
  // third-party packages, including in sandboxes resumed from older snapshots.
  const result = await sandbox.currentSession().runCommand({
    args: [
      "-c",
      'pnpm config set --global minimumReleaseAge 4320 && pnpm config set --global --json minimumReleaseAgeExclude \'["patchsmith", "@patchsmith/*"]\' && pnpm config set --global dlxCacheMaxAge 0',
    ],
    cmd: "bash",
  });

  if (result.exitCode !== 0) {
    throw new Error("Could not prepare the app package manager.");
  }

  const directoryResult = await sandbox.currentSession().runCommand({
    args: ["-p", "/workspace/app"],
    cmd: "mkdir",
  });

  if (directoryResult.exitCode !== 0) {
    throw new Error("Could not prepare the app directory.");
  }

  const referencesResult = await sandbox.currentSession().runCommand({
    args: ["-p", appAgentReferencesDirectory],
    cmd: "mkdir",
  });

  if (referencesResult.exitCode !== 0) {
    throw new Error("Could not prepare the app agent references directory.");
  }

  await sandbox.currentSession().writeFiles(appAgentReferences);

  return sandbox;
};

export const prepareSandbox = async (input: AppAgentInput, resume: boolean) => {
  const name = sandboxName(input.threadId);

  if (resume) {
    return await prepareWorkspace(await getSandbox(name));
  }

  const drive = await Drive.getOrCreate({
    maxSize: 5 * 1024 ** 3,
    name: `app-${input.appId}`,
  });

  if (
    drive.currentSandboxName !== undefined &&
    drive.currentSandboxName !== "" &&
    drive.currentSandboxName !== name
  ) {
    throw new Error(
      "This app is already being edited. Retry after that turn finishes."
    );
  }

  const sandbox = await Sandbox.getOrCreate({
    image: "vercel/sandbox/universal",
    keepLastSnapshots: { count: 1 },
    mounts: { "/workspace": drive },
    name,
    persistent: true,
    region: drive.region,
    timeout,
  });

  return await prepareWorkspace(sandbox);
};

export const deleteSandboxByName = async (name: string) => {
  try {
    const sandbox = await Sandbox.get({ name });
    await sandbox.delete({ deleteOrphanSnapshots: true });
  } catch (error) {
    if (!(error instanceof APIError && error.response.status === 404)) {
      throw error;
    }
  }
};

export const deleteSandbox = async (threadId: string) => {
  await deleteSandboxByName(sandboxName(threadId));
};
