import {
  AssetDeliveryError,
  assetHeaders,
  acceptsGzip,
  assetResponse,
  assetSize,
  hostedAssetRequest,
  limitAssetBody,
  serveAssetRequest,
} from "@patchsmith/asset-delivery";
import type { AssetIdentity } from "@patchsmith/asset-delivery";
import { Effect } from "effect";
import { catch as catchEffect } from "effect/Effect";

const cachedEncodingHeader = "X-Patchsmith-Content-Encoding";

const downstreamResponse = (
  response: Response,
  request: Request,
  identity: AssetIdentity
) => {
  const headers = new Headers(response.headers);

  if (headers.get(cachedEncodingHeader) === "gzip") {
    headers.set("Content-Encoding", "gzip");
  }

  headers.delete(cachedEncodingHeader);
  // Keep browser reuse bounded and allow the CDN to negotiate delivery encoding.
  // no-transform belongs only on the opaque internal cache entry below.
  headers.set(
    "Cache-Control",
    identity.immutable
      ? "public, max-age=31536000, immutable"
      : "private, max-age=3600"
  );
  let { body } = response;

  // At the edge this is Cloudflare's normalized Accept-Encoding, not the original
  // browser header in request.cf.clientAcceptEncoding. The CDN negotiates with
  // the browser; direct/local requests still need the identity fallback here.
  if (headers.get("Content-Encoding") === "gzip" && !acceptsGzip(request)) {
    headers.delete("Content-Encoding");
    headers.delete("Content-Length");

    if (headers.has("ETag")) {
      headers.set("ETag", `W/${headers.get("ETag")}`);
    }

    if (request.method !== "HEAD" && body) {
      body = limitAssetBody(body.pipeThrough(new DecompressionStream("gzip")));
    }
  }

  return new Response(request.method === "HEAD" ? null : body, {
    // The body is already encoded. This prevents workerd compression, while the
    // CDN can still transcode it according to the zone's Compression Rules.
    encodeBody: "manual",
    headers,
    status: response.status,
  });
};

const loadAsset = (
  request: Request,
  identity: AssetIdentity,
  env: Env,
  ctx: ExecutionContext
) =>
  Effect.gen(function* loadAssetValue() {
    const effectContext = yield* Effect.context();

    // Node/DOM ambient types omit Cloudflare's default edge cache.
    // SAFETY: Cloudflare Workers provides caches.default; the standard DOM CacheStorage declaration omits this Workers-only cache.
    const edgeCache =
      /* oxlint-disable typescript/no-unsafe-type-assertion -- Cloudflare Workers provides caches.default; the standard DOM CacheStorage declaration omits this Workers-only cache. */
      caches as CacheStorage & { readonly default: Cache };

    /* oxlint-enable typescript/no-unsafe-type-assertion */
    // Cache opaque bytes: Cache API responses decode HTTP Content-Encoding when
    // consumed. Keep the stored encoding in private metadata instead, so manual
    // downstream responses always receive the original R2 bytes.
    // A new key also bypasses entries written with the old HTTP encoding contract.
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.set("__patchsmith_asset_cache", "opaque-v1");
    const cacheKey = new Request(cacheUrl);

    const cached = yield* Effect.tryPromise(
      async () => await edgeCache.default.match(cacheKey)
    ).pipe(
      // oxlint-disable-next-line unicorn/no-useless-undefined -- Effect.succeed requires a value argument.
      Effect.orElseSucceed(() => undefined)
    );

    if (cached) {
      return downstreamResponse(cached, request, identity);
    }

    if (request.method === "HEAD") {
      const object = yield* Effect.tryPromise({
        catch: () => new AssetDeliveryError(503),
        try: async () => await env.BUNDLES.head(identity.key),
      });

      const contentLength = yield* assetSize(object?.size, identity.maxBytes);

      return downstreamResponse(
        new Response(null, {
          headers: assetHeaders({
            contentEncoding: object?.httpMetadata?.contentEncoding,
            contentLength,
            contentType: identity.contentType,
            etag: object?.httpEtag,
          }),
        }),
        request,
        identity
      );
    }

    const object = yield* Effect.tryPromise({
      catch: () => new AssetDeliveryError(503),
      try: async () => await env.BUNDLES.get(identity.key),
    });

    const contentLength = yield* assetSize(object?.size, identity.maxBytes);

    if (!object) {
      return yield* Effect.fail(new AssetDeliveryError(404));
    }

    const response = new Response(object.body, {
      encodeBody: "manual",
      headers: assetHeaders({
        contentEncoding: object.httpMetadata?.contentEncoding,
        contentLength,
        contentType: identity.contentType,
        etag: object.httpEtag,
      }),
    });

    const cacheHeaders = new Headers(response.headers);

    if (cacheHeaders.get("Content-Encoding") === "gzip") {
      cacheHeaders.set(cachedEncodingHeader, "gzip");
      cacheHeaders.delete("Content-Encoding");
    }

    cacheHeaders.set("Cache-Control", "public, max-age=86400, no-transform");

    const cacheWrite = Effect.tryPromise(async () => {
      await edgeCache.default.put(
        cacheKey,
        new Response(response.clone().body, {
          encodeBody: "manual",
          headers: cacheHeaders,
        })
      );
    }).pipe(
      catchEffect(() =>
        Effect.sync(() => {
          console.error(
            JSON.stringify({ message: "Asset cache write failed" })
          );
        })
      )
    );

    yield* Effect.sync(() => {
      ctx.waitUntil(Effect.runPromiseWith(effectContext)(cacheWrite));
    });

    return downstreamResponse(response, request, identity);
  });

export default {
  fetch: async (request, env, ctx) => {
    const program = serveAssetRequest(request, {
      identity: hostedAssetRequest(request, env.ASSET_DOMAIN),
      load: (identity) => loadAsset(request, identity, env, ctx),
    });

    return await Effect.runPromise(
      assetResponse(program, () => {
        console.error(
          JSON.stringify({
            hostname: new URL(request.url).hostname,
            message: "Asset delivery failed",
          })
        );
      })
    );
  },
} satisfies ExportedHandler<Env>;
