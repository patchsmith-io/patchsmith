import { handlerGen, middlewareGen } from "@orpc/experimental-effect";
import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { maxDeploymentBytes } from "@patchsmith/asset-delivery";
import {
  maxLogoBytes,
  logoContentTypes,
} from "@patchsmith/asset-delivery/logo-validation";
import { isStaticAssetPath } from "@patchsmith/asset-delivery/static-assets";
import {
  AppAsset,
  AppDeployment,
  appDeployment,
  AppDeploymentFile,
  appDeploymentFile,
} from "@patchsmith/db/schema/apps";
import type { Scope } from "@patchsmith/db/schema/scope";
import { setSpanAttributes } from "@patchsmith/observability";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

import { appSelectorSchema } from "#app-selector";
import { hexToBase64, publishDeployment } from "#deployments/verification";
import { paginatedOutput, paginationQuery } from "#pagination";
import { o, cliRouter, requireApp, requireAppInScopes } from "#procedures";
import {
  canonicalizeScope,
  canonicalizeScopes,
  scopeMatches,
  scopeSchema,
  scopesSchema,
} from "#scope";
import { attempt, PlatformDatabase, PlatformIds } from "#services";

import { getRuntimeBundle, publishRuntimeMetadata } from "./app-runtime";
import { verificationUnavailableMessage } from "./deployment-effects";
import {
  deploymentStaticAssets,
  linkStaticAssets,
  prepareStaticAssets,
  staticAssetsInput,
} from "./static-assets";

const uploadUrlExpiresInSeconds = 15 * 60;

const deploymentFileMetadataFields = {
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/iu)
    .transform((checksum) => checksum.toLowerCase()),
};

const createDeploymentAssetInput = z.object({
  ...deploymentFileMetadataFields,
  contentLength: z.number().int().min(1),
  contentType: z.literal("application/javascript"),
  encoding: z.enum(["utf-8", "gzip"]),
  objectKey: z.literal("client.js"),
});

const createDeploymentServerInput = createDeploymentAssetInput.extend({
  contentLength: z.number().int().min(1).max(maxDeploymentBytes),
  objectKey: z.literal("server.js"),
});

const logoPathSchema = z
  .string()
  .refine(isStaticAssetPath, "Invalid logo asset path");

const deploymentLogos = z.object({
  dark: logoPathSchema.optional(),
  light: logoPathSchema.optional(),
});

const createDeploymentInput = z
  .object({
    app: appSelectorSchema,
    assets: z.tuple([createDeploymentAssetInput]),
    hooks: AppDeployment.shape.hooks.optional(),
    logos: deploymentLogos.optional(),
    scope: scopeSchema,
    server: createDeploymentServerInput.optional(),
    staticAssets: staticAssetsInput.optional(),
    views: AppDeployment.shape.views.optional(),
  })
  .refine(
    ({ hooks, server }) => (hooks?.length ?? 0) === 0 || server !== undefined,
    {
      message: "Hooks require a server bundle.",
    }
  )
  .refine(
    ({ assets, server, staticAssets }) =>
      assets.reduce((total, asset) => total + asset.contentLength, 0) +
        (server?.contentLength ?? 0) +
        (staticAssets ?? []).reduce(
          (total, asset) => total + asset.contentLength,
          0
        ) <=
      maxDeploymentBytes,
    {
      message: `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes.`,
    }
  );

const deploymentAssetUpload = z.object({
  file: AppDeploymentFile,
  headers: z.record(z.string(), z.string()).optional(),
  uploadUrl: z.url(),
});

export const mapReturnedFilesByAssetPath = <TFile extends { id: string }>(
  assets: readonly { asset: { objectKey: string }; fileId: string }[],
  files: readonly TFile[]
) => {
  const fileById = new Map(files.map((file) => [file.id, file]));

  return new Map(
    assets.map(({ asset, fileId }) => {
      const file = fileById.get(fileId);

      if (!file) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Failed to resolve deployment asset.",
        });
      }

      return [asset.objectKey, file] as const;
    })
  );
};

const requireDeployment = o.middleware(
  middlewareGen(function* requireDeployment(
    { next, context },
    input: { deploymentId: string; scope?: Scope; scopes?: Scope[] }
  ) {
    const db = yield* PlatformDatabase;

    setSpanAttributes({
      "patchsmith.middleware": "require_deployment",
      "patchsmith.package": "api-platform",
      "patchsmith.resource_type": "deployment",
    });

    const deploymentWithApp = yield* attempt(
      async () =>
        await db.query.appDeployment.findFirst({
          where: {
            id: input.deploymentId,
          },
          with: {
            app: true,
          },
        })
    );

    const deploymentApp = deploymentWithApp?.app;

    const requestedScopes = yield* Effect.try({
      catch: () =>
        new ORPCError("BAD_REQUEST", { message: "Invalid deployment scope." }),
      try: () =>
        input.scope
          ? [canonicalizeScope(input.scope).scope]
          : canonicalizeScopes(input.scopes).map(({ scope }) => scope),
    });

    const storedScope = yield* Effect.sync(() => {
      if (!deploymentApp) {
        return null;
      }

      try {
        const canonicalScope = canonicalizeScope(deploymentApp.scope);

        if (canonicalScope.scopeKey !== deploymentApp.scopeKey) {
          throw new TypeError(
            "Deployment app scope key does not match its stored scope."
          );
        }

        return canonicalScope;
      } catch (error) {
        console.warn("Deployment app has an invalid stored scope.", {
          appId: deploymentApp.id,
          deploymentId: input.deploymentId,
          error,
        });

        return null;
      }
    });

    const scopeMatchesApp =
      storedScope !== null &&
      requestedScopes.some((scope) => scopeMatches(storedScope.scope, scope));

    if (
      !deploymentWithApp ||
      !deploymentApp ||
      deploymentApp.projectId !== context.project.id ||
      !scopeMatchesApp
    ) {
      return yield* Effect.fail(
        new ORPCError("NOT_FOUND", { message: "Deployment not found." })
      );
    }

    const { app: _app, ...deployment } = deploymentWithApp;
    void _app;

    // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- oRPC preserves downstream procedure failures.
    return yield* next({
      context: { ...context, app: deploymentApp, deployment },
    });
  })
);

const listAppDeployments = cliRouter
  .meta(
    openapi({
      method: "POST",
      path: "/deployments/list",
    })
  )
  .input(
    z.object({
      body: paginationQuery.extend({
        app: appSelectorSchema,
        scopes: scopesSchema,
      }),
    })
  )
  .output(paginatedOutput(AppDeployment))
  .use(requireAppInScopes.adaptInput(({ body }) => body))
  .handler(
    handlerGen(function* listAppDeployments({ context, input }) {
      const db = yield* PlatformDatabase;

      const { page, pageSize } = input.body;

      const deployments = yield* attempt(
        async () =>
          await db.query.appDeployment.findMany({
            limit: pageSize + 1,
            offset: (page - 1) * pageSize,
            orderBy: {
              createdAt: "desc",
            },
            where: {
              appId: context.app.id,
            },
          })
      );

      return {
        body: {
          items: deployments.slice(0, pageSize),
          pagination: {
            hasMore: deployments.length > pageSize,
            page,
            pageSize,
          },
        },
      };
    })
  );

const getAppDeployment = cliRouter
  .meta(
    openapi({
      method: "POST",
      path: "/deployments/{deploymentId}/lookup",
    })
  )
  .input(
    z.object({
      body: z.object({ scopes: scopesSchema }),
      params: z.object({ deploymentId: z.string() }),
    })
  )
  .output(
    z.object({
      body: AppDeployment.extend({ staticAssets: z.array(AppAsset) }),
    })
  )
  .use(
    requireDeployment.adaptInput(
      ({ params: { deploymentId }, body: { scopes } }) => ({
        deploymentId,
        scopes,
      })
    )
  )
  .handler(
    handlerGen(function* getDeployment({ context }) {
      return {
        body: {
          ...context.deployment,
          staticAssets: yield* deploymentStaticAssets(context.deployment.id),
        },
      };
    })
  );

const createAppDeployment = cliRouter
  .meta(
    openapi({
      method: "POST",
      path: "/deployments",
    })
  )
  .input(
    z.object({
      body: createDeploymentInput,
    })
  )
  .output(
    z.object({
      body: z.object({
        assets: z.array(deploymentAssetUpload),
        deployment: AppDeployment,
        server: deploymentAssetUpload.optional(),
        staticAssets: z
          .array(
            z.object({
              file: AppAsset,
              headers: z.record(z.string(), z.string()).optional(),
              uploadUrl: z.url().optional(),
            })
          )
          .optional(),
      }),
    })
  )
  .use(requireApp.adaptInput(({ body }) => body))
  .handler(
    handlerGen(function* createDeployment({ context, input }) {
      const db = yield* PlatformDatabase;
      const ids = yield* PlatformIds;
      const deploymentId = crypto.randomUUID();
      const deploymentShortId = yield* ids.shortId;

      const preparedStaticAssets = yield* prepareStaticAssets(
        context,
        input.body.staticAssets ?? []
      );

      for (const logoPath of Object.values(input.body.logos ?? {})) {
        const asset = preparedStaticAssets.find(
          (entry) => entry.path === logoPath
        );

        if (
          !asset ||
          !logoContentTypes.some((type) => type === asset.contentType) ||
          asset.contentLength > maxLogoBytes
        ) {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", {
              message:
                "Logos must reference SVG, PNG, or WebP assets within the logo size limit.",
            })
          );
        }
      }

      const requestedAssets = [
        ...input.body.assets.map((asset) => ({
          asset,
          kind: "client" as const,
        })),
        ...(input.body.server
          ? [{ asset: input.body.server, kind: "server" as const }]
          : []),
      ];

      const assets = yield* Effect.forEach(
        requestedAssets,
        ({ asset, kind }) =>
          Effect.gen(function* prepareBundle() {
            const fileId = crypto.randomUUID();
            const objectKey = `projects/${context.project.shortId}/apps/${context.app.shortId}/deployments/${deploymentShortId}/${kind}/${asset.objectKey}`;

            const upload = yield* attempt(
              async () =>
                await context.storage.createUploadUrl({
                  checksumSha256: hexToBase64(asset.checksum),
                  contentEncoding:
                    asset.encoding === "gzip" ? "gzip" : undefined,
                  contentType: asset.contentType,
                  expiresInSeconds: uploadUrlExpiresInSeconds,
                  key: objectKey,
                  metadata: {
                    appDeploymentId: deploymentId,
                    appId: context.app.id,
                    fileId,
                  },
                })
            );

            return { asset, fileId, objectKey, upload };
          }),
        { concurrency: 4 }
      );

      // Drizzle owns commit/rollback; only this transaction callback bridges back to promises.
      return yield* attempt(
        async (signal) =>
          await db.transaction(async (tx) => {
            const [deployment] = await tx
              .insert(appDeployment)
              .values({
                appId: context.app.id,
                hooks: input.body.hooks ?? [],
                id: deploymentId,
                shortId: deploymentShortId,
                status: "uploading",
                views: input.body.views ?? [],
              })
              .returning();

            if (!deployment) {
              throw new ORPCError("BAD_REQUEST", {
                message: "Failed to create deployment.",
              });
            }

            const files = await tx
              .insert(appDeploymentFile)
              .values(
                assets.map(({ asset, fileId, objectKey }) => ({
                  appDeploymentId: deployment.id,
                  checksum: asset.checksum,
                  contentLength: asset.contentLength,
                  contentType: asset.contentType,
                  encoding: asset.encoding,
                  id: fileId,
                  objectKey,
                }))
              )
              .returning();

            const fileByAssetPath = mapReturnedFilesByAssetPath(assets, files);

            const uploads = assets.map(({ asset, upload }) => {
              const file = fileByAssetPath.get(asset.objectKey);

              if (!file) {
                throw new ORPCError("BAD_REQUEST", {
                  message: "Failed to resolve deployment asset.",
                });
              }

              return {
                file,
                headers: upload.headers,
                uploadUrl: upload.uploadUrl,
              };
            });

            const [clientUpload] = uploads;

            if (!clientUpload) {
              throw new ORPCError("BAD_REQUEST", {
                message: "Missing client bundle.",
              });
            }

            const logoAssetPath = (variant: "dark" | "light") => {
              const asset = preparedStaticAssets.find(
                (entry) => entry.path === input.body.logos?.[variant]
              );

              return asset ? `assets/${asset.checksum}/${asset.path}` : null;
            };

            const [updatedDeployment] = await tx
              .update(appDeployment)
              .set({
                clientEntryFileId: clientUpload.file.id,
                logoDarkPath: logoAssetPath("dark"),
                logoLightPath: logoAssetPath("light"),
              })
              .where(eq(appDeployment.id, deployment.id))
              .returning();

            if (!updatedDeployment) {
              throw new ORPCError("BAD_REQUEST", {
                message: "Failed to update deployment asset.",
              });
            }

            const staticAssets = await Effect.runPromise(
              linkStaticAssets(
                tx,
                context.app.id,
                deployment.id,
                preparedStaticAssets
              ),
              { signal }
            );

            return {
              body: {
                assets: [clientUpload],
                deployment: updatedDeployment,
                server: uploads[1],
                staticAssets,
              },
            };
          })
      );
    })
  );

const publishAppDeployment = cliRouter
  .meta(
    openapi({
      method: "POST",
      path: "/deployments/{deploymentId}",
    })
  )
  .errors({
    BAD_REQUEST: {
      message:
        "Invalid deployment upload. Correct the upload before publishing again.",
    },
    CONFLICT: { message: "Deployment publication is already in progress." },
    SERVICE_UNAVAILABLE: { message: verificationUnavailableMessage },
  })
  .input(
    z.object({
      body: z.object({
        rollout: z.boolean().optional().default(true),
        scope: scopeSchema,
      }),
      params: z.object({ deploymentId: z.string() }),
    })
  )
  .output(z.object({ body: AppDeployment }))
  .use(
    requireDeployment.adaptInput(
      ({ body: { scope }, params: { deploymentId } }) => ({
        deploymentId,
        scope,
      })
    )
  )
  .handler(
    handlerGen(function* publishRequestedDeployment({ context, input }) {
      const database = yield* PlatformDatabase;

      return {
        body: yield* publishDeployment(
          database,
          context,
          input.body.rollout,
          async (metadata, appShortId) => {
            await publishRuntimeMetadata(metadata, appShortId, context);
          }
        ),
      };
    })
  );

export const deploymentRouter = o.router({
  create: createAppDeployment,
  get: getAppDeployment,
  list: listAppDeployments,
  publish: publishAppDeployment,
  runtime: getRuntimeBundle,
});
