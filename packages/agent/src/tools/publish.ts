import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

import {
  assertDeploymentSize,
  maxDeploymentBytes,
  patchsmithUploadManifestSchema,
} from "@patchsmith/vite/upload-manifest";
import type { Sandbox } from "@vercel/sandbox";
import * as v from "valibot";
import { z } from "zod";

export const deploymentDirectory = "/tmp/patchsmith-deployment";
const gzipAsync = promisify(gzip);

const claimsSchema = z.object({
  platformUrl: z.url().refine((value) => {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

    return (
      (url.protocol === "https:" || (url.protocol === "http:" && loopback)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }),
  scope: z.object({
    name: z.string().min(1),
    value: z.record(z.string(), z.json()),
  }),
});

const uploadSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  uploadUrl: z.url().optional(),
});

const createdSchema = z.object({
  assets: z.array(uploadSchema.extend({ uploadUrl: z.url() })).length(1),
  deployment: z.object({ id: z.string().min(1) }),
  server: uploadSchema.extend({ uploadUrl: z.url() }).optional(),
  staticAssets: z
    .array(
      uploadSchema.extend({
        file: z.object({ checksum: z.string(), path: z.string() }),
      })
    )
    .optional(),
});

const publishedSchema = z.object({ id: z.string().min(1) });

type ReadArtifact = Pick<
  ReturnType<Sandbox["currentSession"]>,
  "readFileToBuffer"
>;

const readAsset = async (sandbox: ReadArtifact, filename: string) => {
  const content = await sandbox.readFileToBuffer({
    path: `${deploymentDirectory}/${filename}`,
  });

  if (content === null || content.byteLength > maxDeploymentBytes) {
    throw new Error(`Missing or oversized deployment asset: ${filename}`);
  }

  return content;
};

const describeAsset = (content: Buffer) => {
  if (content.byteLength > maxDeploymentBytes) {
    throw new Error("Deployment asset exceeds the size limit.");
  }

  return {
    checksum: createHash("sha256").update(content).digest("hex"),
    contentLength: content.byteLength,
  };
};

const readDeploymentAssets = async (
  sandbox: ReadArtifact,
  manifest: v.InferOutput<typeof patchsmithUploadManifestSchema>
) => {
  const clientAsset = await readAsset(sandbox, manifest.assets.client);

  const serverAsset = manifest.assets.server
    ? await readAsset(sandbox, manifest.assets.server)
    : undefined;

  const staticAssets = await Promise.all(
    (manifest.assets.static ?? []).map(async (asset) => {
      const content = await readAsset(sandbox, `assets/${asset.path}`);

      if (
        content.byteLength !== asset.contentLength ||
        createHash("sha256").update(content).digest("hex") !== asset.checksum
      ) {
        throw new Error(`Built asset changed after hashing: ${asset.path}`);
      }

      return { ...asset, content };
    })
  );

  const clientCode = await gzipAsync(clientAsset);
  const serverCode = serverAsset ? await gzipAsync(serverAsset) : undefined;

  const staticBytes = staticAssets.reduce(
    (total, asset) => total + asset.content.byteLength,
    0
  );

  assertDeploymentSize([
    clientAsset.byteLength,
    serverAsset?.byteLength ?? 0,
    staticBytes,
  ]);
  assertDeploymentSize([
    clientCode.byteLength,
    serverCode?.byteLength ?? 0,
    staticBytes,
  ]);

  return { clientCode, serverCode, staticAssets };
};

/** Only the host publishes; sandbox output is parsed as data and never executed here. */
export const publishDeployment = async (
  sandbox: ReadArtifact,
  authorization: { agentToken: string; appId: string },
  signal?: AbortSignal,
  fetchImplementation: typeof fetch = fetch
) => {
  const { agentToken, appId } = authorization;
  // Decode routing only; the platform still verifies the grant, scope, expiry, and revocation.
  const [, payload] = agentToken.split(".");

  if (payload === undefined || payload === "") {
    throw new Error("Invalid deployment authorization.");
  }

  const { platformUrl, scope } = claimsSchema.parse(
    JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"))
  );

  const manifestContent = await readAsset(sandbox, "patchsmith-upload.json");

  const manifest = v.parse(
    patchsmithUploadManifestSchema,
    JSON.parse(manifestContent.toString("utf-8"))
  );

  const { clientCode, serverCode, staticAssets } = await readDeploymentAssets(
    sandbox,
    manifest
  );

  const request = async (pathname: string, body: string) => {
    const response = await fetchImplementation(
      `${platformUrl.replace(/\/$/u, "")}${pathname}`,
      {
        body,
        headers: {
          authorization: `Bearer ${agentToken}`,
          "content-type": "application/json",
        },
        method: "POST",
        redirect: "error",
        signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Deployment request failed with ${response.status}.`);
    }

    return await response.json();
  };

  const created = createdSchema.parse(
    await request(
      "/deployments",
      JSON.stringify({
        app: { id: appId },
        assets: [
          {
            ...describeAsset(clientCode),
            contentType: "application/javascript",
            encoding: "gzip",
            objectKey: "client.js",
          },
        ],
        hooks: manifest.hooks,
        logos: manifest.assets.logos,
        scope,
        server: serverCode
          ? {
              ...describeAsset(serverCode),
              contentType: "application/javascript",
              encoding: "gzip",
              objectKey: "server.js",
            }
          : undefined,
        staticAssets: staticAssets.length
          ? staticAssets.map(({ content: _content, ...asset }) => asset)
          : undefined,
        views: manifest.views,
      })
    )
  );

  const upload = async (
    destination: z.infer<typeof uploadSchema> | undefined,
    content: Buffer,
    encoding?: "gzip"
  ) => {
    if (destination === undefined || content.byteLength > maxDeploymentBytes) {
      throw new Error(
        "Missing upload destination or oversized deployment asset."
      );
    }

    // Existing content-addressed assets have no upload URL.
    if (destination.uploadUrl === undefined) {
      return;
    }

    const headers = new Headers(destination.headers);

    if (!headers.has("content-type")) {
      headers.set("content-type", "application/javascript");
    }

    if (encoding !== undefined) {
      headers.set("content-encoding", encoding);
    }

    const response = await fetchImplementation(destination.uploadUrl, {
      body: new Uint8Array(content),
      headers,
      method: "PUT",
      redirect: "error",
      signal,
    });

    if (!response.ok) {
      throw new Error(`Asset upload failed with ${response.status}.`);
    }
  };

  const staticUploads = new Map(
    (created.staticAssets ?? []).map((destination) => [
      destination.file.path,
      destination,
    ])
  );

  for (const asset of staticAssets) {
    if (staticUploads.get(asset.path)?.file.checksum !== asset.checksum) {
      throw new Error(`Deployment did not accept static asset ${asset.path}.`);
    }
  }

  const pendingStaticAssets = staticAssets.values();

  await Promise.all(
    Array.from({ length: Math.min(4, staticAssets.length) }, async () => {
      for (const asset of pendingStaticAssets) {
        // oxlint-disable-next-line no-await-in-loop -- Each worker uploads one asset at a time to bound concurrent PUT requests.
        await upload(staticUploads.get(asset.path), asset.content);
      }
    })
  );

  await upload(created.assets[0], clientCode, "gzip");

  if (serverCode !== undefined) {
    await upload(created.server, serverCode, "gzip");
  }

  const published = publishedSchema.parse(
    await request(
      `/deployments/${encodeURIComponent(created.deployment.id)}`,
      JSON.stringify({ rollout: true, scope })
    )
  );

  return `Deployment: ${published.id}`;
};
