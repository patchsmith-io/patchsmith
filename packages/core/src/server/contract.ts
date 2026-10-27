import { createClient } from "@patchsmith/client-platform/client/client/index";
import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { PatchsmithContract } from "#schema/contract";
import type {
  ToolImplementations,
  ToolImplementationTree,
} from "#schema/tools";
import { flattenTools } from "#schema/tools";

import { normalizeBaseUrl } from "./base-url";
import { createPatchsmithServer, defaultPlatformBaseUrl } from "./handler";
import { createHookCallers } from "./hooks";
import { createToolExecutor, getImplementation } from "./routes/tools";
import { validatePatchsmithScopeSchemas } from "./scope";
import type {
  PatchsmithServerBaseOptions,
  PatchsmithHandlerOptions,
  PatchsmithHostContext,
  PatchsmithInstallAppOptions,
  PatchsmithServerInputOptions,
} from "./types";

const isFunctionValue = <TValue>(
  value: TValue
): value is Extract<TValue, CallableFunction> => typeof value === "function";

export type { ToolImplementations } from "#schema/tools";

export type ContractScopes<T extends PatchsmithContract> = {
  [N in keyof T["scopes"]]: StandardSchemaV1.InferInput<T["scopes"][N]>;
};

const implementationPaths = (
  tree: ToolImplementationTree | undefined,
  prefix = ""
): string[] => {
  if (!tree) {
    return [];
  }

  return Object.entries(tree).flatMap(([name, value]) =>
    isFunctionValue(value)
      ? [prefix + name]
      : implementationPaths(value, `${prefix + name}.`)
  );
};

/** Bind server tools without placing their implementations in the shared contract. */
export const createServer = <const T extends PatchsmithContract>(
  options: Omit<PatchsmithServerBaseOptions<T["scopes"]>, "scopes"> & {
    contract: T;
  } & (keyof ToolImplementations<T["tools"], "server"> extends never
      ? { tools?: ToolImplementations<T["tools"], "server"> }
      : { tools: ToolImplementations<T["tools"], "server"> })
) => {
  const { contract, tools, ...configuration } = options;
  const { basePath, publicOrigin } = normalizeBaseUrl(configuration.baseUrl);
  const declarations = flattenTools(contract.tools);

  for (const [path, leaf] of declarations) {
    if (
      leaf.kind === "server" &&
      !isFunctionValue(getImplementation(tools, path))
    ) {
      throw new Error(`Missing implementation for tool "${path}"`);
    }
  }

  for (const path of implementationPaths(tools)) {
    if (declarations.get(path)?.kind !== "server") {
      throw new Error(`Undeclared server tool "${path}"`);
    }
  }

  type InternalOptions = PatchsmithServerInputOptions & {
    views: T["views"];
    slots: T["slots"];
    tools: T["tools"];
  };

  const platformHeaders =
    configuration.$internal?.platformHeaders ??
    (configuration.projectKey !== undefined && configuration.projectKey !== ""
      ? { authorization: `Bearer ${configuration.projectKey}` }
      : undefined);

  const platformUrl =
    configuration.$internal?.platformBaseUrl ?? defaultPlatformBaseUrl;

  const toolUrl = `${publicOrigin + basePath}/tools/execute`;

  const executeTool = createToolExecutor({
    contract,
    platformHeaders,
    platformUrl,
    requestPlatform: configuration.$internal?.platformFetch ?? globalThis.fetch,
    toolUrl,
    tools,
  });

  // SAFETY: The generic contract supplies the matching views, slots and tools; configuration supplies the remaining server options.
  const server = createPatchsmithServer<InternalOptions>(
    /* oxlint-disable typescript/no-unsafe-type-assertion -- The generic contract supplies the matching views, slots and tools; configuration supplies the remaining server options. */
    {
      ...configuration,
      ...contract,
      $internal: {
        ...configuration.$internal,
        toolExecutor: async (request, input) =>
          await executeTool(request, input),
      },
    } as Parameters<typeof createPatchsmithServer<InternalOptions>>[0]
    /* oxlint-enable typescript/no-unsafe-type-assertion */
  );

  return {
    ...server,
    contract,
    experimental: {
      installApp: async (
        input: PatchsmithInstallAppOptions<ContractScopes<T>>
      ) =>
        await server.experimental.installApp({
          appId: input.appId,
          scope: input.scope,
          subjectId: input.subjectId,
        }),
    },
    handler: async (
      request: Request,
      handlerOptions: PatchsmithHandlerOptions<Partial<ContractScopes<T>>>
    ) => {
      if (
        !(
          handlerOptions?.authenticate !== undefined &&
          handlerOptions?.authenticate !== null
        )
      ) {
        throw new Error("Supply authenticate to the handler");
      }

      // SAFETY: ContractScopes derives each scope input from the same contract passed to createPatchsmithServer.
      return await server.handler(request, handlerOptions);
    },
    hooks: createHookCallers<T["hooks"], Partial<ContractScopes<T>>>({
      hooks: contract.hooks,
      platform: createClient({
        baseUrl: platformUrl,
        fetch: configuration.$internal?.platformFetch,
      }),
      platformHeaders,
      runtimeFetch: configuration.$internal?.runtimeFetch,
      scopeSchemas: validatePatchsmithScopeSchemas(contract.scopes),
      toolUrl,
    }),
    mcp: {
      transport: async (
        optionsValue: PatchsmithHostContext<Partial<ContractScopes<T>>>
      ) => await server.mcp.transport(optionsValue),
    },
  };
};
