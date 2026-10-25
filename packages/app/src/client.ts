// oxlint-disable-next-line oxc/no-barrel-file -- This file is a supported package or framework entry point; preserve its public exports.
export * from "./views";

export * from "./preact";

export { defineRoute, Route, createFileClient } from "./routing";

export type { RouteDefinition, ShellProps } from "./routing";

export {
  createClient,
  createSessionProvider,
  reference,
} from "./client/connection";

export { createApi } from "./client/reference";

export type {
  Client,
  Session,
  Reference,
  References,
} from "./client/connection";

export { AppError, appError } from "./errors";

export type { ErrorCode } from "./errors";

export { callTool } from "./client/tools";

export { assetUrl } from "./client/assets";

export { experimental_requestCanvas } from "./client/canvas";

export { experimental_useCanvasSurface } from "./client/canvas-hook";

export type {
  experimental_CanvasLifecycle,
  experimental_CanvasCreateContext,
  experimental_CanvasDraw,
  experimental_CanvasFrame,
  experimental_CanvasHookOptions,
  experimental_CanvasHookState,
  experimental_CanvasHookResult,
} from "./client/canvas-hook";

export type {
  experimental_CanvasPresentationOptions,
  experimental_CanvasConnection,
  experimental_CanvasSurface,
} from "./client/canvas";

export type { PatchsmithServerTools, ToolBridge } from "./client/tools";

export type { experimental_CanvasInputEvent } from "./client/canvas-input";
