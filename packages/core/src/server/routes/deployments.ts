import { ORPCError } from "@orpc/server";
import {
  deploymentsCreate,
  deploymentsGet,
  deploymentsList,
  deploymentsPublish,
} from "@patchsmith/client-platform/client";
import * as v from "valibot";

import { platformAppSelector } from "#server/platform-app-selector";
import {
  getPatchsmithScope,
  getPatchsmithScopes,
  o,
  requireCliDeployToken,
} from "#server/procedures";

const isStringValue = <TValue>(value: TValue): value is TValue & string =>
  typeof value === "string";

const isObjectValue = <TValue>(value: TValue): value is TValue & object =>
  typeof value === "object" && value !== null;

const paginationInput = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  pageSize: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))
  ),
});

const clientAssetInput = v.object({
  checksum: v.string(),
  contentLength: v.pipe(v.number(), v.integer(), v.minValue(1)),
  contentType: v.literal("application/javascript"),
  encoding: v.picklist(["utf-8", "gzip"]),
  objectKey: v.literal("client.js"),
});

const serverAssetInput = v.object({
  ...clientAssetInput.entries,
  objectKey: v.literal("server.js"),
});

const deploymentAssetsInput = v.tuple([clientAssetInput]);

const deploymentLogosInput = v.optional(
  v.object({
    dark: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(512))),
    light: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(512))),
  })
);

const getErrorMessage = (cause: unknown): string | undefined => {
  if (cause instanceof Error) {
    return cause.message;
  }

  if (isStringValue(cause)) {
    return cause;
  }

  if (isObjectValue(cause) && "message" in cause) {
    const { message } = cause;

    return isStringValue(message) ? message : undefined;
  }

  return undefined;
};

const isNotFoundError = (cause: unknown): boolean =>
  getErrorMessage(cause)?.toLowerCase().includes("not found") ?? false;

const preservePlatformNotFound = (cause: unknown): never => {
  if (isNotFoundError(cause)) {
    throw new ORPCError("NOT_FOUND", { message: "App not found." });
  }

  throw cause;
};

export const deploymentRouter = {
  create: o
    .use(requireCliDeployToken)
    .input(
      v.object({
        appId: v.string(),
        assets: deploymentAssetsInput,
        hooks: v.optional(
          v.pipe(
            v.array(
              v.pipe(
                v.string(),
                v.minLength(1),
                v.maxLength(255),
                v.regex(
                  /^[a-zA-Z][a-zA-Z0-9_]{0,63}(?:\.[a-zA-Z][a-zA-Z0-9_]{0,63})*$/u
                )
              )
            ),
            v.maxLength(1000),
            v.check((names) => new Set(names).size === names.length)
          )
        ),
        logos: deploymentLogosInput,
        server: v.optional(serverAssetInput),
        staticAssets: v.optional(
          v.pipe(
            v.array(
              v.object({
                checksum: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)),
                contentLength: v.pipe(v.number(), v.integer(), v.minValue(1)),
                path: v.pipe(
                  v.string(),
                  v.maxLength(512),
                  v.regex(
                    /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/u
                  )
                ),
              })
            ),
            v.maxLength(256)
          )
        ),
        views: v.optional(
          v.pipe(
            v.array(
              v.object({
                disabled: v.optional(v.literal(true)),
                instances: v.optional(v.literal(true)),
                path: v.pipe(v.string(), v.startsWith("/"), v.maxLength(1024)),
                slot: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
                staticInstances: v.optional(
                  v.array(
                    v.object({
                      data: v.unknown(),
                      key: v.pipe(v.string(), v.minLength(1)),
                      metadata: v.record(v.string(), v.unknown()),
                    })
                  )
                ),
              })
            ),
            v.maxLength(1000)
          )
        ),
      })
    )
    .handler(async ({ context, input }) => {
      try {
        return await deploymentsCreate({
          body: {
            app: platformAppSelector(input.appId),
            assets: input.assets,
            hooks: input.hooks,
            logos: input.logos,
            scope: getPatchsmithScope(context),
            server: input.server,
            staticAssets: input.staticAssets,
            views: input.views,
          },
          client: context.platform,
          headers: context.platformHeaders,
        });
      } catch (error) {
        return preservePlatformNotFound(error);
      }
    }),
  get: o
    .use(requireCliDeployToken)
    .input(
      v.object({
        deploymentId: v.string(),
        scopes: v.optional(v.array(v.string())),
      })
    )
    .handler(
      async ({ context, input }) =>
        await deploymentsGet({
          body: { scopes: getPatchsmithScopes(context, input.scopes) },
          client: context.platform,
          headers: context.platformHeaders,
          path: { deploymentId: input.deploymentId },
        })
    ),
  list: o
    .use(requireCliDeployToken)
    .input(
      v.object({
        appId: v.string(),
        scopes: v.optional(v.array(v.string())),
        ...paginationInput.entries,
      })
    )
    .handler(
      async ({ context, input }) =>
        await deploymentsList({
          body: {
            app: platformAppSelector(input.appId),
            page: input.page,
            pageSize: input.pageSize,
            scopes: getPatchsmithScopes(context, input.scopes),
          },
          client: context.platform,
          headers: context.platformHeaders,
        })
    ),
  publish: o
    .use(requireCliDeployToken)
    .input(
      v.object({
        deploymentId: v.string(),
        rollout: v.optional(v.boolean()),
      })
    )
    .handler(
      async ({ context, input }) =>
        await deploymentsPublish({
          body: { rollout: input.rollout, scope: getPatchsmithScope(context) },
          client: context.platform,
          headers: context.platformHeaders,
          path: { deploymentId: input.deploymentId },
        })
    ),
};
