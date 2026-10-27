import type { AgentModel } from "@patchsmith/client-platform/agent";
import type {
  AppsInstallResponses,
  ClientOptions as PlatformClientOptions,
} from "@patchsmith/client-platform/client/types.gen";
import type { StandardSchemaV1 } from "@standard-schema/spec";

import type {
  ContractHooks,
  ContractTools,
  ComponentDefinitions,
  NoComponentFieldCallbackConflicts,
  ViewContextHierarchy,
  ContextDefinitions,
  SlotDefinitions,
  SchemaSerializer,
  PatchsmithSchema,
} from "#schema/index";
import type { EmptyDefinitionMap } from "#schema/shared";

import type { PatchsmithRouter } from "./router";

export type { AgentModel } from "@patchsmith/client-platform/agent";

type HeaderInput = ConstructorParameters<typeof Headers>[0];

export interface ToolExecutionInput {
  path: string;
  input?: unknown;
  requestId: string;
}

export interface PatchsmithPlatformOptions {
  baseUrl?: PlatformClientOptions["baseUrl"];
  fetch?: typeof fetch;
  headers?: HeaderInput | (() => HeaderInput | Promise<HeaderInput>);
}

export interface PatchsmithServerBaseOptions<
  TScopes extends Record<string, StandardSchemaV1> = Record<
    string,
    StandardSchemaV1
  >,
> {
  /**
   * Patchsmith project key. The host application must read its
   * `PATCHSMITH_PROJECT_KEY` environment variable and pass the value here.
   */
  projectKey?: string;
  /** Standard Schema validators keyed by the names used to identify app scopes. */
  scopes: TScopes;
  /** Convert schemas to JSON Schema for metadata and app type generation. */
  schemaSerializer?: SchemaSerializer;
  /**
   * Required absolute public HTTP(S) URL, including the route prefix.
   * Supplies the trusted origin for backend sessions and server tool calls.
   */
  baseUrl: string | URL;
  /** App builder configuration, supplied by the host for CLI and MCP runs. */
  agent?: {
    /** Design conventions, product context, or app-building tips. Maximum 32,000 characters. */
    instructions?: string;
    /** App-building model. Defaults to openai/gpt-6.1-sol. */
    model?: AgentModel;
  };
  /**
   * Configuration for browser-based Patchsmith CLI authentication.
   */
  cliAuth?: {
    /**
     * Root-relative path to the host application's sign-in page.
     *
     * When configured, unauthenticated visitors to the CLI approval page are
     * redirected here with a `returnTo` query parameter that points back to
     * the approval page.
     */
    signInPath: `/${string}`;
  };
  /**
   * Internal Patchsmith implementation options.
   *
   * These options are not covered by semantic versioning and may change or
   * break at any time. Avoid using them in application code. If you need one of
   * these hooks, please open a GitHub issue explaining the problem you are
   * solving so we can find a stable public API.
   *
   * @internal
   */
  $internal?: {
    /**
     * Local slug prefix. Defaults to "@". Must fit one URL segment and include
     * a symbol ordinary slugs cannot contain. This override is experimental.
     */
    localSlugPrefix?: string;
    toolExecutor?: (
      request: Request,
      input: ToolExecutionInput
    ) => Promise<Response>;
    platformBaseUrl?: PatchsmithPlatformOptions["baseUrl"];
    /** Override only /apps/runtime/resolve, for the Cloudflare experiment. Server-side only. */
    runtimeResolveBaseUrl?: string;
    platformFetch?: typeof fetch;
    runtimeFetch?: typeof fetch;
    platformHeaders?: PatchsmithPlatformOptions["headers"];
  };
}

export interface PatchsmithServerSchemaOptions<
  TComponents extends ComponentDefinitions,
  TViews extends ContextDefinitions,
  TTools extends ContractTools = EmptyDefinitionMap,
> {
  tools?: TTools & ContractTools;
  components: TComponents & NoComponentFieldCallbackConflicts<TComponents>;
  views?: TViews & ViewContextHierarchy<TViews>;
  slots?: SlotDefinitions<keyof TViews & string>;
}

export interface PatchsmithServerInputOptions extends PatchsmithServerBaseOptions {
  hooks?: ContractHooks;
  slots?: SlotDefinitions;
  tools?: ContractTools;
  components: ComponentDefinitions;
  views?: ContextDefinitions;
}

export type InferPatchsmithServerComponents<
  TOptions extends PatchsmithServerInputOptions,
> = TOptions["components"];

export type InferPatchsmithServerViews<
  TOptions extends PatchsmithServerInputOptions,
> = TOptions extends { views: infer TViews } ? TViews : EmptyDefinitionMap;

/** @deprecated Use InferPatchsmithServerViews instead. */
export type InferPatchsmithServerContexts<
  TOptions extends PatchsmithServerInputOptions,
> = InferPatchsmithServerViews<TOptions>;

export type InferPatchsmithServerTools<
  TOptions extends PatchsmithServerInputOptions,
> = TOptions extends { tools: infer TTools } ? TTools : EmptyDefinitionMap;

export type PatchsmithJsonValue =
  | string
  | number
  | boolean
  | null
  | PatchsmithJsonValue[]
  | { [key: string]: PatchsmithJsonValue };

/** A JSON object that identifies one named app scope. */
export type PatchsmithScope = Record<string, PatchsmithJsonValue>;

export interface PatchsmithNamedScope {
  name: string;
  value: PatchsmithScope;
}

export type PatchsmithScopes = Record<string, PatchsmithScope>;

/** Install a deployed app into exactly one scope declared by the host. */
export interface PatchsmithInstallAppOptions<TScopes = PatchsmithScopes> {
  /** Public app ID or UUID of a deployed app in this project. */
  appId: string;
  scope: {
    [TName in keyof TScopes & string]-?: {
      name: TName;
      value: NonNullable<TScopes[TName]>;
    };
  }[keyof TScopes & string];
}

export type PatchsmithInstalledApp = AppsInstallResponses[200];

export type InferPatchsmithServerScopes<
  TOptions extends PatchsmithServerInputOptions,
> = TOptions extends {
  scopes: infer TSchemas extends Record<string, StandardSchemaV1>;
}
  ? {
      [TName in keyof TSchemas]: Pick<
        {
          [TKey in keyof TSchemas]: StandardSchemaV1.InferInput<TSchemas[TKey]>;
        },
        TName
      > &
        Partial<{
          [TKey in Exclude<keyof TSchemas, TName>]: StandardSchemaV1.InferInput<
            TSchemas[TKey]
          >;
        }>;
    }[keyof TSchemas]
  : EmptyDefinitionMap;

export interface PatchsmithServerOptions<
  TComponents extends ComponentDefinitions,
  TViews extends ContextDefinitions,
  TTools extends ContractTools = EmptyDefinitionMap,
  TScopes extends Record<string, StandardSchemaV1> = Record<
    string,
    StandardSchemaV1
  >,
>
  extends
    PatchsmithServerBaseOptions<TScopes>,
    PatchsmithServerSchemaOptions<TComponents, TViews, TTools> {}

export interface PatchsmithHostContext<TScopes = PatchsmithScopes> {
  scopes: TScopes;
  /** Stable identifier of the authenticated product user or service principal. */
  subjectId: string;
}

export interface PatchsmithHandlerOptions<TScopes = PatchsmithScopes> {
  authenticate: (ctx: {
    request: Request;
  }) =>
    | PatchsmithHostContext<TScopes>
    | null
    | Promise<PatchsmithHostContext<TScopes> | null>;
}

export type PatchsmithHandlerContext<TScopes = PatchsmithScopes> =
  PatchsmithHostContext<TScopes>;

export interface PatchsmithServer<
  TComponents extends ComponentDefinitions,
  TViews extends ContextDefinitions,
  TTools extends ContractTools = EmptyDefinitionMap,
  TScopes = PatchsmithScopes,
> {
  /** Experimental server APIs may change outside semantic versioning. */
  experimental: {
    /** Create an independent installation pinned to the app's published deployment. */
    installApp: (
      options: PatchsmithInstallAppOptions<TScopes>
    ) => Promise<PatchsmithInstalledApp>;
  };
  /** Prepare direct platform MCP HTTP configuration for a server-side client. */
  mcp: {
    transport: (options: PatchsmithHostContext<TScopes>) => Promise<{
      url: string;
      headers: Record<string, string>;
    }>;
  };
  handler: (
    request: Request,
    options: PatchsmithHandlerOptions<TScopes>
  ) => Response | Promise<Response>;
  /**
   * Internal Patchsmith implementation details.
   *
   * This API is not covered by semantic versioning and may change or break at
   * any time. Avoid depending on it in application code. If you need something
   * exposed here, please open a GitHub issue explaining what you are trying to
   * build so we can design a stable public API for that use case.
   *
   * @internal
   */
  $internal: {
    platformBaseUrl: string;
    router: PatchsmithRouter;
    schema: PatchsmithSchema<TComponents, TViews, TTools>;
  };
}
