import { ORPCError } from "@orpc/server";
import { maxDeploymentBytes } from "@patchsmith/asset-delivery";
import type { AppDeployment } from "@patchsmith/db/schema/apps";
import { appDeployment, appDeploymentFile } from "@patchsmith/db/schema/apps";
import { eq } from "drizzle-orm";
import { Effect, Exit } from "effect";
import { z } from "zod";

import type { Context } from "#context";
import {
  inspectUploadedAsset,
  uploadedAssetMetadata,
  UploadValidationError,
  verificationFailure,
} from "#routes/deployment-effects";
import {
  deploymentStaticAssets,
  verifyStaticAssets,
} from "#routes/static-assets";
import { attempt, PlatformDatabase } from "#services";

export const hexToBase64 = (hex: string) =>
  Buffer.from(hex, "hex").toString("base64");

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

export const verifyAndPublishDeploymentEffect = (
  deployment: Pick<AppDeployment, "id" | "logoDarkPath" | "logoLightPath">,
  storage: Context["storage"]
) =>
  Effect.gen(function* verifyAndPublishDeployment() {
    const db = yield* PlatformDatabase;

    const files = yield* attempt(() =>
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

    // Finish status writes before interruption cleanup can reset them. Storage
    // and inspection remain interruptible, and cannot resume this effect late.
    const publishedDeployment = yield* Effect.gen(function* verifyDeployment() {
      yield* attempt(() =>
        db
          .update(appDeployment)
          .set({ status: "verifying" })
          .where(eq(appDeployment.id, deployment.id))
      ).pipe(Effect.uninterruptible);
      yield* Effect.forEach(
        files,
        (file) =>
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* verifyBundle() {
              yield* attempt(async () => {
                await db
                  .update(appDeploymentFile)
                  .set({ status: "verifying" })
                  .where(eq(appDeploymentFile.id, file.id));
              });

              const verification = Effect.gen(function* inspectBundle() {
                const object = yield* uploadedAssetMetadata(
                  storage,
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
                        storage,
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

              yield* restore(
                verification.pipe(
                  Effect.tap(() =>
                    attempt(async () => {
                      await db
                        .update(appDeploymentFile)
                        .set({ status: "verified" })
                        .where(eq(appDeploymentFile.id, file.id));
                    })
                  )
                )
              ).pipe(
                Effect.onExit((exit) =>
                  Exit.isSuccess(exit)
                    ? Effect.void
                    : attempt(async () => {
                        await db
                          .update(appDeploymentFile)
                          .set({ status: "failed" })
                          .where(eq(appDeploymentFile.id, file.id));
                        await db
                          .update(appDeployment)
                          .set({ status: "uploading" })
                          .where(eq(appDeployment.id, deployment.id));
                      }).pipe(Effect.orDie)
                ),
                Effect.mapError(verificationFailure)
              );
            })
          ),
        { discard: true }
      );
      yield* verifyStaticAssets(storage, staticAssets, [
        deployment.logoDarkPath,
        deployment.logoLightPath,
      ]);

      const [published] = yield* attempt(() =>
        db
          .update(appDeployment)
          .set({ status: "published" })
          .where(eq(appDeployment.id, deployment.id))
          .returning()
      ).pipe(Effect.uninterruptible);

      if (!published) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", {
            message: "Failed to publish deployment.",
          })
        );
      }

      return published;
    }).pipe(
      Effect.mapError(verificationFailure),
      Effect.onExit((exit) =>
        Exit.isSuccess(exit)
          ? Effect.void
          : attempt(async () => {
              await db
                .update(appDeployment)
                .set({ status: "uploading" })
                .where(eq(appDeployment.id, deployment.id));
            }).pipe(Effect.orDie)
      )
    );

    return { files, publishedDeployment };
  });
