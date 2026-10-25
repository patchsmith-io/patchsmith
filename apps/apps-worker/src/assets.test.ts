import { gzipSync, gunzipSync } from "node:zlib";

import { assetHeaders, maxDeploymentBytes } from "@patchsmith/asset-delivery";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import worker from "./assets";

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error("Expected a defined value.");
  }

  return value;
};

const projectId = "proj00000001";
const appId = "app000000001";
const deploymentId = "deploy000001";
const path = `/a/${appId}/d/${deploymentId}/client/client.js`;
const url = `https://${projectId}.tailorkit.app${path}`;
const key = `projects/${projectId}/apps/${appId}/deployments/${deploymentId}/client/client.js`;
const bundle = "export default 'tenant bundle';";
const get = vi.fn();
const head = vi.fn();

// SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
const cacheMiss: Response | undefined = undefined;

const match = vi
  .fn<(request: Request) => Promise<Response | undefined>>()
  .mockResolvedValue(cacheMiss);

const put = vi
  .fn<(_request: Request, _response: Response) => Promise<void>>()
  .mockReturnValue(Promise.resolve());

const waitUntil = vi.fn();
// SAFETY: This test supplies a deliberately invalid value or a minimal platform double to exercise the runtime boundary.

const env =
  /* oxlint-disable typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- This test supplies a deliberately invalid value or a minimal platform double to exercise the runtime boundary. */
  {
    ASSET_DOMAIN: "tailorkit.app",
    BUNDLES: { get, head },
  } as unknown as Env;

/* oxlint-enable typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions */
// SAFETY: This test supplies a deliberately invalid value or a minimal platform double to exercise the runtime boundary.
// oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- This test supplies a deliberately invalid value or a minimal platform double to exercise the runtime boundary. This controlled fixture supplies only the platform members exercised by the test, or deliberately invalid input for runtime validation.
const ctx = { waitUntil } as unknown as ExecutionContext;

// SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
const fetchAsset = async (request: Request) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This controlled fixture supplies only the platform members exercised by the test, or deliberately invalid input for runtime validation.
  await worker.fetch(request as Parameters<typeof worker.fetch>[0], env, ctx);

const object = (body = bundle) => ({
  body: new Response(body).body,
  httpEtag: '"etag"',
  size: new TextEncoder().encode(body).byteLength,
  writeHttpMetadata: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("caches", { default: { match, put } });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("project asset gateway", () => {
  it("streams hashed assets within the deployment limit and keeps immutable browser caching on cache hits and HEAD", async () => {
    const hash = "a".repeat(64);
    const assetUrl = `https://${projectId}.tailorkit.app/a/${appId}/assets/${hash}/game/doom.wasm`;
    const assetKey = `projects/${projectId}/apps/${appId}/assets/${hash}/game/doom.wasm`;
    const bytes = new Uint8Array(maxDeploymentBytes);
    get.mockResolvedValueOnce({
      body: new Response(bytes).body,
      httpEtag: '"wasm"',
      size: bytes.byteLength,
    });
    const response = await fetchAsset(new Request(assetUrl));
    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledWith(assetKey);
    expect(response.headers.get("Content-Type")).toBe("application/wasm");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable"
    );
    const body = await response.arrayBuffer();
    expect(body.byteLength).toBe(bytes.byteLength);
    match.mockResolvedValueOnce(
      new Response(bytes, {
        headers: assetHeaders({
          contentLength: bytes.byteLength,
          contentType: "application/wasm",
        }),
      })
    );
    const cached = await fetchAsset(new Request(assetUrl));
    expect(cached.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable"
    );
    head.mockResolvedValueOnce({ httpEtag: '"wasm"', size: bytes.byteLength });

    const metadata = await fetchAsset(
      new Request(assetUrl, { method: "HEAD" })
    );

    expect(metadata.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(metadata.headers.get("Content-Length")).toBe(
      String(bytes.byteLength)
    );
    expect(await metadata.text()).toBe("");
  });

  it("never serves server bundles, manifests or migrations publicly", async () => {
    await Promise.all(
      [
        "server.js",
        "server/server.js",
        "client/server.js",
        "artifact.json",
        "migration.sql",
        "../server/server.js",
      ].map(async (suffix) => {
        await Promise.all(
          ["GET", "HEAD", "OPTIONS"].map(async (method) => {
            const response = await fetchAsset(
              new Request(url.replace("client.js", suffix), { method })
            );

            expect(response.status).toBe(404);
          })
        );
      })
    );
    expect(get).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
    expect(match).not.toHaveBeenCalled();
  });

  it("caches an immutable bundle at the edge while preventing downstream caching", async () => {
    get.mockResolvedValueOnce(object());
    const response = await fetchAsset(new Request(url));
    expect(get).toHaveBeenCalledWith(key);
    expect(match.mock.calls[0]?.[0].url).toBe(
      `${url}?__patchsmith_asset_cache=opaque-v1`
    );
    expect(put).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(await response.text()).toBe(bundle);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    const cachedResponse = put.mock.calls[0]?.[1];
    expect(cachedResponse?.headers.get("Cache-Control")).toBe(
      "public, max-age=86400, no-transform"
    );
    expect(response.headers.get("Content-Type")).toBe(
      "application/javascript; charset=utf-8"
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns not found without falling back to retired storage paths", async () => {
    get.mockResolvedValueOnce(null);
    const response = await fetchAsset(new Request(url));
    expect(response.status).toBe(404);
    expect(get).toHaveBeenCalledExactlyOnceWith(key);
  });

  it("serves an edge cache hit without reading R2", async () => {
    match.mockResolvedValueOnce(
      new Response(bundle, {
        headers: assetHeaders({
          contentLength: bundle.length,
          etag: '"cached"',
        }),
      })
    );
    const response = await fetchAsset(new Request(url));
    expect(await response.text()).toBe(bundle);
    expect(response.headers.get("ETag")).toBe('"cached"');
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("serves logos with their image content type", async () => {
    get.mockResolvedValueOnce(object("<svg/>"));

    const response = await fetchAsset(
      new Request(
        url.replace(
          `/d/${deploymentId}/client/client.js`,
          `/assets/${"a".repeat(64)}/logo.svg`
        )
      )
    );

    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(get).toHaveBeenCalledWith(
      `projects/${projectId}/apps/${appId}/assets/${"a".repeat(64)}/logo.svg`
    );
  });

  it("uses the hostname project short ID as the storage namespace", async () => {
    get.mockResolvedValueOnce(object());
    const otherUrl = url.replace(projectId, "xyz123def456");
    await fetchAsset(new Request(otherUrl));
    expect(get).toHaveBeenCalledWith(key.replace(projectId, "xyz123def456"));
  });

  it.each(["abcdef012345", "012345678901", "zzzzzzzzzzzz"])(
    "serves bundles for DNS-safe project short ID %s",
    async (shortId) => {
      get.mockResolvedValueOnce(object());

      const response = await fetchAsset(
        new Request(url.replace(projectId, shortId))
      );

      expect(response.status).toBe(200);
      expect(get).toHaveBeenCalledWith(key.replace(projectId, shortId));
      expect(await response.text()).toBe(bundle);
    }
  );

  it("rejects foreign hosts, slugs, malformed paths and query strings before R2", async () => {
    await Promise.all(
      [
        url.replace(projectId, "abc123def4"),
        url.replace(projectId, "team-abcde"),
        url.replace(projectId, "team-abc123def456"),
        url.replace(projectId, "editable-slug"),
        url.replace(projectId, "-bc123def4"),
        url.replace(projectId, "abc123def-"),
        url.replace(projectId, "abc_23def4"),
        url.replace(projectId, "-bc123def45678"),
        url.replace(projectId, "abc123def4567-"),
        url.replace(projectId, "abc_23def45678"),
        url.replace(projectId, "01234567890"),
        url.replace(projectId, "0123456789012"),
        url.replace(projectId, "012345678901234"),
        url.replace("tailorkit.app", "tailorkit.app.evil.example"),
        url.replace(projectId, "nested.abc123def456"),
        `${url}?token=anything`,
        url.replace("client.js", "secret.js"),
        url.replace(appId, "app-slug"),
      ].map(async (invalid) => {
        await expect(fetchAsset(new Request(invalid))).resolves.toHaveProperty(
          "status",
          404
        );
      })
    );
    expect(get).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
  });

  it("supports HEAD and preflight without reading bundle bodies", async () => {
    await expect(
      fetchAsset(new Request(url, { method: "POST" }))
    ).resolves.toHaveProperty("status", 405);
    await expect(
      fetchAsset(new Request(url.replace("https:", "http:")))
    ).resolves.toHaveProperty("status", 400);
    const preflight = await fetchAsset(new Request(url, { method: "OPTIONS" }));
    expect(preflight.status).toBe(204);
    expect(get).not.toHaveBeenCalled();
    head.mockResolvedValueOnce(object());
    const response = await fetchAsset(new Request(url, { method: "HEAD" }));
    expect(response.status).toBe(200);
    expect(head).toHaveBeenCalledWith(key);
    expect(await response.text()).toBe("");
  });

  it("hides missing or oversized objects and fails safely on R2 errors", async () => {
    get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...object(), size: maxDeploymentBytes + 1 });
    await expect(fetchAsset(new Request(url))).resolves.toHaveProperty(
      "status",
      404
    );
    await expect(fetchAsset(new Request(url))).resolves.toHaveProperty(
      "status",
      404
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    get.mockRejectedValueOnce(new Error("private storage detail"));
    await expect(fetchAsset(new Request(url))).resolves.toHaveProperty(
      "status",
      503
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private storage detail"
    );
  });
});

it("serves R2 assets when the edge cache lookup fails", async () => {
  match.mockRejectedValueOnce(new Error("Cache unavailable"));
  get.mockResolvedValueOnce(object());
  const response = await fetchAsset(new Request(url));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(bundle);
});

it("keeps the response usable when a background cache write fails", async () => {
  put.mockRejectedValueOnce(new Error("Private cache details"));
  get.mockResolvedValueOnce(object());
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await fetchAsset(new Request(url));
  await requireValue(waitUntil.mock.calls[0])[0];
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(bundle);
  expect(log).toHaveBeenCalledWith(
    JSON.stringify({ message: "Asset cache write failed" })
  );
});

const gzipObject = (body = bundle) => {
  const bytes = gzipSync(body);

  return {
    ...object(),
    body: new Response(bytes).body,
    httpMetadata: { contentEncoding: "gzip" },
    size: bytes.byteLength,
  };
};

const cachedGzipHeaders = (size: number, etag?: string) => {
  const headers = assetHeaders({ contentLength: size, etag });
  headers.set("X-Patchsmith-Content-Encoding", "gzip");
  headers.set("Vary", "Accept-Encoding");

  return headers;
};

it.each(["R2", "cache"])(
  "allows CDN negotiation while retaining stored gzip from %s",
  async (source) => {
    const stored = gzipObject();

    if (source === "R2") {
      get.mockResolvedValueOnce(stored);
    } else {
      const headers = cachedGzipHeaders(stored.size);
      headers.set("Cache-Control", "public, max-age=86400, no-transform");
      match.mockResolvedValueOnce(new Response(stored.body, { headers }));
    }

    const request = new Request(url, {
      headers: { "Accept-Encoding": "br, gzip" },
    });

    // Cloudflare normalizes the Worker-facing header even for identity clients.
    Object.defineProperty(request, "cf", {
      value: { clientAcceptEncoding: "identity" },
    });
    const response = await fetchAsset(request);
    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(response.headers.get("Vary")).toBe("Accept-Encoding");
    expect(response.headers.get("X-Patchsmith-Content-Encoding")).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(gzipSync(bundle));
  }
);

it("serves stored gzip bytes and caches them without double compression", async () => {
  const stored = gzipObject();
  get.mockResolvedValueOnce(stored);

  const response = await fetchAsset(
    new Request(url, { headers: { "Accept-Encoding": "br, gzip" } })
  );

  expect(response.headers.get("Content-Encoding")).toBe("gzip");
  expect(response.headers.get("Content-Length")).toBe(String(stored.size));
  expect(response.headers.get("Vary")).toBe("Accept-Encoding");
  expect(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()).toBe(
    bundle
  );
  const [, cached] = requireValue(put.mock.calls[0]);
  expect(cached.headers.get("Content-Encoding")).toBeNull();
  expect(cached.headers.get("X-Patchsmith-Content-Encoding")).toBe("gzip");
  expect(gunzipSync(Buffer.from(await cached.arrayBuffer())).toString()).toBe(
    bundle
  );
});

it.each(["GET", "HEAD"])(
  "serves opaque cached gzip bytes for %s without reading R2 again",
  async (method) => {
    const stored = gzipObject();
    get.mockResolvedValueOnce(stored);

    const initial = await fetchAsset(
      new Request(url, { headers: { "Accept-Encoding": "gzip" } })
    );

    await initial.arrayBuffer();
    await requireValue(waitUntil.mock.calls[0])[0];
    const [, cached] = requireValue(put.mock.calls[0]);
    match.mockResolvedValueOnce(cached);

    const response = await fetchAsset(
      new Request(url, { headers: { "Accept-Encoding": "gzip" }, method })
    );

    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(response.headers.get("Content-Length")).toBe(String(stored.size));
    expect(response.headers.get("X-Patchsmith-Content-Encoding")).toBeNull();
    const bytes = Buffer.from(await response.arrayBuffer());

    if (method === "HEAD") {
      expect(bytes.byteLength).toBe(0);
    } else {
      expect(bytes).toEqual(gzipSync(bundle));
      expect(gunzipSync(bytes).toString()).toBe(bundle);
    }

    expect(get).toHaveBeenCalledOnce();
    expect(head).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledOnce();
  }
);

it.each(["R2", "cache"])(
  "caps inflated bytes from %s at 10 MiB",
  async (source) => {
    const stored = gzipObject("a".repeat(maxDeploymentBytes + 1));
    expect(stored.size).toBeLessThan(maxDeploymentBytes);

    if (source === "R2") {
      get.mockResolvedValueOnce(stored);
    } else {
      match.mockResolvedValueOnce(
        new Response(stored.body, {
          headers: cachedGzipHeaders(stored.size),
        })
      );
    }

    const response = await fetchAsset(new Request(url));
    const body = requireValue(response.body);
    let deliveredBytes = 0;
    await expect(
      (async () => {
        for await (const value of body) {
          if (!(value instanceof Uint8Array)) {
            throw new Error("Expected asset bytes");
          }

          deliveredBytes += value.byteLength;
        }
      })()
    ).rejects.toThrow("Asset delivery failed (404)");
    expect(deliveredBytes).toBeLessThanOrEqual(maxDeploymentBytes);
  }
);

it("serves a gzip bundle whose decoded size is exactly 10 MiB", async () => {
  get.mockResolvedValueOnce(gzipObject("a".repeat(maxDeploymentBytes)));
  const response = await fetchAsset(new Request(url));
  const awaitedResult1 = await response.arrayBuffer();
  expect(awaitedResult1.byteLength).toBe(maxDeploymentBytes);
});

it.each([undefined, "identity", "gzip;q=0, *;q=1"])(
  "decodes a cached gzip bundle for Accept-Encoding %s",
  async (encoding) => {
    const stored = gzipObject();
    match.mockResolvedValueOnce(
      new Response(stored.body, {
        headers: cachedGzipHeaders(stored.size, stored.httpEtag),
      })
    );

    const response = await fetchAsset(
      new Request(url, {
        headers:
          encoding !== undefined && encoding !== null && encoding !== ""
            ? { "Accept-Encoding": encoding }
            : undefined,
      })
    );

    expect(await response.text()).toBe(bundle);
    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(response.headers.get("X-Patchsmith-Content-Encoding")).toBeNull();
    expect(response.headers.get("Content-Length")).toBeNull();
    expect(response.headers.get("ETag")).toBe('W/"etag"');
    expect(response.headers.get("Vary")).toBe("Accept-Encoding");
    expect(get).not.toHaveBeenCalled();
  }
);

it.each(["gzip", "identity"])(
  "serves gzip HEAD metadata for %s without reading the body",
  async (encoding) => {
    const stored = gzipObject();
    head.mockResolvedValueOnce(stored);

    const response = await fetchAsset(
      new Request(url, {
        headers: { "Accept-Encoding": encoding },
        method: "HEAD",
      })
    );

    expect(response.headers.get("Content-Encoding")).toBe(
      encoding === "gzip" ? "gzip" : null
    );
    expect(response.headers.get("Content-Length")).toBe(
      encoding === "gzip" ? String(stored.size) : null
    );
    expect(await response.text()).toBe("");
    expect(get).not.toHaveBeenCalled();
  }
);
