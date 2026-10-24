import { ORPCError } from "@orpc/server";
import { Effect } from "effect";

import type { Context } from "#context";

/** Adapt database/storage promises at the deployment boundary, preserving domain errors. */
export const deploymentOperation = <A>(
  operation: (signal: AbortSignal) => PromiseLike<A>
) =>
  Effect.tryPromise({
    catch: (cause) =>
      cause instanceof ORPCError
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
  Effect.tryPromise({
    catch: (cause) =>
      new ORPCError("BAD_REQUEST", {
        cause,
        message:
          cause instanceof Error ? cause.message : "Asset inspection failed.",
      }),
    try: async (signal) => {
      const download = await storage.createDownloadUrl({
        expiresInSeconds: 60,
        key: objectKey,
      });

      const url = new URL(download.url);

      if (url.protocol !== "https:") {
        throw new Error(`${kind} download URL must use HTTPS.`);
      }

      const response = await fetch(url, { redirect: "error", signal });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to inspect uploaded ${kind.toLowerCase()}.`);
      }

      return await inspect(response.body);
    },
  }).pipe(
    Effect.timeoutOrElse({
      duration: 10_000,
      orElse: () =>
        Effect.fail(
          new ORPCError("BAD_REQUEST", {
            message: `${kind} inspection timed out.`,
          })
        ),
    })
  );
