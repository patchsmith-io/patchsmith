import { RPCHandler } from "@orpc/server/fetch";
import { agentModelSchema } from "@patchsmith/client-platform/agent";
import { createClient } from "@patchsmith/client-platform/client/client/index";
import * as v from "valibot";

import type {
  NoComponentFieldCallbackConflicts,
  ViewContextHierarchy,
  SlotDefinitions,
} from "#schema/index";
import { createPatchsmithSchema } from "#schema/schema";
import type { EmptyDefinitionMap } from "#schema/shared";

import { validateLocalSlugPrefix } from "./app-slug";
import { normalizeBaseUrl } from "./base-url";
import { createContext } from "./context";
import type { PatchsmithRuntimeContext } from "./context";
import { createExperimental } from "./experimental";
import { createHttpHandler } from "./http";
import { createMcpTransport } from "./mcp";
import { patchsmithRouter, patchsmithHttpRouter } from "./router";
import {
  validatePatchsmithScopeSchemas,
  validatePatchsmithScopes,
} from "./scope";
import type {
  InferPatchsmithServerTools,
  InferPatchsmithServerComponents,
  InferPatchsmithServerViews,
  InferPatchsmithServerScopes,
  PatchsmithHandlerOptions,
  PatchsmithServer,
  PatchsmithServerInputOptions,
} from "./types";

const isStringValue = <TValue>(value: TValue): value is TValue & string =>
  typeof value === "string";

export const defaultPlatformBaseUrl = "https://patchsmith.io/api/platform";

type AbsolutePath = `/${string}`;

export const createPatchsmithServer = <
  const TOptions extends PatchsmithServerInputOptions,
>(
  options: TOptions & {
    slots?: SlotDefinitions<
      keyof InferPatchsmithServerViews<NoInfer<TOptions>> & string
    >;
    tools?: InferPatchsmithServerTools<TOptions>;
    components: InferPatchsmithServerComponents<TOptions> &
      NoComponentFieldCallbackConflicts<
        InferPatchsmithServerComponents<TOptions>
      >;
    views?: InferPatchsmithServerViews<TOptions> &
      ViewContextHierarchy<InferPatchsmithServerViews<TOptions>>;
  }
): PatchsmithServer<
  InferPatchsmithServerComponents<TOptions>,
  InferPatchsmithServerViews<TOptions>,
  InferPatchsmithServerTools<TOptions>,
  InferPatchsmithServerScopes<TOptions>
> & {
  readonly $slots?: TOptions extends { slots: infer V }
    ? V
    : EmptyDefinitionMap;
} => {
  const { instructions, model: agentModel } = v.parse(
    v.object({
      instructions: v.optional(
        v.pipe(v.string(), v.trim(), v.maxLength(32_000))
      ),
      model: v.optional(agentModelSchema),
    }),
    options.agent ?? {}
  );

  const internal = options.$internal ?? {};
  const agentInstructions = instructions === "" ? undefined : instructions;

  const localSlugPrefix = validateLocalSlugPrefix(internal.localSlugPrefix);

  const { basePath, publicOrigin } = normalizeBaseUrl(options.baseUrl);
  const scopeSchemas = validatePatchsmithScopeSchemas(options.scopes);

  // SAFETY: The server preserves the supplied typed tool table and normalizes the route base path before constructing its handler.
  const schema = createPatchsmithSchema<
    InferPatchsmithServerComponents<TOptions>,
    InferPatchsmithServerViews<TOptions>,
    InferPatchsmithServerTools<TOptions>
  >({
    components: options.components,
    hooks: options.hooks,
    scopes: options.scopes,
    slots: options.slots,
    tools: options.tools,
    views: options.views,
  });

  const { runtimeResolveBaseUrl } = internal;

  if (runtimeResolveBaseUrl !== undefined) {
    const target = new URL(runtimeResolveBaseUrl);

    const local =
      target.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);

    if (
      (!local && target.protocol !== "https:") ||
      target.username ||
      target.password ||
      target.search ||
      target.hash
    ) {
      throw new Error(
        "Runtime resolution base URL requires HTTPS and no credentials, query, or fragment"
      );
    }
  }

  const platformBaseUrl = internal.platformBaseUrl ?? defaultPlatformBaseUrl;

  const platform = createClient({
    baseUrl: platformBaseUrl,
    fetch: internal.platformFetch,
    responseStyle: "data",
    throwOnError: true,
  });

  const platformHeaders =
    internal.platformHeaders ??
    (options.projectKey !== undefined &&
    options.projectKey !== null &&
    options.projectKey !== ""
      ? { authorization: `Bearer ${options.projectKey}` }
      : undefined);

  const rpcHandler = new RPCHandler(patchsmithRouter);
  const httpHandler = createHttpHandler(patchsmithHttpRouter);

  const mcp = createMcpTransport({
    agentInstructions,
    agentModel,
    hostUrl: publicOrigin + basePath,
    platformHeaders,
    platformUrl: platformBaseUrl,
    scopeSchemas,
  });

  const handler = async (
    request: Request,
    handlerOptions: PatchsmithHandlerOptions<
      InferPatchsmithServerScopes<TOptions>
    >
  ) => {
    let authenticated: Promise<PatchsmithRuntimeContext | null> | undefined;

    const resolveAuthentication = async ({
      request: requestValue,
    }: {
      request: Request;
    }) => {
      const hostContext = await handlerOptions.authenticate({
        request: requestValue,
      });

      if (!hostContext) {
        return null;
      }

      if (
        !isStringValue(hostContext.subjectId) ||
        !hostContext.subjectId ||
        hostContext.subjectId.length > 256
      ) {
        throw new Error("Invalid authenticated subject");
      }

      return {
        ...hostContext,
        scopes: await validatePatchsmithScopes(
          scopeSchemas,
          hostContext.scopes
        ),
      };
    };

    const authenticate = async (input: { request: Request }) => {
      authenticated ??= resolveAuthentication(input);

      return await authenticated;
    };

    const context = await createContext({
      agentInstructions,
      agentModel,
      authenticate,
      cliAuthSignInPath: options.cliAuth?.signInPath,
      localSlugPrefix,
      platform,
      platformHeaders,
      publicOrigin,
      request,
      runtimeResolveBaseUrl,
      schema,
      schemaSerializer: options.schemaSerializer,
      scopeSchemas,
      toolExecutor: internal.toolExecutor,
      toolUrl: `${publicOrigin + basePath}/tools/execute`,
    });

    // SAFETY: normalizeBaseUrl checked that the path is empty or an absolute path.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- normalizeBaseUrl validated this route prefix.
    const prefix = basePath as AbsolutePath;
    const httpResult = await httpHandler.handle(request, { context, prefix });

    if (httpResult.matched) {
      return httpResult.response;
    }

    // SAFETY: The server preserves the supplied typed tool table and normalizes the route base path before constructing its handler.
    const rpcResult = await rpcHandler.handle(request, {
      context,
      prefix,
    });

    if (rpcResult.response) {
      return rpcResult.response;
    }

    return new Response("Patchsmith route not found", { status: 404 });
  };

  return {
    $internal: { platformBaseUrl, router: patchsmithRouter, schema },
    experimental: createExperimental({
      localSlugPrefix,
      platform,
      platformHeaders,
      scopeSchemas,
    }),
    handler,
    mcp,
  };
};
