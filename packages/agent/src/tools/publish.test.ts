import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import { asyncFixture } from "@patchsmith/config/testing";
import { maxDeploymentBytes } from "@patchsmith/vite/upload-manifest";
import { expect, it, vi } from "vite-plus/test";

import { deploymentDirectory, publishDeployment } from "./publish";

const scope = { name: "user", value: { userId: "authorized-user" } };
const token = `header.${Buffer.from(JSON.stringify({ platformUrl: "https://platform.test/api/platform", scope })).toString("base64url")}.signature`;
const authorization = { agentToken: token, appId: "authorized-app" };
const clientCode = Buffer.from("export const client = true;");
const serverCode = Buffer.from("export const server = true;");
const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');

const logoArtifact = {
  checksum: createHash("sha256").update(logo).digest("hex"),
  contentLength: logo.byteLength,
  path: "logo.svg",
};

const manifest = {
  assets: {
    client: "client/client.js",
    logos: { dark: "logo.svg" },
    server: "server/server.js",
    static: [logoArtifact],
  },
  hooks: ["billing.updated"],
  version: 1,
  views: [{ path: "/", slot: "panel" }],
};

const reader = (overrides: Record<string, Buffer> = {}) => {
  const files = new Map<string, Buffer>(
    Object.entries({
      "assets/logo.svg": logo,
      "client/client.js": clientCode,
      "patchsmith-upload.json": Buffer.from(JSON.stringify(manifest)),
      "server/server.js": serverCode,
      ...overrides,
    })
  );

  return {
    readFileToBuffer: async ({ path }: { path: string }) =>
      await Promise.resolve(
        files.get(path.slice(deploymentDirectory.length + 1)) ?? null
      ),
  };
};

it.each([
  { budget: "compressed", extraBytes: 0, reuse: false },
  { budget: "compressed", extraBytes: 1, reuse: false },
  { budget: "compressed", extraBytes: 0, reuse: true },
  { budget: "compressed", extraBytes: 1, reuse: true },
  { budget: "raw", extraBytes: 0, reuse: true },
  { budget: "raw", extraBytes: 1, reuse: true },
])(
  "counts static files in the agent's combined $budget budget ($extraBytes bytes over, reused=$reuse)",
  async ({ budget, extraBytes, reuse }) => {
    const clientContent =
      budget === "raw" ? Buffer.alloc(6 * 1024 * 1024, "x") : clientCode;

    const serverContent =
      budget === "raw" ? Buffer.alloc(1024 * 1024, "y") : serverCode;

    const bundleBytes =
      budget === "raw"
        ? clientContent.byteLength + serverContent.byteLength
        : gzipSync(clientContent).byteLength +
          gzipSync(serverContent).byteLength;

    const content = Buffer.alloc(
      maxDeploymentBytes - bundleBytes + extraBytes,
      3
    );

    const checksum = createHash("sha256").update(content).digest("hex");

    const artifact = {
      checksum,
      contentLength: content.byteLength,
      path: "doom.wad",
    };

    let requests = 0;

    const send: typeof fetch = async (input, init) => {
      requests += 1;
      const request = new Request(input, init);

      if (request.url.endsWith("/deployments")) {
        expect(await request.json()).toMatchObject({
          staticAssets: [artifact],
        });

        return Response.json({
          assets: [{ uploadUrl: "https://storage.test/client" }],
          deployment: { id: "created" },
          server: { uploadUrl: "https://storage.test/server" },
          staticAssets: [
            {
              file: { checksum, path: "doom.wad" },
              uploadUrl: reuse ? undefined : "https://storage.test/doom.wad",
            },
          ],
        });
      }

      return request.method === "PUT"
        ? new Response(null, { status: 200 })
        : Response.json({ id: "published" });
    };

    const publish = publishDeployment(
      reader({
        "assets/doom.wad": content,
        "client/client.js": clientContent,
        "patchsmith-upload.json": Buffer.from(
          JSON.stringify({
            assets: {
              client: "client/client.js",
              server: "server/server.js",
              static: [artifact],
            },
            version: 1,
          })
        ),
        "server/server.js": serverContent,
      }),
      authorization,
      undefined,
      send
    );

    if (extraBytes > 0) {
      await expect(publish).rejects.toThrow(
        "Combined deployment assets cannot exceed"
      );
      expect(requests).toBe(0);
    } else {
      await expect(publish).resolves.toBe("Deployment: published");
    }
  }
);

it.each([false, true])(
  "publishes hashed static files from sandbox output and reuses existing uploads: %s",
  async (reuse) => {
    const content = Buffer.alloc(4 * 1024 * 1024, 2);
    const checksum = createHash("sha256").update(content).digest("hex");

    const artifact = {
      checksum,
      contentLength: content.byteLength,
      path: "doom.wad",
    };

    const uploads: string[] = [];

    const send: typeof fetch = async (input, init) => {
      const request = new Request(input, init);

      if (request.url.endsWith("/deployments")) {
        expect(await request.json()).toMatchObject({
          staticAssets: [artifact],
        });

        return Response.json({
          assets: [{ uploadUrl: "https://storage.test/client" }],
          deployment: { id: "created" },
          staticAssets: [
            {
              file: { checksum, path: "doom.wad" },
              headers: { "content-type": "application/octet-stream" },
              uploadUrl: reuse ? undefined : "https://storage.test/doom.wad",
            },
          ],
        });
      }

      if (request.method === "PUT") {
        uploads.push(request.url);
        expect(request.headers.has("authorization")).toBe(false);

        if (request.url.endsWith("doom.wad")) {
          const uploadedContent = Buffer.from(await request.arrayBuffer());
          expect(uploadedContent.equals(content)).toBe(true);
          expect(request.headers.has("content-encoding")).toBe(false);
        }

        return new Response(null, { status: 200 });
      }

      return Response.json({ id: "published" });
    };

    expect(
      await publishDeployment(
        reader({
          "assets/doom.wad": content,
          "patchsmith-upload.json": Buffer.from(
            JSON.stringify({
              assets: { client: "client/client.js", static: [artifact] },
              version: 1,
            })
          ),
        }),
        authorization,
        undefined,
        send
      )
    ).toBe("Deployment: published");
    expect(uploads).toHaveLength(reuse ? 1 : 2);
  }
);

it.each([false, true])(
  "limits concurrent agent static uploads (failure=%s)",
  async (fail) => {
    const content = Buffer.from("asset-data");
    const checksum = createHash("sha256").update(content).digest("hex");

    const assets = Array.from({ length: 9 }, (_, index) => ({
      checksum,
      contentLength: content.byteLength,
      path: `asset-${index}.bin`,
    }));

    const gate = Promise.withResolvers<boolean>();
    let active = 0;
    let peak = 0;
    let published = false;
    const uploaded: string[] = [];

    const send: typeof fetch = async (input, init) => {
      const request = new Request(input, init);

      if (request.url.endsWith("/deployments")) {
        return Response.json({
          assets: [{ uploadUrl: "https://storage.test/client" }],
          deployment: { id: "created" },
          staticAssets: assets.map((asset) => ({
            file: asset,
            uploadUrl: `https://storage.test/${asset.path}`,
          })),
        });
      }

      if (request.method === "PUT") {
        if (request.url.endsWith(".bin")) {
          active += 1;
          peak = Math.max(peak, active);
          await gate.promise;
          active -= 1;
          uploaded.push(request.url);

          return new Response(null, { status: fail ? 500 : 200 });
        }

        return new Response(null, { status: 200 });
      }

      expect(active).toBe(0);
      expect(uploaded).toHaveLength(assets.length);
      published = true;

      return Response.json({ id: "published" });
    };

    const publish = publishDeployment(
      reader({
        ...Object.fromEntries(
          assets.map((asset) => [`assets/${asset.path}`, content])
        ),
        "patchsmith-upload.json": Buffer.from(
          JSON.stringify({
            assets: { client: "client/client.js", static: assets },
            version: 1,
          })
        ),
      }),
      authorization,
      undefined,
      send
    );

    const outcome = fail
      ? expect(publish).rejects.toThrow("Asset upload failed with 500.")
      : expect(publish).resolves.toBe("Deployment: published");

    try {
      await vi.waitFor(() => {
        expect(active).toBeGreaterThanOrEqual(4);
      });
      expect(active).toBe(4);
      expect(published).toBe(false);
    } finally {
      gate.resolve(true);
      await outcome;
    }

    expect(peak).toBe(4);
    expect(published).toBe(!fail);

    if (!fail) {
      expect(uploaded.toSorted()).toEqual(
        assets.map((asset) => `https://storage.test/${asset.path}`).toSorted()
      );
    }
  }
);

it("uploads data on the host and keeps authorization out of signed asset requests", async () => {
  const requests: Request[] = [];
  const { signal } = new AbortController();

  const send: typeof fetch = async (input, init) => {
    expect(init?.signal).toBe(signal);
    const request = new Request(input, init);
    requests.push(request);

    if (request.url === "https://platform.test/api/platform/deployments") {
      return await Promise.resolve(
        Response.json({
          assets: [
            {
              headers: { "content-type": "application/javascript" },
              uploadUrl: "https://storage.test/client",
            },
          ],
          deployment: { id: "created-deployment" },
          server: { uploadUrl: "https://storage.test/server" },
          staticAssets: [
            {
              file: logoArtifact,
              headers: { "content-type": "image/svg+xml" },
              uploadUrl: "https://storage.test/logo",
            },
          ],
        })
      );
    }

    if (
      request.url ===
      "https://platform.test/api/platform/deployments/created-deployment"
    ) {
      return await Promise.resolve(
        Response.json({ id: "published-deployment" })
      );
    }

    return await Promise.resolve(new Response(null, { status: 200 }));
  };

  expect(
    await publishDeployment(
      reader({
        "patchsmith-upload.json": Buffer.from(
          JSON.stringify({
            ...manifest,
            appId: "foreign-app",
            platformUrl: "https://untrusted.test",
            scope: { name: "other" },
          })
        ),
      }),
      authorization,
      signal,
      send
    )
  ).toBe("Deployment: published-deployment");
  expect(requests.map((request) => request.url)).toEqual([
    "https://platform.test/api/platform/deployments",
    "https://storage.test/logo",
    "https://storage.test/client",
    "https://storage.test/server",
    "https://platform.test/api/platform/deployments/created-deployment",
  ]);
  const [create, logoUpload, clientUpload, serverUpload, publish] = requests;

  if (!create || !clientUpload || !serverUpload || !logoUpload || !publish) {
    throw new Error("Expected create, uploads, and publication.");
  }

  for (const request of [create, publish]) {
    expect(request.headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(request.redirect).toBe("error");
  }

  for (const request of [clientUpload, serverUpload, logoUpload]) {
    expect(request.headers.has("authorization")).toBe(false);
  }

  const clientBytes = Buffer.from(await clientUpload.arrayBuffer());
  expect(gunzipSync(clientBytes)).toEqual(clientCode);
  expect(gunzipSync(Buffer.from(await serverUpload.arrayBuffer()))).toEqual(
    serverCode
  );
  expect(Buffer.from(await logoUpload.arrayBuffer())).toEqual(logo);
  expect(await create.json()).toMatchObject({
    app: { id: authorization.appId },
    assets: [
      {
        checksum: createHash("sha256").update(clientBytes).digest("hex"),
        contentLength: clientBytes.byteLength,
        encoding: "gzip",
      },
    ],
    hooks: manifest.hooks,
    scope,
    views: manifest.views,
  });
  expect(await publish.json()).toEqual({ rollout: true, scope });
});

it.each([
  { ...manifest, assets: { client: "../../secret" } },
  {
    ...manifest,
    assets: { ...manifest.assets, logos: { dark: "../../secret" } },
  },
])(
  "rejects manifest paths outside the build output",
  async (untrustedManifest) => {
    let requests = 0;

    const send: typeof fetch = async () => {
      requests += 1;

      return await Promise.resolve(Response.json({}));
    };

    await expect(
      publishDeployment(
        reader({
          "patchsmith-upload.json": Buffer.from(
            JSON.stringify(untrustedManifest)
          ),
        }),
        authorization,
        undefined,
        send
      )
    ).rejects.toThrow();
    expect(requests).toBe(0);
  }
);

it("rejects oversized output before an authenticated deployment request", async () => {
  let requests = 0;

  const send: typeof fetch = async () => {
    requests += 1;

    return await Promise.resolve(Response.json({}));
  };

  await expect(
    publishDeployment(
      reader({ "client/client.js": Buffer.alloc(maxDeploymentBytes + 1) }),
      authorization,
      undefined,
      send
    )
  ).rejects.toThrow("oversized");
  expect(requests).toBe(0);
});

it("honors platform authorization failures without uploading or publishing", async () => {
  const requests: string[] = [];

  const send: typeof fetch = async (input) => {
    requests.push(new Request(input).url);

    return await Promise.resolve(new Response(null, { status: 401 }));
  };

  await expect(
    publishDeployment(reader(), authorization, undefined, send)
  ).rejects.toThrow("401");
  expect(requests).toEqual(["https://platform.test/api/platform/deployments"]);
});

it.each([0, 1])(
  "checks the combined agent output budget (%i bytes over the limit)",
  async (extraBytes) => {
    const requests: string[] = [];

    const send: typeof fetch = asyncFixture((input) => {
      const { url } = new Request(input);
      requests.push(url);

      if (url.endsWith("/deployments")) {
        return Response.json({
          assets: [{ uploadUrl: "https://storage.test/client" }],
          deployment: { id: "created" },
          server: { uploadUrl: "https://storage.test/server" },
          staticAssets: [{ file: logoArtifact }],
        });
      }

      if (url.endsWith("/deployments/created")) {
        return Response.json({ id: "published" });
      }

      return new Response(null, { status: 200 });
    });

    const publish = publishDeployment(
      reader({
        "client/client.js": Buffer.alloc(6 * 1024 * 1024, 120),
        "patchsmith-upload.json": Buffer.from(
          JSON.stringify({
            ...manifest,
            assets: {
              ...manifest.assets,
              logos: {
                dark: "logo.svg",
                light: "logo.svg",
              },
            },
          })
        ),
        "server/server.js": Buffer.alloc(
          4 * 1024 * 1024 - logo.byteLength + extraBytes,
          121
        ),
      }),
      authorization,
      undefined,
      send
    );

    if (extraBytes > 0) {
      await expect(publish).rejects.toThrow(
        "Combined deployment assets cannot exceed"
      );
      expect(requests).toHaveLength(0);

      return;
    }

    await expect(publish).resolves.toBe("Deployment: published");
  }
);
