import { handlerGen } from "@orpc/experimental-effect";
import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { maxDeploymentBytes } from "@patchsmith/asset-delivery";
import {
  maxLogoBytes,
  logoContentTypes,
} from "@patchsmith/asset-delivery/logo-validation";
import { isStaticAssetPath } from "@patchsmith/asset-delivery/static-assets";
import { db } from "@patchsmith/db";
import {
  app,
  AppAsset,
  AppDeployment,
  appDeployment,
  AppDeploymentFile,
  appDeploymentFile,
} from "@patchsmith/db/schema/apps";
import type { Scope } from "@patchsmith/db/schema/scope";
import { createShortId } from "@patchsmith/db/short-id";
import { setSpanAttributes } from "@patchsmith/observability";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

import { appSelectorSchema } from "#app-selector";
import type { Context } from "#context";
import { paginatedOutput, paginationQuery } from "#pagination";
import { o, cliRouter, requireApp, requireAppInScopes } from "#procedures";
import {
  canonicalizeScope,
  canonicalizeScopes,
  scopeMatches,
  scopeSchema,
  scopesSchema,
} from "#scope";

import {
  deploymentOperation,
  inspectUploadedAsset,
} from "./deployment-effects";
import { getRuntimeBundle, publishRuntimeMetadata } from "./runtime";
import {
  deploymentStaticAssets,
  linkStaticAssets,
  prepareStaticAssets,
  staticAssetsInput,
  verifyStaticAssets,
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

const hexToBase64 = (hex: string) => Buffer.from(hex, "hex").toString("base64");

const inspectCompressedBundle = (
  storage: Context["storage"],
  objectKey: string,
  remainingBytes: number
) =>
  inspectUploadedAsset(storage, objectKey, "Bundle", async (body) => {
    // Node fetch decodes R2's Content-Encoding before exposing the response body.
    let contentLength = 0;

    for await (const value of body) {
      contentLength += value.byteLength;

      if (contentLength > remainingBytes) {
        throw new Error(
          `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes after decompression.`
        );
      }
    }

    if (contentLength === 0) {
      throw new Error("Failed to inspect uploaded bundle.");
    }

    return contentLength;
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
  async (
    { next, context },
    input: { deploymentId: string; scope?: Scope; scopes?: Scope[] }
  ) => {
    setSpanAttributes({
      "patchsmith.middleware": "require_deployment",
      "patchsmith.package": "api-platform",
      "patchsmith.resource_type": "deployment",
    });

    const deploymentWithApp = await db.query.appDeployment.findFirst({
      where: {
        id: input.deploymentId,
      },
      with: {
        app: true,
      },
    });

    const deploymentApp = deploymentWithApp?.app;

    let requestedScopes: Scope[];

    try {
      requestedScopes = input.scope
        ? [canonicalizeScope(input.scope).scope]
        : canonicalizeScopes(input.scopes).map(({ scope }) => scope);
    } catch {
      throw new ORPCError("BAD_REQUEST", {
        message: "Invalid deployment scope.",
      });
    }

    let storedScope: ReturnType<typeof canonicalizeScope> | null = null;

    if (deploymentApp) {
      try {
        const canonicalScope = canonicalizeScope(deploymentApp.scope);

        if (canonicalScope.scopeKey !== deploymentApp.scopeKey) {
          throw new TypeError(
            "Deployment app scope key does not match its stored scope."
          );
        }

        storedScope = canonicalScope;
      } catch (error) {
        console.warn("Deployment app has an invalid stored scope.", {
          appId: deploymentApp.id,
          deploymentId: input.deploymentId,
          error,
        });
      }
    }

    const scopeMatchesApp =
      storedScope !== null &&
      requestedScopes.some((scope) => scopeMatches(storedScope.scope, scope));

    if (
      !deploymentWithApp ||
      !deploymentApp ||
      deploymentApp.projectId !== context.project.id ||
      !scopeMatchesApp
    ) {
      throw new ORPCError("NOT_FOUND", { message: "Deployment not found." });
    }

    const { app: _app, ...deployment } = deploymentWithApp;
    void _app;

    return await next({
      context: { ...context, app: deploymentApp, deployment },
    });
  }
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
  .handler(async ({ context, input }) => {
    const { page, pageSize } = input.body;

    const deployments = await db.query.appDeployment.findMany({
      limit: pageSize + 1,
      offset: (page - 1) * pageSize,
      orderBy: {
        createdAt: "desc",
      },
      where: {
        appId: context.app.id,
      },
    });

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
  });

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
      const deploymentId = crypto.randomUUID();
      const deploymentShortId = createShortId();

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

            const upload = yield* deploymentOperation(
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
      return yield* deploymentOperation(
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
    handlerGen(function* publishDeployment({ context, input }) {
      const { deployment } = context;

      const files = yield* deploymentOperation(() =>
        db.query.appDeploymentFile.findMany({
          where: { appDeploymentId: deployment.id },
        })
      );

      if (files.length === 0) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", {
            message: "Deployment has no files to publish.",
          })
        );
      }

      const staticAssets = yield* deploymentStaticAssets(deployment.id);

      const staticBytes = staticAssets.reduce(
        (total, asset) => total + asset.contentLength,
        0
      );

      const storedBytes =
        staticBytes +
        files.reduce((total, file) => total + file.contentLength, 0);

      if (storedBytes > maxDeploymentBytes) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", {
            message: `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes.`,
          })
        );
      }

      let deploymentBytes = staticBytes;
      yield* deploymentOperation(() =>
        db
          .update(appDeployment)
          .set({ status: "verifying" })
          .where(eq(appDeployment.id, deployment.id))
      );

      yield* Effect.gen(function* verifyDeployment() {
        yield* Effect.forEach(
          files,
          (file) =>
            Effect.gen(function* verifyBundle() {
              yield* deploymentOperation(() =>
                db
                  .update(appDeploymentFile)
                  .set({ status: "verifying" })
                  .where(eq(appDeploymentFile.id, file.id))
              );

              const verification = Effect.gen(function* inspectBundle() {
                const object = yield* deploymentOperation(
                  async () =>
                    await context.storage.head({ key: file.objectKey })
                );

                if (object.contentLength !== file.contentLength) {
                  return yield* Effect.fail(
                    new ORPCError("BAD_REQUEST", {
                      message:
                        "Uploaded file content length does not match deployment record.",
                    })
                  );
                }

                if (object.contentType !== file.contentType) {
                  return yield* Effect.fail(
                    new ORPCError("BAD_REQUEST", {
                      message:
                        "Uploaded file content type does not match deployment record.",
                    })
                  );
                }

                if (
                  (object.contentEncoding ?? undefined) !==
                  (file.encoding === "gzip" ? "gzip" : undefined)
                ) {
                  return yield* Effect.fail(
                    new ORPCError("BAD_REQUEST", {
                      message:
                        "Uploaded file content encoding does not match deployment record.",
                    })
                  );
                }

                if (
                  file.checksum === null ||
                  file.checksum === "" ||
                  object.checksumSha256 !== hexToBase64(file.checksum)
                ) {
                  return yield* Effect.fail(
                    new ORPCError("BAD_REQUEST", {
                      message:
                        "Uploaded file checksum does not match deployment record.",
                    })
                  );
                }

                const decodedBytes =
                  file.encoding === "gzip"
                    ? yield* inspectCompressedBundle(
                        context.storage,
                        file.objectKey,
                        maxDeploymentBytes - deploymentBytes
                      )
                    : file.contentLength;

                deploymentBytes += decodedBytes;

                if (deploymentBytes > maxDeploymentBytes) {
                  return yield* Effect.fail(
                    new ORPCError("BAD_REQUEST", {
                      message: `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes after decompression.`,
                    })
                  );
                }

                return decodedBytes;
              }).pipe(
                Effect.mapError(
                  (cause) =>
                    new ORPCError("BAD_REQUEST", {
                      cause,
                      message: cause.message,
                    })
                ),
                Effect.tapError(() =>
                  deploymentOperation(() =>
                    db
                      .update(appDeploymentFile)
                      .set({ status: "failed" })
                      .where(eq(appDeploymentFile.id, file.id))
                  )
                )
              );

              yield* verification;
              yield* deploymentOperation(() =>
                db
                  .update(appDeploymentFile)
                  .set({ status: "verified" })
                  .where(eq(appDeploymentFile.id, file.id))
              );
            }),
          { discard: true }
        );
        yield* verifyStaticAssets(context.storage, staticAssets, [
          deployment.logoDarkPath,
          deployment.logoLightPath,
        ]);
      }).pipe(
        Effect.onError(() =>
          deploymentOperation(() =>
            db
              .update(appDeployment)
              .set({ status: "uploading" })
              .where(eq(appDeployment.id, deployment.id))
          ).pipe(Effect.orDie)
        )
      );

      const [publishedDeployment] = yield* deploymentOperation(() =>
        db
          .update(appDeployment)
          .set({ status: "published" })
          .where(eq(appDeployment.id, deployment.id))
          .returning()
      );

      if (!publishedDeployment) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", {
            message: "Failed to publish deployment.",
          })
        );
      }

      if (input.body.rollout) {
        yield* deploymentOperation(() =>
          db
            .update(app)
            .set({ currentDeploymentId: publishedDeployment.id })
            .where(
              and(
                eq(app.id, context.app.id),
                eq(app.projectId, context.project.id)
              )
            )
        );

        const selected = yield* deploymentOperation(async () => {
          const { selectRuntimeDeployment } =
            await import("#runtime/deployment-steps");

          return await selectRuntimeDeployment(
            {
              appId: context.app.id,
              deploymentId: publishedDeployment.id,
              projectId: context.project.id,
            },
            db
          );
        });

        const server = files.find((file) =>
          file.objectKey.endsWith("/server/server.js")
        );

        const checksum = server?.checksum;

        if (
          selected &&
          server &&
          checksum !== undefined &&
          checksum !== null &&
          checksum !== ""
        ) {
          yield* deploymentOperation(async () => {
            await publishRuntimeMetadata(
              {
                appId: context.app.id,
                checksum,
                contentEncoding:
                  server.encoding === "gzip" ? "gzip" : undefined,
                contentLength: server.contentLength,
                deploymentId: publishedDeployment.id,
                objectKey: server.objectKey,
                projectId: context.project.id,
              },
              context.app.shortId
            );
          });
        }
      }

      return { body: publishedDeployment };
    })
  );

export const deploymentRouter = o.router({
  create: createAppDeployment,
  get: getAppDeployment,
  list: listAppDeployments,
  publish: publishAppDeployment,
  runtime: getRuntimeBundle,
});
