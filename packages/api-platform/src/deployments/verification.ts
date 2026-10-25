import { ORPCError } from "@orpc/server";
import type { AppDeploymentMetadata } from "@patchsmith/api-utils/app-auth";
import { maxDeploymentBytes } from "@patchsmith/asset-delivery";
import type { relations } from "@patchsmith/db/relations";
import type { App, AppDeployment } from "@patchsmith/db/schema/apps";
import {
  app,
  appDeployment,
  appDeploymentFile,
} from "@patchsmith/db/schema/apps";
import { and, eq, inArray } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PgAsyncDatabase } from "drizzle-orm/pg-core/async";
import { Effect } from "effect";
import { z } from "zod";

import type { Context } from "#context";
import {
  deploymentOperation,
  inspectUploadedAsset,
  uploadedAssetMetadata,
  UploadValidationError,
  verificationFailure,
} from "#routes/deployment-effects";
import {
  deploymentStaticAssets,
  verifyStaticAssets,
} from "#routes/static-assets";
import { selectRuntimeDeployment } from "#runtime/deployment-steps";

const hexToBase64 = (hex: string) => Buffer.from(hex, "hex").toString("base64");

const inspectCompressedBundle = (
  storage: Context["storage"],
  objectKey: string,
  remainingBytes: number
) =>
  inspectUploadedAsset(storage, objectKey, "Bundle", async (body) => {
    // Node fetch decodes R2's Content-Encoding before exposing the response body.
    let contentLength = 0;

    try {
      for await (const value of body) {
        contentLength += value.byteLength;

        if (contentLength > remainingBytes) {
          throw new UploadValidationError(
            `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes after decompression.`
          );
        }
      }
    } catch (error) {
      // Node fetch wraps decompression failures in a TypeError. Stream/network
      // errors without a known zlib code remain retryable infrastructure errors.
      const invalidGzip = z.object({
        code: z.enum(["Z_DATA_ERROR", "Z_BUF_ERROR"]),
      });

      const wrapped = z.object({ cause: invalidGzip }).safeParse(error);

      if (invalidGzip.safeParse(error).success || wrapped.success) {
        throw new UploadValidationError(
          "Uploaded bundle is not valid gzip content.",
          error
        );
      }

      throw error;
    }

    if (contentLength === 0) {
      throw new UploadValidationError("Uploaded bundle is empty.");
    }

    return contentLength;
  });

interface PublicationContext extends Pick<Context, "project" | "storage"> {
  app: App;
  deployment: AppDeployment;
}

type EnqueueRuntime = (
  metadata: AppDeploymentMetadata,
  appShortId: string
) => Promise<void>;

/** Database writes cannot outlive the publication claim when storage verification is interrupted. */
const publicationWrite = <A>(write: () => PromiseLike<A>) =>
  deploymentOperation(write).pipe(Effect.uninterruptible);

const publishClaimedDeployment = <TResult extends PgQueryResultHKT>(
  database: PgAsyncDatabase<TResult, typeof relations>,
  context: PublicationContext,
  rollout: boolean,
  enqueueRuntime: EnqueueRuntime
) =>
  Effect.gen(function* publish() {
    const { deployment } = context;

    const files = yield* deploymentOperation(() =>
      database.query.appDeploymentFile.findMany({
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

    const staticAssets = yield* deploymentStaticAssets(
      deployment.id,
      database.query
    );

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

    yield* Effect.gen(function* verifyDeployment() {
      yield* Effect.forEach(
        files,
        (file) =>
          Effect.gen(function* verifyBundle() {
            yield* publicationWrite(() =>
              database
                .update(appDeploymentFile)
                .set({ status: "verifying" })
                .where(eq(appDeploymentFile.id, file.id))
            );

            const verification = Effect.gen(function* inspectBundle() {
              const object = yield* uploadedAssetMetadata(
                context.storage,
                file.objectKey
              );

              if (object.contentLength !== file.contentLength) {
                return yield* Effect.fail(
                  new UploadValidationError(
                    "Uploaded file content length does not match deployment record."
                  )
                );
              }

              if (object.contentType !== file.contentType) {
                return yield* Effect.fail(
                  new UploadValidationError(
                    "Uploaded file content type does not match deployment record."
                  )
                );
              }

              if (
                (object.contentEncoding ?? undefined) !==
                (file.encoding === "gzip" ? "gzip" : undefined)
              ) {
                return yield* Effect.fail(
                  new UploadValidationError(
                    "Uploaded file content encoding does not match deployment record."
                  )
                );
              }

              if (
                file.checksum === null ||
                file.checksum === "" ||
                object.checksumSha256 !== hexToBase64(file.checksum)
              ) {
                return yield* Effect.fail(
                  new UploadValidationError(
                    "Uploaded file checksum does not match deployment record."
                  )
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
                  new UploadValidationError(
                    `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes after decompression.`
                  )
                );
              }

              return decodedBytes;
            });

            yield* verification;
            yield* publicationWrite(() =>
              database
                .update(appDeploymentFile)
                .set({ status: "verified" })
                .where(eq(appDeploymentFile.id, file.id))
            );
          }).pipe(
            Effect.onError(() =>
              publicationWrite(() =>
                database
                  .update(appDeploymentFile)
                  .set({ status: "failed" })
                  .where(eq(appDeploymentFile.id, file.id))
              ).pipe(Effect.orDie)
            )
          ),
        { discard: true }
      );
      yield* verifyStaticAssets(
        context.storage,
        staticAssets,
        [deployment.logoDarkPath, deployment.logoLightPath],
        database
      );
    }).pipe(Effect.mapError(verificationFailure));

    // Once commit begins, finish selection and enqueueing even if the caller disconnects.
    return yield* Effect.gen(function* commitPublication() {
      const publication = yield* deploymentOperation(
        async () =>
          await database.transaction(async (tx) => {
            const [publishedDeployment] = await tx
              .update(appDeployment)
              .set({ status: "published" })
              .where(
                and(
                  eq(appDeployment.id, deployment.id),
                  eq(appDeployment.status, "verifying")
                )
              )
              .returning();

            if (!publishedDeployment) {
              throw new ORPCError("CONFLICT", {
                message: "Deployment publication claim was lost.",
              });
            }

            let selected = false;

            if (rollout) {
              await tx
                .update(app)
                .set({ currentDeploymentId: publishedDeployment.id })
                .where(
                  and(
                    eq(app.id, context.app.id),
                    eq(app.projectId, context.project.id)
                  )
                );
              selected = await selectRuntimeDeployment(
                {
                  appId: context.app.id,
                  deploymentId: publishedDeployment.id,
                  projectId: context.project.id,
                },
                tx
              );
            }

            return { publishedDeployment, selected };
          })
      );

      const { publishedDeployment, selected } = publication;

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
          await enqueueRuntime(
            {
              appId: context.app.id,
              checksum,
              contentEncoding: server.encoding === "gzip" ? "gzip" : undefined,
              contentLength: server.contentLength,
              deploymentId: publishedDeployment.id,
              objectKey: server.objectKey,
              projectId: context.project.id,
            },
            context.app.shortId
          );
        });
      }

      return publishedDeployment;
    }).pipe(Effect.uninterruptible);
  });

/**
 * Only the atomic transition into verifying grants ownership. Failed and cancelled
 * owners release after all writes settle. Published deployments are immutable:
 * repeats return the stored result and retain the first successful rollout choice.
 * Crashed workers require the manual recovery procedure in api-platform/README.md;
 * never reclaim by age alone without fencing the old owner's writes and cleanup.
 */
export const publishDeployment = <TResult extends PgQueryResultHKT>(
  database: PgAsyncDatabase<TResult, typeof relations>,
  context: PublicationContext,
  rollout: boolean,
  enqueueRuntime: EnqueueRuntime
) =>
  Effect.acquireUseRelease(
    deploymentOperation(async () => {
      const [claimed] = await database
        .update(appDeployment)
        .set({ status: "verifying" })
        .where(
          and(
            eq(appDeployment.id, context.deployment.id),
            inArray(appDeployment.status, ["uploading", "deploying"])
          )
        )
        .returning();

      if (claimed) {
        return { acquired: true, deployment: claimed };
      }

      const existing = await database.query.appDeployment.findFirst({
        where: { id: context.deployment.id },
      });

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "Deployment not found." });
      }

      if (existing.status === "published") {
        return { acquired: false, deployment: existing };
      }

      throw new ORPCError("CONFLICT", {
        message:
          "Deployment publication is already in progress. Retry when it finishes.",
      });
    }),
    ({ acquired, deployment }) =>
      acquired
        ? publishClaimedDeployment(
            database,
            { ...context, deployment },
            rollout,
            enqueueRuntime
          )
        : Effect.succeed(deployment),
    ({ acquired, deployment }) =>
      acquired
        ? deploymentOperation(async () => {
            await database.transaction(async (tx) => {
              // Release and reset unfinished file writes together; a replacement waits for commit.
              const [released] = await tx
                .update(appDeployment)
                .set({ status: "uploading" })
                .where(
                  and(
                    eq(appDeployment.id, deployment.id),
                    eq(appDeployment.status, "verifying")
                  )
                )
                .returning({ id: appDeployment.id });

              if (released) {
                await tx
                  .update(appDeploymentFile)
                  .set({ status: "uploading" })
                  .where(
                    and(
                      eq(appDeploymentFile.appDeploymentId, deployment.id),
                      eq(appDeploymentFile.status, "verifying")
                    )
                  );
              }
            });
          }).pipe(Effect.orDie)
        : Effect.void
  );
