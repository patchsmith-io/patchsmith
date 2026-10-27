import {
  agentChunkSchema,
  agentRunCompleteChunkSchema,
} from "@patchsmith/client-platform/agent";
import {
  appsCreate,
  appsList,
  appsGet,
  appsDelete,
  appsUpdate,
  appsDeploy,
  deploymentsCreate,
  deploymentsPublish,
  deploymentsList,
  deploymentsGet,
  cliAuthVerifyToken,
  appAgentChat,
  appAgentCreate,
} from "@patchsmith/client-platform/client";
import { createClient } from "@patchsmith/client-platform/client/client/index";
import { createPatchsmithClient } from "@patchsmith/core/server";
import type { PatchsmithRouterClient } from "@patchsmith/core/server";
import * as v from "valibot";

import { getAgentAuth, validatePlatformUrl } from "./agent-auth";
import { platformAppSelector } from "./platform-app-selector";

const isObjectValue = <TValue>(value: TValue): value is TValue & object =>
  typeof value === "object" && value !== null;

const isStringValue = <TValue>(value: TValue): value is TValue & string =>
  typeof value === "string";

type Input<
  Group extends keyof PatchsmithRouterClient,
  Method extends keyof PatchsmithRouterClient[Group],
> = PatchsmithRouterClient[Group][Method] extends (
  ...args: infer Args
) => infer _Output
  ? Args[0]
  : never;

/** Adapt platform HTTP errors to the existing CLI RPC error contract. */
const request = async <T>(operation: Promise<T>): Promise<T> => {
  try {
    return await operation;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    if (
      isObjectValue(error) &&
      "message" in error &&
      isStringValue(error.message)
    ) {
      throw Object.assign(new Error(error.message, { cause: error }), {
        code: "code" in error ? error.code : undefined,
      });
    }

    throw new Error(String(error), { cause: error });
  }
};

export type CliClient = Pick<
  PatchsmithRouterClient,
  "apps" | "deployments" | "appAgent"
> & {
  cliAuth: Pick<PatchsmithRouterClient["cliAuth"], "verifyToken">;
};

/** All authenticated CLI commands share one credential selection and routing boundary. */
export const createCliClient = (options: {
  url: string;
  token: string;
  fetch?: typeof fetch;
}): CliClient => {
  const agent = getAgentAuth();

  if (!agent) {
    const clientOptions: Parameters<typeof createPatchsmithClient>[0] = {
      headers: { authorization: `Bearer ${options.token}` },
      url: options.url,
    };

    if (options.fetch) {
      clientOptions.fetch = options.fetch;
    }

    return createPatchsmithClient(clientOptions);
  }

  const client = createClient({
    baseUrl: validatePlatformUrl(agent.platformUrl),
    fetch: options.fetch,
    headers: { authorization: `Bearer ${agent.token}` },
    redirect: "error",
    responseStyle: "data",
    throwOnError: true,
  });

  const { scope } = agent;

  const scopes = (names?: string[]) => {
    if (names && (names.length !== 1 || names[0] !== scope.name)) {
      throw new Error("Requested scope is not authorized by the agent token.");
    }

    return [scope];
  };
  // These map the host RPC shapes to existing OpenAPI routes. Both return compact bodies.
  // SAFETY: The adapter reconstructs the same runtime contract, but TypeScript cannot relate the erased generic parameters across this library boundary.

  return (
    /* oxlint-disable typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- The adapter reconstructs the same runtime contract, but TypeScript cannot relate the erased generic parameters across this library boundary. */
    {
      appAgent: {
        async *chat(
          input: Input<"appAgent", "chat">,
          optionsValue: { signal?: AbortSignal }
        ) {
          const { appId, ...turn } = input;
          let streamError: unknown;
          let streamFailed = false;
          let done = false;

          const { stream } = await appAgentChat({
            body: {
              ...turn,
              app: platformAppSelector(appId),
              deployToken: agent.token,
            },
            client,
            onSseError: (error) => {
              streamError = error;
              streamFailed = true;
            },
            signal: optionsValue?.signal,
            sseMaxRetryAttempts: 1,
          });

          for await (const chunk of stream) {
            const event = await v.parseAsync(agentChunkSchema, chunk);

            if (
              v.safeParse(agentRunCompleteChunkSchema, event).success ||
              event.type === "error"
            ) {
              done = true;
            }

            yield event;
          }

          optionsValue?.signal?.throwIfAborted();

          if (!done && !streamFailed) {
            throw new Error("The agent stream ended unexpectedly. Try again.");
          }

          if (streamFailed) {
            throw new Error("The app agent stream failed. Try again.", {
              cause: streamError,
            });
          }
        },
        create: async (input: Input<"appAgent", "create">) =>
          await request(
            appAgentCreate({
              body: { ...input, deployToken: agent.token },
              client,
            })
          ),
      },
      apps: {
        create: async (input: Input<"apps", "create">) =>
          await request(appsCreate({ body: { ...input, scope }, client })),
        delete: async (input: Input<"apps", "delete">) =>
          await request(
            appsDelete({
              body: { app: platformAppSelector(input.appId), scope },
              client,
            })
          ),
        deploy: async (input: Input<"apps", "deploy">) =>
          await request(
            appsDeploy({
              body: {
                app: platformAppSelector(input.appId),
                deploymentId: input.deploymentId,
                scope,
              },
              client,
            })
          ),
        get: async (input: Input<"apps", "get">) => {
          if ("slug" in input) {
            throw new Error(
              "Slug lookup requires the host's prefix configuration. Use an app ID with agent credentials."
            );
          }

          return await request(
            appsGet({
              body: {
                app: platformAppSelector(input.appId),
                scopes: scopes(input.scopes),
              },
              client,
            })
          );
        },
        list: async (input?: Input<"apps", "list">) =>
          await request(
            appsList({
              body: {
                page: input?.page,
                pageSize: input?.pageSize,
                scopes: scopes(input?.scopes),
              },
              client,
            })
          ),
        update: async (input: Input<"apps", "update">) =>
          await request(
            appsUpdate({
              body: {
                app: platformAppSelector(input.appId),
                description: input.description,
                isShared: input.isShared,
                name: input.name,
                scope,
              },
              client,
            })
          ),
      },
      cliAuth: {
        verifyToken: async () =>
          await request(
            cliAuthVerifyToken({ body: { deployToken: agent.token }, client })
          ),
      },
      deployments: {
        create: async (input: Input<"deployments", "create">) => {
          const { appId, ...deployment } = input;

          return await request(
            deploymentsCreate({
              body: { ...deployment, app: platformAppSelector(appId), scope },
              client,
            })
          );
        },
        get: async (input: Input<"deployments", "get">) =>
          await request(
            deploymentsGet({
              body: { scopes: scopes(input.scopes) },
              client,
              path: { deploymentId: input.deploymentId },
            })
          ),
        list: async (input: Input<"deployments", "list">) =>
          await request(
            deploymentsList({
              body: {
                app: platformAppSelector(input.appId),
                page: input.page,
                pageSize: input.pageSize,
                scopes: scopes(input.scopes),
              },
              client,
            })
          ),
        publish: async (input: Input<"deployments", "publish">) =>
          await request(
            deploymentsPublish({
              body: { rollout: input.rollout, scope },
              client,
              path: { deploymentId: input.deploymentId },
            })
          ),
      },
    } as unknown as CliClient
    /* oxlint-enable typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions */
  );
};
