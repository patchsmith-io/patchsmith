import type { AgentModel } from "@patchsmith/client-platform/agent";
import type { Client as PlatformClient } from "@patchsmith/client-platform/client/client/index";

import type { PatchsmithSchema, SchemaSerializer } from "#schema/index";

import type { PatchsmithScopeSchemas } from "./scope";
import type {
  PatchsmithPlatformOptions,
  PatchsmithScopes,
  ToolExecutionInput,
} from "./types";

const isFunctionValue = <TValue>(
  value: TValue
): value is Extract<TValue, CallableFunction> => typeof value === "function";

export interface PatchsmithRuntimeContext {
  subjectId: string;
  scopes: PatchsmithScopes;
}

export interface Context {
  localSlugPrefix?: string;
  publicOrigin: string;
  toolUrl: string;
  schemaSerializer?: SchemaSerializer;
  cliAuthSignInPath?: `/${string}`;
  resHeaders?: Headers;
  toolExecutor?: (
    request: Request,
    input: ToolExecutionInput
  ) => Promise<Response>;
  agentInstructions?: string;
  agentModel?: AgentModel;
  runtimeResolveBaseUrl?: string;
  platform: PlatformClient;
  platformHeaders: Record<string, string>;
  request: Request;
  schema: PatchsmithSchema;
  scopeSchemas: PatchsmithScopeSchemas;
  /** Scope authorization shared by host sessions and CLI deployment grants. */
  patchsmith?: Pick<PatchsmithRuntimeContext, "scopes">;
  authenticate: (ctx: {
    request: Request;
  }) =>
    | PatchsmithRuntimeContext
    | null
    | Promise<PatchsmithRuntimeContext | null>;
}

export interface CreateContextOptions {
  localSlugPrefix?: string;
  toolExecutor?: (
    request: Request,
    input: ToolExecutionInput
  ) => Promise<Response>;
  publicOrigin: string;
  toolUrl: string;
  schemaSerializer?: SchemaSerializer;
  cliAuthSignInPath?: `/${string}`;
  agentInstructions?: string;
  agentModel?: AgentModel;
  runtimeResolveBaseUrl?: string;
  platform: PlatformClient;
  platformHeaders?: PatchsmithPlatformOptions["headers"];
  request: Request;
  schema: PatchsmithSchema;
  scopeSchemas: PatchsmithScopeSchemas;
  authenticate: (ctx: {
    request: Request;
  }) =>
    | PatchsmithRuntimeContext
    | null
    | Promise<PatchsmithRuntimeContext | null>;
}

export const createContext = async (
  options: CreateContextOptions
): Promise<Context> => {
  const configuredHeaders = await (isFunctionValue(options.platformHeaders)
    ? options.platformHeaders()
    : options.platformHeaders);

  const platformHeaders = Object.fromEntries(new Headers(configuredHeaders));

  return {
    agentInstructions: options.agentInstructions,
    agentModel: options.agentModel,
    authenticate: options.authenticate,
    cliAuthSignInPath: options.cliAuthSignInPath,
    localSlugPrefix: options.localSlugPrefix,
    platform: options.platform,
    platformHeaders,
    publicOrigin: options.publicOrigin,
    request: options.request,
    runtimeResolveBaseUrl: options.runtimeResolveBaseUrl,
    schema: options.schema,
    schemaSerializer: options.schemaSerializer,
    scopeSchemas: options.scopeSchemas,
    toolExecutor: options.toolExecutor,
    toolUrl: options.toolUrl,
  };
};
