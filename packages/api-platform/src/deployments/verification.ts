import { ORPCError } from "@orpc/server";
import { maxDeploymentBytes } from "@patchsmith/asset-delivery";
import type { AppDeployment } from "@patchsmith/db/schema/apps";
import { appDeployment, appDeploymentFile } from "@patchsmith/db/schema/apps";
import { eq } from "drizzle-orm";
import { Effect, Exit } from "effect";

import type { Context } from "#context";
import {
  deploymentStaticAssets,
  verifyStaticAssets,
} from "#routes/static-assets";
import { attempt, PlatformDatabase, PlatformHttp } from "#services";

const bundleInspectionTimeoutMs = 10_000;

export const hexToBase64 = (hex: string): string => {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return Buffer.from(bytes).toString("base64");
};

const inspectCompressedBundle = async (
  storage: Context["storage"],
  objectKey: string,
  remainingBytes: number,
  fetch: typeof globalThis.fetch,
  signal: AbortSignal
) => {
  const download = await storage.createDownloadUrl({
    expiresInSeconds: 60,
    key: objectKey,
  });

  const downloadUrl = new URL(download.url);

  if (downloadUrl.protocol !== "https:") {
    throw new Error("Bundle download URL must use HTTPS.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, bundleInspectionTimeoutMs);

  try {
    const response = await fetch(downloadUrl, {
      redirect: "error",
      signal: AbortSignal.any([signal, controller.signal]),
    });

    if (!response.ok || !response.body) {
      throw new Error("Failed to inspect uploaded bundle.");
    }

    // Node fetch decodes R2's Content-Encoding before exposing the response body.
    // Count chunks instead of buffering an arbitrarily large inflated bundle.
    let contentLength = 0;

    for await (const value of response.body) {
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
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
};

export const verifyDeploymentFilesEffect = (
  deployment: Pick<AppDeployment, "id" | "logoDarkPath" | "logoLightPath">,
  storage: Context["storage"]
) =>
  Effect.gen(function* verifyDeploymentFiles() {
    const db = yield* PlatformDatabase;
    const { fetch } = yield* PlatformHttp;

    const files = yield* attempt(
      async () =>
        await db.query.appDeploymentFile.findMany({
          where: {
            appDeploymentId: deployment.id,
          },
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

    const storedBytes = files.reduce(
      (total, file) => total + file.contentLength,
      staticBytes
    );

    if (storedBytes > maxDeploymentBytes) {
      return yield* Effect.fail(
        new ORPCError("BAD_REQUEST", {
          message: `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes.`,
        })
      );
    }

    let deploymentBytes = staticBytes;

    yield* attempt(
      async () =>
        await db
          .update(appDeployment)
          .set({ status: "verifying" })
          .where(eq(appDeployment.id, deployment.id))
    );

    yield* Effect.forEach(
      files,
      (file) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* verifyFile() {
            yield* attempt(async () => {
              await db
                .update(appDeploymentFile)
                .set({ status: "verifying" })
                .where(eq(appDeploymentFile.id, file.id));
            });
            yield* restore(
              attempt(async (signal) => {
                const object = await storage.head({
                  key: file.objectKey,
                });

                signal.throwIfAborted();
                const { contentLength } = object;

                if (contentLength !== file.contentLength) {
                  throw new Error(
                    "Uploaded file content length does not match deployment record."
                  );
                }

                if (object.contentType !== file.contentType) {
                  throw new Error(
                    "Uploaded file content type does not match deployment record."
                  );
                }

                if (
                  (object.contentEncoding ?? undefined) !==
                  (file.encoding === "gzip" ? "gzip" : undefined)
                ) {
                  throw new Error(
                    "Uploaded file content encoding does not match deployment record."
                  );
                }

                if (
                  !(
                    file.checksum !== undefined &&
                    file.checksum !== null &&
                    file.checksum !== ""
                  ) ||
                  object.checksumSha256 !== hexToBase64(file.checksum)
                ) {
                  throw new Error(
                    "Uploaded file checksum does not match deployment record."
                  );
                }

                const decodedBytes =
                  file.encoding === "gzip"
                    ? await inspectCompressedBundle(
                        storage,
                        file.objectKey,
                        maxDeploymentBytes - deploymentBytes,
                        fetch,
                        signal
                      )
                    : contentLength;

                deploymentBytes += decodedBytes;

                if (deploymentBytes > maxDeploymentBytes) {
                  throw new Error(
                    `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes after decompression.`
                  );
                }
              }).pipe(
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
              Effect.mapError(
                (error) =>
                  new ORPCError("BAD_REQUEST", { message: error.message })
              )
            );
          })
        ),
      { concurrency: 1, discard: true }
    );

    yield* verifyStaticAssets(storage, staticAssets, [
      deployment.logoDarkPath,
      deployment.logoLightPath,
    ]).pipe(
      Effect.onError(() =>
        attempt(async () => {
          await db
            .update(appDeployment)
            .set({ status: "uploading" })
            .where(eq(appDeployment.id, deployment.id));
        }).pipe(Effect.orDie)
      )
    );

    return files;
  });
