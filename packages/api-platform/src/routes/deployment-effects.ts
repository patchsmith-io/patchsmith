import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import type { Context } from "#context";
import { PlatformHttp } from "#services";

const isDeploymentError = (
  cause: unknown
): cause is ORPCError<string, unknown> => cause instanceof ORPCError;

/** A 400 requires correcting/re-uploading invalid bytes; a 503 can retry publication. */
/* oxlint-disable unicorn/custom-error-definition -- ORPCError has a branded readonly name that subclasses must preserve. */
export class UploadValidationError extends ORPCError<"BAD_REQUEST", undefined> {
  constructor(message: string, cause?: unknown) {
    super("BAD_REQUEST", { cause, message });
  }
}
/* oxlint-enable unicorn/custom-error-definition */

export const verificationUnavailableMessage =
  "Deployment verification is temporarily unavailable. Retry publishing this deployment.";

export const verificationFailure = (cause: unknown) =>
  cause instanceof UploadValidationError
    ? cause
    : new ORPCError("SERVICE_UNAVAILABLE", {
        cause,
        message: verificationUnavailableMessage,
      });

export const missingUploadObject = (cause: unknown): boolean => {
  const parsed = z
    .object({
      $metadata: z.object({ httpStatusCode: z.number().optional() }).optional(),
      name: z.string().optional(),
    })
    .safeParse(cause);

  return (
    parsed.success &&
    (parsed.data.name === "NoSuchKey" ||
      parsed.data.name === "NotFound" ||
      parsed.data.$metadata?.httpStatusCode === 404)
  );
};

export const uploadedAssetMetadata = (
  storage: Context["storage"],
  objectKey: string
) =>
  Effect.tryPromise({
    catch: (cause) =>
      missingUploadObject(cause)
        ? new UploadValidationError(
            "Uploaded file is missing. Upload the file before publishing again.",
            cause
          )
        : verificationFailure(cause),
    try: async () => await storage.head({ key: objectKey }),
  });

/** Adapt database/storage promises at the deployment boundary, preserving domain errors. */
export const deploymentOperation = <A>(
  operation: (signal: AbortSignal) => PromiseLike<A>
) =>
  Effect.tryPromise({
    catch: (cause) =>
      isDeploymentError(cause)
        ? cause
        : new ORPCError("INTERNAL_SERVER_ERROR", {
            cause,
            message: "Deployment operation failed.",
          }),
    try: async (signal) => await operation(signal),
  });

/** Keep the deadline and cancellation active until the entire body is inspected. */
export const inspectUploadedAsset = <A>(
  storage: Context["storage"],
  objectKey: string,
  kind: "Bundle" | "Logo",
  inspect: (body: ReadableStream<Uint8Array>) => Promise<A>
) =>
  Effect.gen(function* inspectAsset() {
    const { fetch } = yield* PlatformHttp;

    return yield* Effect.tryPromise({
      catch: verificationFailure,
      try: async (signal) => {
        const download = await storage.createDownloadUrl({
          expiresInSeconds: 60,
          key: objectKey,
        });

        signal.throwIfAborted();

        const url = new URL(download.url);

        if (url.protocol !== "https:") {
          throw new Error(`${kind} download URL must use HTTPS.`);
        }

        const response = await fetch(url, { redirect: "error", signal });

        if (signal.aborted) {
          await response.body?.cancel();
          signal.throwIfAborted();
        }

        if (response.status === 404) {
          await response.body?.cancel();
          throw new UploadValidationError(
            `Uploaded ${kind.toLowerCase()} is missing. Upload it before publishing again.`
          );
        }

        if (!response.ok || !response.body) {
          await response.body?.cancel();
          throw new Error(`Failed to inspect uploaded ${kind.toLowerCase()}.`);
        }

        // Own the reader so cancellation releases the body even when an inspector
        // or a fetch implementation ignores its AbortSignal.
        const reader = response.body.getReader();

        const cancel = async () => {
          await reader.cancel().catch(() => {
            // The stream may already have failed; preserve the inspection error.
          });
        };

        const abort = () => {
          void cancel();
        };

        signal.addEventListener("abort", abort, { once: true });

        const body = new ReadableStream<Uint8Array>(
          {
            cancel,
            async pull(controller) {
              const result = await reader.read();

              if (result.done) {
                controller.close();
              } else {
                controller.enqueue(result.value);
              }
            },
          },
          { highWaterMark: 0 }
        );

        try {
          const result = await inspect(body);
          signal.throwIfAborted();

          return result;
        } finally {
          signal.removeEventListener("abort", abort);
          await cancel();
          reader.releaseLock();
        }
      },
    }).pipe(
      Effect.timeoutOrElse({
        duration: 10_000,
        orElse: () =>
          Effect.fail(
            new ORPCError("SERVICE_UNAVAILABLE", {
              cause: new Error(`${kind} inspection timed out.`),
              message: verificationUnavailableMessage,
            })
          ),
      })
    );
  });
