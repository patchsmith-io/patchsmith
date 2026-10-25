import { ORPCError } from "@orpc/server";
import {
  logoContentTypes,
  maxLogoBytes,
  validateLogoAsset,
} from "@patchsmith/asset-delivery/logo-validation";
import {
  isStaticAssetPath,
  maxDeploymentBytes,
  maxStaticAssets,
  staticAssetContentType,
} from "@patchsmith/asset-delivery/static-assets";
import { db } from "@patchsmith/db";
import type { AppAsset } from "@patchsmith/db/schema/apps";
import { appAsset, appDeploymentAsset } from "@patchsmith/db/schema/apps";
import { inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

import type { Context } from "#context";

import {
  deploymentOperation,
  inspectUploadedAsset,
  missingUploadObject,
  uploadedAssetMetadata,
  UploadValidationError,
} from "./deployment-effects";

export const staticAssetsInput = z
  .array(
    z.object({
      checksum: z.string().regex(/^[a-f0-9]{64}$/u),
      contentLength: z.number().int().min(1).max(maxDeploymentBytes),
      path: z.string().refine(isStaticAssetPath, "Invalid asset path"),
    })
  )
  .max(maxStaticAssets)
  .refine(
    (assets) => new Set(assets.map(({ path }) => path)).size === assets.length,
    "Asset paths must be unique"
  )
  .refine(
    (assets) =>
      assets.reduce((size, asset) => size + asset.contentLength, 0) <=
      maxDeploymentBytes,
    "Static assets exceed the deployment size limit"
  );

type StaticAssetInput = z.output<typeof staticAssetsInput>[number];

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const checksumBase64 = (checksum: string) =>
  Buffer.from(checksum, "hex").toString("base64");

const matchesAssetMetadata = (
  object: Awaited<ReturnType<Context["storage"]["head"]>>,
  asset: { checksum: string; contentLength: number; contentType: string }
) =>
  object.checksumSha256 === checksumBase64(asset.checksum) &&
  object.contentLength === asset.contentLength &&
  object.contentType === asset.contentType &&
  (object.contentEncoding === undefined || object.contentEncoding === "");

export const prepareStaticAssets = (
  context: Context & { app: { id: string; shortId: string } },
  requested: StaticAssetInput[]
) =>
  Effect.forEach(
    requested,
    (asset) =>
      Effect.gen(function* prepareAsset() {
        const contentType = staticAssetContentType(asset.path);
        const objectKey = `projects/${context.project.shortId}/apps/${context.app.shortId}/assets/${asset.checksum}/${asset.path}`;

        const object = yield* deploymentOperation(async () => {
          try {
            return await context.storage.head({ key: objectKey });
          } catch (error) {
            if (!missingUploadObject(error)) {
              throw error;
            }

            return null;
          }
        });

        if (
          object &&
          !matchesAssetMetadata(object, { ...asset, contentType })
        ) {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", {
              message:
                "Stored asset metadata does not match its content address.",
            })
          );
        }

        const upload = object
          ? undefined
          : yield* deploymentOperation(
              async () =>
                await context.storage.createUploadUrl({
                  checksumSha256: checksumBase64(asset.checksum),
                  contentType,
                  expiresInSeconds: 15 * 60,
                  key: objectKey,
                  metadata: { appId: context.app.id, checksum: asset.checksum },
                })
            );

        return { ...asset, contentType, objectKey, upload };
      }),
    { concurrency: 4 }
  );

type PreparedStaticAssets = Effect.Success<
  ReturnType<typeof prepareStaticAssets>
>;

/** A transaction writes all files and references in two statements. */
export const linkStaticAssets = (
  tx: Transaction,
  appId: string,
  deploymentId: string,
  prepared: PreparedStaticAssets
) =>
  Effect.gen(function* linkAssets() {
    if (prepared.length === 0) {
      return [];
    }

    const files = yield* deploymentOperation(() =>
      tx
        .insert(appAsset)
        .values(
          prepared
            .toSorted(
              (left, right) =>
                left.checksum.localeCompare(right.checksum) ||
                left.path.localeCompare(right.path)
            )
            .map(({ upload: _upload, ...asset }) => ({ ...asset, appId }))
        )
        .onConflictDoUpdate({
          set: { updatedAt: new Date() },
          target: [appAsset.appId, appAsset.checksum, appAsset.path],
        })
        .returning()
    );

    const byPath = new Map(files.map((file) => [file.path, file]));

    const uploads = yield* Effect.forEach(
      prepared,
      (asset) => {
        const file = byPath.get(asset.path);

        if (
          !file ||
          file.checksum !== asset.checksum ||
          file.contentLength !== asset.contentLength ||
          file.contentType !== asset.contentType
        ) {
          return Effect.fail(
            new ORPCError("BAD_REQUEST", {
              message: "Asset metadata conflicts with the stored file.",
            })
          );
        }

        return Effect.succeed({
          file,
          headers: asset.upload?.headers,
          uploadUrl: asset.upload?.uploadUrl,
        });
      },
      { concurrency: 1 }
    );

    yield* deploymentOperation(() =>
      tx.insert(appDeploymentAsset).values(
        files.map((file) => ({
          appAssetId: file.id,
          appDeploymentId: deploymentId,
          appId,
        }))
      )
    );

    return uploads;
  });

export const deploymentStaticAssets = (deploymentId: string) =>
  Effect.gen(function* readAssets() {
    const references = yield* deploymentOperation(() =>
      db.query.appDeploymentAsset.findMany({
        where: { appDeploymentId: deploymentId },
        with: { asset: true },
      })
    );

    const assets = yield* Effect.forEach(
      references,
      ({ asset }) =>
        asset
          ? Effect.succeed(asset)
          : Effect.fail(
              new ORPCError("INTERNAL_SERVER_ERROR", {
                message: "Missing deployment asset reference.",
              })
            ),
      { concurrency: 1 }
    );

    return assets.toSorted((a, b) => a.path.localeCompare(b.path));
  });

/** Signed uploads bind SHA-256 to the bytes; publication also verifies R2 metadata. */
export const verifyStaticAssets = (
  storage: Context["storage"],
  assets: AppAsset[],
  logoPaths: (string | null)[]
) =>
  Effect.gen(function* verifyAssets() {
    const verifiedIds = yield* Effect.forEach(
      assets,
      (asset) =>
        Effect.gen(function* verifyAsset() {
          const object = yield* uploadedAssetMetadata(storage, asset.objectKey);

          if (!matchesAssetMetadata(object, asset)) {
            return yield* Effect.fail(
              new UploadValidationError(
                `Failed to verify asset ${asset.path}. Uploaded asset does not match its deployment record.`
              )
            );
          }

          if (logoPaths.includes(`assets/${asset.checksum}/${asset.path}`)) {
            const contentType = logoContentTypes.find(
              (value) => value === asset.contentType
            );

            if (!contentType || asset.contentLength > maxLogoBytes) {
              return yield* Effect.fail(
                new UploadValidationError("Unsupported logo format or size.")
              );
            }

            yield* inspectUploadedAsset(
              storage,
              asset.objectKey,
              "Logo",
              async (body) => {
                const chunks: Uint8Array[] = [];
                let length = 0;

                for await (const chunk of body) {
                  length += chunk.byteLength;

                  if (length > maxLogoBytes) {
                    throw new UploadValidationError(
                      `Logo cannot exceed ${maxLogoBytes} bytes.`
                    );
                  }

                  chunks.push(chunk);
                }

                const content = Buffer.concat(chunks, length);

                try {
                  validateLogoAsset(content, contentType);
                } catch (error) {
                  // This synchronous validator only inspects uploaded bytes.
                  throw new UploadValidationError(
                    error instanceof Error
                      ? error.message
                      : "Invalid logo content.",
                    error
                  );
                }
              }
            );
          }

          return asset.id;
        }),
      { concurrency: 4 }
    );

    if (verifiedIds.length > 0) {
      // Do not leave a database write running after cancellation has returned.
      yield* deploymentOperation(() =>
        db
          .update(appAsset)
          .set({ status: "verified" })
          .where(inArray(appAsset.id, verifiedIds))
      ).pipe(Effect.uninterruptible);
    }
  });
