import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

import type { PatchsmithUploadManifest } from "@patchsmith/vite/builder";
import type { LoadedPatchsmithConfig } from "@patchsmith/vite/config/loader";
import { loadPatchsmithConfig } from "@patchsmith/vite/config/loader";
import {
  assertDeploymentSize,
  maxDeploymentBytes,
} from "@patchsmith/vite/upload-manifest";
import * as v from "valibot";
import { z } from "zod";

import { getAgentAuth } from "./agent-auth";
import { writeAppIdToConfig } from "./app-link";
import { getDeployToken, NotLoggedInError, runWhoami } from "./auth";
import { buildProject } from "./build";
import { createCliClient } from "./client";

const isObjectValue = <TValue>(value: TValue): value is TValue & object =>
  typeof value === "object" && value !== null;

const isStringValue = <TValue>(value: TValue): value is TValue & string =>
  typeof value === "string";

const isNumberValue = <TValue>(value: TValue): value is TValue & number =>
  typeof value === "number";

export interface TypecheckFailure {
  command: string;
  exitCode: number | null;
  output: string;
}

interface DeployOptions {
  appId?: string;
  configPath?: string;
  cwd: string;
  mode?: string;
  onLoginRequired?: () => Promise<{ hostUrl: string }>;
  onMissingAppId?: (details: {
    appName: string;
    configPath: string;
    hostUrl: string;
    reason: "missing" | "not-found";
  }) => Promise<boolean>;
  onTypecheckFailed?: (failure: TypecheckFailure) => Promise<boolean>;
  outDir?: string;
}

interface DeploymentAssetUpload {
  headers?: Record<string, string>;
  uploadUrl: string;
}

interface StaticAssetUpload {
  headers?: Record<string, string>;
  uploadUrl?: string;
}

interface DeploymentCreateResult {
  staticAssets?: (StaticAssetUpload & {
    file: { path: string; checksum: string };
  })[];
  assets: DeploymentAssetUpload[];
  server?: DeploymentAssetUpload;
  deployment: {
    id: string;
  };
}

const assetUploadSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  uploadUrl: z.string(),
});

const staticUploadSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  uploadUrl: z.string().optional(),
});

const deploymentCreateSchema = z.object({
  assets: z.array(assetUploadSchema),
  deployment: z.object({ id: z.string() }),
  server: assetUploadSchema.optional(),
  staticAssets: z
    .array(
      staticUploadSchema.extend({
        file: z.object({ checksum: z.string(), path: z.string() }),
      })
    )
    .optional(),
});

const deploymentPublishSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
});

const appCreateSchema = z.object({ id: z.string() });

const appDetailsSchema = z.object({
  description: z.string().nullable(),
  name: z.string(),
});

export interface DeployResult {
  appId: string;
  createdApp: boolean;
  deploymentId: string;
  hostUrl: string;
  status?: string;
  uploadedFiles: UploadedFileSummary[];
}

interface UploadedFileSummary {
  gzipSize: number;
  path: string;
  size: number;
}

const gzipAsync = promisify(gzip);

const unwrapRpcResult = <TSchema extends z.ZodType>(
  schema: TSchema,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This parser, serializer, or runtime adapter handles arbitrary values before validating or encoding their domain representation.
  result: unknown
): z.output<TSchema> => {
  if (
    isObjectValue(result) &&
    "error" in result &&
    result.error !== undefined
  ) {
    // oxlint-disable-next-line typescript/only-throw-error -- Preserve the transport failure object, including its code and metadata, for the existing downstream error mapping.
    throw result.error;
  }

  const data = isObjectValue(result) && "data" in result ? result.data : result;
  const body = isObjectValue(data) && "body" in data ? data.body : data;

  return schema.parse(body);
};

const getErrorMessage = (cause: unknown): string | undefined => {
  if (cause instanceof Error) {
    return cause.message;
  }

  if (isStringValue(cause)) {
    return cause;
  }

  if (isObjectValue(cause) && "message" in cause) {
    const { message } = cause;

    return isStringValue(message) ? message : undefined;
  }

  return undefined;
};

const isNotFoundError = (cause: unknown): boolean =>
  getErrorMessage(cause)?.toLowerCase().includes("not found") ?? false;

const readUploadManifest = async (
  outDir: string,
  schema: v.GenericSchema<unknown, PatchsmithUploadManifest>
): Promise<PatchsmithUploadManifest> => {
  const manifestPath = path.join(outDir, "patchsmith-upload.json");

  return v.parse(schema, JSON.parse(await readFile(manifestPath, "utf-8")));
};

const sha256Hex = (content: Buffer): string =>
  createHash("sha256").update(content).digest("hex");

const uploadAsset = async (
  asset: DeploymentAssetUpload | StaticAssetUpload,
  content: Buffer,
  contentEncoding?: "gzip"
): Promise<void> => {
  if (
    !(
      asset.uploadUrl !== undefined &&
      asset.uploadUrl !== null &&
      asset.uploadUrl !== ""
    )
  ) {
    return;
  }

  if (content.byteLength > maxDeploymentBytes) {
    throw new Error(`Deployment asset exceeds ${maxDeploymentBytes} bytes.`);
  }

  const headers = new Headers(asset.headers);

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/javascript");
  }

  if (contentEncoding) {
    headers.set("content-encoding", contentEncoding);
  }

  const response = await fetch(asset.uploadUrl, {
    body: new Uint8Array(content),
    headers,
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error(
      `Asset upload failed with ${response.status} ${response.statusText}.`
    );
  }
};

const resolveTsconfig = (root: string): string | undefined => {
  for (const filename of ["tsconfig.json", "jsconfig.json"]) {
    const filepath = path.join(root, filename);

    if (existsSync(filepath)) {
      return filepath;
    }
  }

  return undefined;
};

const typecheckAppEntries = async (
  loaded: LoadedPatchsmithConfig
): Promise<TypecheckFailure | undefined> => {
  const baseTsconfig = resolveTsconfig(loaded.root);

  if (
    !(
      baseTsconfig !== undefined &&
      baseTsconfig !== null &&
      baseTsconfig !== ""
    )
  ) {
    return undefined;
  }

  const requireFromApp = createRequire(path.join(loaded.root, "package.json"));
  let compiler: string;

  try {
    compiler = path.join(
      path.dirname(requireFromApp.resolve("typescript/package.json")),
      "bin/tsc"
    );
  } catch {
    return undefined;
  }

  const { getClientSourceFiles, discoverFunctionFiles, discoverHooks } =
    await import("@patchsmith/vite/builder");

  const clientFiles = await getClientSourceFiles(loaded.root);
  const hookFiles = await discoverHooks(loaded.root);

  const functionFiles = await discoverFunctionFiles(loaded.root);

  const entryFiles = [
    ...clientFiles,
    ...functionFiles.map(({ filename }) => filename),
    ...hookFiles.map((hook) => hook.filename),
  ];

  // Check UI entries and every discovered function module with the project compiler options.
  const temporary = await mkdtemp(
    path.join(loaded.root, ".patchsmith-typecheck-")
  );

  try {
    const config = path.join(temporary, "tsconfig.json");
    await writeFile(
      config,
      JSON.stringify({
        compilerOptions: { composite: false, incremental: false, noEmit: true },
        extends: baseTsconfig,
        files: entryFiles,
        include: [],
      })
    );
    // oxlint-disable-next-line typescript/strict-void-return -- Node explicitly supports promisify(execFile); its ChildProcess return is intentionally ignored by the callback-to-Promise adapter.
    await promisify(execFile)(
      process.execPath,
      [compiler, "--noEmit", "--project", config, "--pretty", "false"],
      { cwd: loaded.root, maxBuffer: 4 * 1024 * 1024 }
    );
  } catch (error) {
    const parsed = z
      .object({
        code: z.union([z.string(), z.number()]).optional(),
        message: z.string().optional(),
        stderr: z.string().optional(),
        stdout: z.string().optional(),
      })
      .safeParse(error);

    const failure = parsed.success ? parsed.data : {};

    return {
      command: `tsc --noEmit --project ${JSON.stringify(path.relative(loaded.root, baseTsconfig))} --pretty false (app entries: ${entryFiles.map((file) => JSON.stringify(path.relative(loaded.root, file))).join(", ")})`,
      exitCode: isNumberValue(failure.code) ? failure.code : null,
      output:
        (`${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim() ||
          failure.message) ??
        String(error),
    };
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }

  return undefined;
};

// Keep the request/build lifecycle and its failure paths together.
// eslint-disable-next-line complexity
export const runDeploy = async (
  options: DeployOptions
): Promise<DeployResult> => {
  const loaded = await loadPatchsmithConfig(options.configPath, options.cwd);
  const agent = getAgentAuth();
  let appId = options.appId ?? loaded.config.appId ?? agent?.appId;
  let createdApp = false;

  const auth = await runWhoami(options).catch(
    async (error: ErrorOptions["cause"]) => {
      if (error instanceof NotLoggedInError && options.onLoginRequired) {
        return await options.onLoginRequired();
      }

      throw error;
    }
  );

  const storedAuth = await getDeployToken(auth.hostUrl);

  if (
    !(
      storedAuth?.deployToken !== undefined &&
      storedAuth?.deployToken !== null &&
      storedAuth?.deployToken !== ""
    )
  ) {
    throw new Error(
      `Not logged in for ${auth.hostUrl}. Run patchsmith login after checking host in patchsmith.config.ts.`
    );
  }

  const {
    patchsmithUploadManifestSchema,
    discoverFunctionFiles,
    generateFunctionTypes,
  } = await import("@patchsmith/vite/builder");

  // Refresh imports before the build and compiler run concurrently, including on a fresh checkout.
  await generateFunctionTypes(
    loaded.root,
    await discoverFunctionFiles(loaded.root)
  );

  const [buildResult, typecheckResult] = await Promise.allSettled([
    buildProject({ ...options, cwd: loaded.root }),
    typecheckAppEntries(loaded),
  ]);

  if (buildResult.status === "rejected") {
    throw buildResult.reason;
  }

  if (typecheckResult.status === "rejected") {
    throw typecheckResult.reason;
  }

  if (typecheckResult.value !== undefined) {
    const shouldContinue = await options.onTypecheckFailed?.(
      typecheckResult.value
    );

    if (!(shouldContinue === true)) {
      throw new Error(
        [
          "Deployment cancelled because type check failed.",
          `Command: ${typecheckResult.value.command}`,
          typecheckResult.value.output,
        ].join("\n")
      );
    }
  }

  const { outDir } = buildResult.value;

  const manifest = await readUploadManifest(
    outDir,
    patchsmithUploadManifestSchema
  );

  const clientAssetPath = path.join(outDir, manifest.assets.client);

  const staticAssets: (NonNullable<
    PatchsmithUploadManifest["assets"]["static"]
  >[number] & { content: Buffer })[] = [];

  for (const asset of manifest.assets.static ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- Read and validate each asset before opening the next file.
    const content = await readFile(path.join(outDir, "assets", asset.path));

    if (
      content.byteLength !== asset.contentLength ||
      sha256Hex(content) !== asset.checksum
    ) {
      throw new Error(`Built asset changed after hashing: ${asset.path}`);
    }

    staticAssets.push({ ...asset, content });
  }

  const clientAsset = await readFile(clientAssetPath);
  const clientAssetGzip = await gzipAsync(clientAsset);

  const serverAsset = manifest.assets.server
    ? await readFile(path.join(outDir, manifest.assets.server))
    : undefined;

  const serverAssetGzip = serverAsset
    ? await gzipAsync(serverAsset)
    : undefined;

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
    clientAssetGzip.byteLength,
    serverAssetGzip?.byteLength ?? 0,
    staticBytes,
  ]);

  const client = createCliClient({
    token: storedAuth.deployToken,
    url: auth.hostUrl,
  });

  const createLinkedApp = async (
    reason: "missing" | "not-found"
  ): Promise<string> => {
    if (
      options.appId !== undefined &&
      options.appId !== null &&
      options.appId !== ""
    ) {
      throw new Error("The requested deployment app was not found.");
    }

    const appName = loaded.config.name;

    const shouldCreateApp = await options.onMissingAppId?.({
      appName,
      configPath: loaded.filepath,
      hostUrl: auth.hostUrl,
      reason,
    });

    if (!(shouldCreateApp === true)) {
      throw new Error("Deployment cancelled.");
    }

    const app = unwrapRpcResult(
      appCreateSchema,
      await client.apps.create({
        description: loaded.config.description ?? null,
        name: appName,
        slug: loaded.config.slug,
      })
    );

    appId = app.id;
    createdApp = true;
    await writeAppIdToConfig(loaded.filepath, appId);

    return appId;
  };

  appId ??= await createLinkedApp("missing");

  const createDeployment = async (
    targetAppId: string
  ): Promise<DeploymentCreateResult> =>
    unwrapRpcResult(
      deploymentCreateSchema,
      await client.deployments.create({
        appId: targetAppId,
        assets: [
          {
            checksum: sha256Hex(clientAssetGzip),
            contentLength: clientAssetGzip.byteLength,
            contentType: "application/javascript" as const,
            encoding: "gzip" as const,
            objectKey: "client.js" as const,
          },
        ],
        hooks: manifest.hooks,
        logos: manifest.assets.logos,
        server: serverAssetGzip
          ? {
              checksum: sha256Hex(serverAssetGzip),
              contentLength: serverAssetGzip.byteLength,
              contentType: "application/javascript" as const,
              encoding: "gzip" as const,
              objectKey: "server.js" as const,
            }
          : undefined,
        staticAssets: staticAssets.length
          ? staticAssets.map(({ content: _content, ...asset }) => asset)
          : undefined,
        views: manifest.views,
      })
    );

  let created: DeploymentCreateResult;

  try {
    created = await createDeployment(appId);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    appId = await createLinkedApp("not-found");
    created = await createDeployment(appId);
  }

  if (created.assets.length !== 1 || !created.assets[0]) {
    throw new Error(
      "Deployment did not return an upload URL for the client asset."
    );
  }

  if (serverAsset && !created.server) {
    throw new Error(
      "Deployment did not return an upload URL for the server asset."
    );
  }

  const staticUploads = new Map(
    (created.staticAssets ?? []).map((upload) => [upload.file.path, upload])
  );

  for (const asset of staticAssets) {
    if (staticUploads.get(asset.path)?.file.checksum !== asset.checksum) {
      throw new Error(
        `Deployment did not accept static asset ${asset.path}. Upgrade the Patchsmith host and platform before deploying assets.`
      );
    }
  }

  const pendingStaticAssets = staticAssets.values();

  await Promise.all([
    ...Array.from({ length: Math.min(4, staticAssets.length) }, async () => {
      for (const asset of pendingStaticAssets) {
        const upload = staticUploads.get(asset.path);

        if (!upload) {
          throw new Error(`Missing static asset upload: ${asset.path}`);
        }

        // oxlint-disable-next-line no-await-in-loop -- Each worker uploads one asset at a time to bound concurrent PUT requests.
        await uploadAsset(upload, asset.content);
      }
    }),
    ...(serverAssetGzip && created.server
      ? [uploadAsset(created.server, serverAssetGzip, "gzip")]
      : []),
    uploadAsset(created.assets[0], clientAssetGzip, "gzip"),
  ]);

  const { description, name } = loaded.config;

  if (!createdApp) {
    const app = unwrapRpcResult(
      appDetailsSchema,
      await client.apps.get({ appId })
    );

    const appDescription =
      description === undefined ? app.description : description;

    if (app.name !== name || app.description !== appDescription) {
      unwrapRpcResult(
        appCreateSchema,
        await client.apps.update({
          appId,
          description: appDescription,
          name,
        })
      );
    }
  }

  const published = unwrapRpcResult(
    deploymentPublishSchema,
    await client.deployments.publish({
      deploymentId: created.deployment.id,
      rollout: true,
    })
  );

  const uploadedServer = [];

  if (serverAsset && serverAssetGzip && manifest.assets.server) {
    uploadedServer.push({
      gzipSize: serverAssetGzip.byteLength,
      path: manifest.assets.server,
      size: serverAsset.byteLength,
    });
  }

  return {
    appId,
    createdApp,
    deploymentId: published.id,
    hostUrl: auth.hostUrl,
    status: published.status,
    uploadedFiles: [
      {
        gzipSize: clientAssetGzip.byteLength,
        path: manifest.assets.client,
        size: clientAsset.byteLength,
      },
      ...uploadedServer,
      ...staticAssets.map((asset) => ({
        gzipSize: asset.contentLength,
        path: `assets/${asset.path}`,
        size: asset.contentLength,
      })),
    ],
  };
};
