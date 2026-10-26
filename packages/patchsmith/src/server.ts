export { createServer, createPatchsmithClient } from "@patchsmith/core/server";

export type {
  ToolImplementations,
  ContractScopes,
} from "@patchsmith/core/server";

export type {
  PatchsmithRouter,
  PatchsmithRouterClient,
} from "@patchsmith/core/server";

export type {
  AgentModel,
  PatchsmithHandlerContext,
  PatchsmithHandlerOptions,
  PatchsmithHostContext,
  PatchsmithInstallAppOptions,
  PatchsmithInstalledApp,
  PatchsmithPlatformOptions,
  PatchsmithServer,
  PatchsmithServerOptions,
} from "@patchsmith/core/server/types";

// oxlint-disable-next-line oxc/no-barrel-file -- This file is a supported package or framework entry point; preserve its public exports.
export * from "@patchsmith/app/server";

export type { HookCallers } from "@patchsmith/core/server";
