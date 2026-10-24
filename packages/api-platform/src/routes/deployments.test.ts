import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { call } from "@orpc/server";
import { maxDeploymentBytes } from "@patchsmith/asset-delivery";
import { asyncFixture } from "@patchsmith/config/testing";
import {
  app as appTable,
  appAsset,
  appDeployment,
  appDeploymentAsset,
  appDeploymentFile,
} from "@patchsmith/db/schema/apps";
import { organization } from "@patchsmith/db/schema/auth";
import { project as projectTable } from "@patchsmith/db/schema/project";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import type { Context } from "#context";
import { createTestDb } from "#test/pglite";

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error("Expected a defined value.");
  }

  return value;
};

vi.mock("@patchsmith/kv", () => ({ getKV: () => null }));

// SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
const testState = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@patchsmith/db", () => ({
  createDb: () => testState.db,
  get db() {
    return testState.db;
  },
}));

const { deploymentRouter, mapReturnedFilesByAssetPath } =
  await import("./deployments");

const { canonicalizeScope } = await import("#scope");

const { prepareStaticAssets, staticAssetsInput } =
  await import("./static-assets");

it.each([256, 257])(
  "enforces the platform static asset cap for %i files",
  (count) => {
    expect(
      staticAssetsInput.safeParse(
        Array.from({ length: count }, (_, index) => ({
          checksum: "a".repeat(64),
          contentLength: 1,
          path: `asset-${index}.bin`,
        }))
      ).success
    ).toBe(count === 256);
  }
);

const describeFile = (bytes: Buffer) => ({
  checksum: createHash("sha256").update(bytes).digest("hex"),
  contentLength: bytes.byteLength,
});

const organizationId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const logoChecksum = "b".repeat(64);
const logoChecksumBase64 = Buffer.from(logoChecksum, "hex").toString("base64");

const productionScope = {
  name: "environment",
  value: { environment: "production" },
};

const publishContextImplementation = (downloadUrl: string): Context => ({
  organization: {
    createdAt: new Date(),
    id: organizationId,
    logo: null,
    metadata: null,
    name: "Analytical Engines",
    shortId: "team00000001",
    slug: "analytical-engines",
  },
  project: {
    createdAt: new Date(),
    id: projectId,
    name: "Compiler",
    organizationId,
    shortId: "proj00000001",
    slug: "compiler",
    updatedAt: new Date(),
  },
  storage: {
    createDownloadUrl: vi.fn().mockResolvedValue({ url: downloadUrl }),
    createUploadUrl: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(
      asyncFixture(({ key }: { key: string }) => ({
        checksumSha256: logoChecksumBase64,
        contentLength: 11,
        contentType: key.endsWith(".svg")
          ? "image/svg+xml"
          : "application/javascript",
        key,
      }))
    ),
    type: "s3",
  },
});

describe("platform deployment uploads", () => {
  let client: Awaited<ReturnType<typeof createTestDb>>["client"];
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];

  beforeEach(async () => {
    const testDb = await createTestDb();
    ({ client } = testDb);
    ({ db } = testDb);
    testState.db = db;

    await db.insert(organization).values({
      createdAt: new Date(),
      id: organizationId,
      name: "Analytical Engines",
      shortId: "team00000001",
      slug: "analytical-engines",
    });
    await db.insert(projectTable).values({
      createdAt: new Date(),
      id: projectId,
      name: "Compiler",
      organizationId,
      slug: "compiler",
      updatedAt: new Date(),
    });
    await db.insert(appTable).values({
      name: "Inbox",
      projectId,
      shortId: "app000000001",
      ...canonicalizeScope(productionScope),
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    await client.close();
    vi.restoreAllMocks();
  });

  const createLogoDeployment = async () => {
    const currentApp = await db.query.app.findFirst();

    if (!currentApp) {
      throw new Error("Test app was not created.");
    }

    const [deployment] = await db
      .insert(appDeployment)
      .values({
        appId: currentApp.id,
        logoDarkPath: `assets/${logoChecksum}/logo.svg`,
        shortId: "dep000000001",
        status: "uploading",
      })
      .returning();

    if (!deployment) {
      throw new Error("Test deployment was not created.");
    }

    await db.insert(appDeploymentFile).values({
      appDeploymentId: deployment.id,
      checksum: logoChecksum,
      contentLength: 11,
      contentType: "application/javascript",
      encoding: null,
      objectKey:
        "projects/proj00000001/apps/app000000001/deployments/dep000000001/client/client.js",
    });

    const [asset] = await db
      .insert(appAsset)
      .values({
        appId: currentApp.id,
        checksum: logoChecksum,
        contentLength: 11,
        contentType: "image/svg+xml",
        objectKey: `projects/proj00000001/apps/app000000001/assets/${logoChecksum}/logo.svg`,
        path: "logo.svg",
      })
      .returning();

    await db.insert(appDeploymentAsset).values({
      appAssetId: requireValue(asset).id,
      appDeploymentId: deployment.id,
      appId: currentApp.id,
    });

    return deployment;
  };

  const publishContext = publishContextImplementation;

  it.each([false, true])(
    "bounds storage preparation and stops on failures (%s)",
    async (fail) => {
      const context = publishContext("https://storage.test/logo");
      const currentApp = requireValue(await db.query.app.findFirst());
      const gate = Promise.withResolvers<boolean>();
      let active = 0;
      let peak = 0;
      context.storage.head = vi.fn(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;

        if (fail) {
          throw new Error("Storage unavailable");
        }

        throw Object.assign(new Error("Not found"), { name: "NoSuchKey" });
      });
      context.storage.createUploadUrl = vi.fn<
        typeof context.storage.createUploadUrl
      >(
        async ({ key }) =>
          await Promise.resolve({
            key,
            uploadUrl: `https://storage.test/${key}`,
          })
      );

      const assets = Array.from({ length: 9 }, (_, index) => ({
        checksum: logoChecksum,
        contentLength: 1,
        path: `asset-${index}.bin`,
      }));

      const result = Effect.runPromise(
        prepareStaticAssets({ ...context, app: currentApp }, assets)
      );

      const outcome = fail
        ? expect(result).rejects.toMatchObject({
            code: "INTERNAL_SERVER_ERROR",
          })
        : expect(result).resolves.toMatchObject(assets);

      try {
        await vi.waitFor(() => {
          expect(active).toBeGreaterThanOrEqual(4);
        });
        expect(active).toBe(4);
      } finally {
        gate.resolve(true);
        await outcome;
      }

      expect(peak).toBe(4);
      expect(context.storage.head).toHaveBeenCalledTimes(fail ? 4 : 9);
      expect(context.storage.createUploadUrl).toHaveBeenCalledTimes(
        fail ? 0 : 9
      );
    }
  );

  it("publishes a batch with bounded verification and rolls back conflicting metadata", async () => {
    const context = publishContext("https://storage.test/logo");
    const currentApp = requireValue(await db.query.app.findFirst());
    context.storage.head = vi.fn().mockRejectedValue({ name: "NoSuchKey" });
    context.storage.createUploadUrl = vi.fn<
      typeof context.storage.createUploadUrl
    >(
      async ({ key }) =>
        await Promise.resolve({ key, uploadUrl: `https://storage.test/${key}` })
    );

    const assets = Array.from({ length: 9 }, (_, index) => ({
      checksum: logoChecksum,
      contentLength: 1,
      path: `asset-${8 - index}.bin`,
    }));

    const create = async () =>
      await call(
        deploymentRouter.create,
        {
          body: {
            app: { id: currentApp.id },
            assets: [
              {
                checksum: logoChecksum,
                contentLength: 11,
                contentType: "application/javascript",
                encoding: "utf-8",
                objectKey: "client.js",
              },
            ],
            scope: productionScope,
            staticAssets: assets,
          },
        },
        { context }
      );

    const created = await create();
    expect(created.body.staticAssets?.map(({ file }) => file.path)).toEqual(
      assets.map((asset) => asset.path)
    );
    expect(await db.select().from(appDeploymentAsset)).toHaveLength(9);
    const gate = Promise.withResolvers<boolean>();
    let active = 0;
    let peak = 0;
    context.storage.head = vi.fn<typeof context.storage.head>(
      async ({ key }) => {
        const isStatic = key.endsWith(".bin");

        if (isStatic) {
          active += 1;
          peak = Math.max(peak, active);
          await gate.promise;
          active -= 1;
        }

        return {
          checksumSha256: logoChecksumBase64,
          contentLength: isStatic ? 1 : 11,
          contentType: isStatic
            ? "application/octet-stream"
            : "application/javascript",
          key,
        };
      }
    );

    const publish = call(
      deploymentRouter.publish,
      {
        body: { rollout: false, scope: productionScope },
        params: { deploymentId: created.body.deployment.id },
      },
      { context }
    );

    try {
      await vi.waitFor(() => {
        expect(active).toBeGreaterThanOrEqual(4);
      });
      expect(active).toBe(4);
    } finally {
      gate.resolve(true);
      await publish;
    }

    expect(peak).toBe(4);
    const verifiedAssets = await db.select().from(appAsset);
    expect(verifiedAssets.every((asset) => asset.status === "verified")).toBe(
      true
    );
    await db.update(appAsset).set({ contentLength: 2 });
    context.storage.head = vi.fn().mockRejectedValue({ name: "NoSuchKey" });
    await expect(create()).rejects.toThrow("Asset metadata conflicts");
    expect(await db.select().from(appDeployment)).toHaveLength(1);
    expect(await db.select().from(appDeploymentAsset)).toHaveLength(9);
  });

  it.each([
    { extraBytes: 0, reuse: false },
    { extraBytes: 1, reuse: false },
    { extraBytes: 0, reuse: true },
    { extraBytes: 1, reuse: true },
  ])(
    "counts static assets with bundles and logos at creation ($extraBytes bytes over, reused=$reuse)",
    async ({ extraBytes, reuse }) => {
      const currentApp = requireValue(await db.query.app.findFirst());
      const context = publishContext("https://uploads.example/bundle");
      const checksum = "a".repeat(64);
      const contentLength = 3 * 1024 * 1024 + extraBytes;
      const objectKey = `projects/${context.project.shortId}/apps/${currentApp.shortId}/assets/${checksum}/doom.wad`;
      context.storage.createUploadUrl = vi.fn<
        typeof context.storage.createUploadUrl
      >(
        asyncFixture(({ key }) => ({
          key,
          uploadUrl: `https://uploads.example/${key}`,
        }))
      );
      context.storage.head = asyncFixture(({ key }) => {
        if (key === objectKey && reuse) {
          return {
            checksumSha256: Buffer.from(checksum, "hex").toString("base64"),
            contentLength,
            contentType: "application/octet-stream",
            key,
          };
        }

        throw Object.assign(new Error("Not found"), { name: "NotFound" });
      });

      if (reuse) {
        await db.insert(appAsset).values({
          appId: currentApp.id,
          checksum,
          contentLength,
          contentType: "application/octet-stream",
          objectKey,
          path: "doom.wad",
          status: "verified",
        });
      }

      const metadata = {
        checksum: logoChecksum,
        contentType: "application/javascript" as const,
        encoding: "utf-8" as const,
      };

      const logo = {
        checksum: logoChecksum,
        contentLength: 11,
        contentType: "image/svg+xml" as const,
      };

      const create = call(
        deploymentRouter.create,
        {
          body: {
            app: { id: currentApp.id },
            assets: [
              {
                ...metadata,
                contentLength: 6 * 1024 * 1024,
                objectKey: "client.js",
              },
            ],
            logos: { dark: "logo.svg", light: "logo.svg" },
            scope: productionScope,
            server: {
              ...metadata,
              contentLength: 1024 * 1024 - 11,
              objectKey: "server.js",
            },
            staticAssets: [
              { checksum, contentLength, path: "doom.wad" },
              { ...logo, path: "logo.svg" },
            ],
          },
        },
        { context }
      );

      if (extraBytes > 0) {
        await expect(create).rejects.toThrow("Input validation failed");
        expect(context.storage.createUploadUrl).not.toHaveBeenCalled();
      } else {
        const created = await create;
        expect(created.body.staticAssets?.[0]?.uploadUrl !== undefined).toBe(
          !reuse
        );
      }
    }
  );

  it.each([0, 1])(
    "reserves reused static bytes while verifying decompressed bundles (%i bytes over)",
    async (extraBytes) => {
      const currentApp = requireValue(await db.query.app.findFirst());
      const context = publishContext("https://uploads.example/bundle");
      const staticBytes = 3 * 1024 * 1024;
      const checksum = "a".repeat(64);
      const objectKey = `projects/${context.project.shortId}/apps/${currentApp.shortId}/assets/${checksum}/doom.wad`;
      await db.insert(appAsset).values({
        appId: currentApp.id,
        checksum,
        contentLength: staticBytes,
        contentType: "application/octet-stream",
        objectKey,
        path: "doom.wad",
        status: "verified",
      });

      const decoded = Buffer.alloc(
        maxDeploymentBytes - staticBytes + extraBytes,
        "x"
      );

      const compressed = gzipSync(decoded);

      const clientChecksum = createHash("sha256")
        .update(compressed)
        .digest("hex");

      context.storage.createUploadUrl = vi.fn<
        typeof context.storage.createUploadUrl
      >(
        asyncFixture(({ key }) => ({
          key,
          uploadUrl: `https://uploads.example/${key}`,
        }))
      );
      context.storage.head = asyncFixture(({ key }) =>
        key === objectKey
          ? {
              checksumSha256: Buffer.from(checksum, "hex").toString("base64"),
              contentLength: staticBytes,
              contentType: "application/octet-stream",
              key,
            }
          : {
              checksumSha256: Buffer.from(clientChecksum, "hex").toString(
                "base64"
              ),
              contentEncoding: "gzip",
              contentLength: compressed.byteLength,
              contentType: "application/javascript",
              key,
            }
      );

      const created = await call(
        deploymentRouter.create,
        {
          body: {
            app: { id: currentApp.id },
            assets: [
              {
                checksum: clientChecksum,
                contentLength: compressed.byteLength,
                contentType: "application/javascript",
                encoding: "gzip",
                objectKey: "client.js",
              },
            ],
            scope: productionScope,
            staticAssets: [
              { checksum, contentLength: staticBytes, path: "doom.wad" },
            ],
          },
        },
        { context }
      );

      expect(created.body.staticAssets?.[0]?.uploadUrl).toBeUndefined();
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(decoded));

      const publish = call(
        deploymentRouter.publish,
        {
          body: { rollout: false, scope: productionScope },
          params: { deploymentId: created.body.deployment.id },
        },
        { context }
      );

      if (extraBytes > 0) {
        await expect(publish).rejects.toThrow("after decompression");

        return;
      }

      await expect(publish).resolves.toMatchObject({
        body: { status: "published" },
      });
    }
  );

  it("rechecks stored static references against the budget before publication", async () => {
    const deployment = await createLogoDeployment();

    const [asset] = await db
      .insert(appAsset)
      .values({
        appId: deployment.appId,
        checksum: "a".repeat(64),
        contentLength: maxDeploymentBytes,
        contentType: "application/octet-stream",
        objectKey: "stored/static/file",
        path: "doom.wad",
        status: "verified",
      })
      .returning();

    await db.insert(appDeploymentAsset).values({
      appAssetId: requireValue(asset).id,
      appDeploymentId: deployment.id,
      appId: deployment.appId,
    });
    const context = publishContext("https://uploads.example/bundle");
    await expect(
      call(
        deploymentRouter.publish,
        {
          body: { rollout: false, scope: productionScope },
          params: { deploymentId: deployment.id },
        },
        { context }
      )
    ).rejects.toThrow("Combined deployment assets cannot exceed");
    expect(context.storage.head).not.toHaveBeenCalled();
  });

  it.each([0, 1])(
    "checks the combined upload budget with %i bytes over the limit",
    async (extraBytes) => {
      const currentApp = requireValue(await db.query.app.findFirst());
      const context = publishContext("https://uploads.example/bundle");
      context.storage.createUploadUrl = vi.fn<
        typeof context.storage.createUploadUrl
      >(
        asyncFixture(({ key }) => ({
          key,
          uploadUrl: `https://uploads.example/${key}`,
        }))
      );

      context.storage.head = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("Not found"), { name: "NotFound" })
        );

      const metadata = {
        checksum: "a".repeat(64),
        contentType: "application/javascript" as const,
        encoding: "utf-8" as const,
      };

      const logo = {
        checksum: logoChecksum,
        contentLength: 11,
        contentType: "image/svg+xml" as const,
      };

      const create = call(
        deploymentRouter.create,
        {
          body: {
            app: { id: currentApp.id },
            assets: [
              {
                ...metadata,
                contentLength: 6 * 1024 * 1024,
                objectKey: "client.js",
              },
            ],
            logos: { dark: "logo.svg", light: "logo.svg" },
            scope: productionScope,
            server: {
              ...metadata,
              contentLength: 4 * 1024 * 1024 - 11 + extraBytes,
              objectKey: "server.js",
            },
            staticAssets: [{ ...logo, path: "logo.svg" }],
          },
        },
        { context }
      );

      if (extraBytes > 0) {
        await expect(create).rejects.toThrow("Input validation failed");
        expect(context.storage.createUploadUrl).not.toHaveBeenCalled();

        return;
      }

      await expect(create).resolves.toMatchObject({
        body: { deployment: { status: "uploading" } },
      });
    }
  );

  it.each([
    { encoding: "gzip", extraBytes: 0 },
    { encoding: "gzip", extraBytes: 1 },
    { encoding: "utf-8", extraBytes: 0 },
    { encoding: "utf-8", extraBytes: 1 },
  ] as const)(
    "checks the decoded client, $encoding server, and both logos together ($extraBytes bytes over)",
    async ({ encoding, extraBytes }) => {
      const currentApp = requireValue(await db.query.app.findFirst());
      const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
      const clientBundle = Buffer.alloc(6 * 1024 * 1024, 120);

      const server = Buffer.alloc(
        maxDeploymentBytes -
          clientBundle.byteLength -
          logo.byteLength +
          extraBytes,
        121
      );

      const uploadedClient = gzipSync(clientBundle);
      const uploadedServer = encoding === "gzip" ? gzipSync(server) : server;
      const context = publishContext("https://uploads.example/bundle");
      context.storage.createUploadUrl = vi.fn<
        typeof context.storage.createUploadUrl
      >(
        asyncFixture(({ key }) => ({
          key,
          uploadUrl: `https://uploads.example/${key}`,
        }))
      );

      context.storage.head = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("Not found"), { name: "NotFound" })
        );

      const logoMetadata = {
        ...describeFile(logo),
        contentType: "image/svg+xml" as const,
      };

      const created = await call(
        deploymentRouter.create,
        {
          body: {
            app: { id: currentApp.id },
            assets: [
              {
                ...describeFile(uploadedClient),
                contentType: "application/javascript",
                encoding: "gzip",
                objectKey: "client.js",
              },
            ],
            logos: { dark: "logo.svg", light: "logo.svg" },
            scope: productionScope,
            server: {
              ...describeFile(uploadedServer),
              contentType: "application/javascript",
              encoding,
              objectKey: "server.js",
            },
            staticAssets: [{ ...logoMetadata, path: "logo.svg" }],
          },
        },
        { context }
      );

      const files = await db.query.appDeploymentFile.findMany({
        where: { appDeploymentId: created.body.deployment.id },
      });

      const staticFiles =
        created.body.staticAssets?.map(({ file }) => ({
          ...file,
          encoding: null,
        })) ?? [];

      context.storage.head = vi.fn<typeof context.storage.head>(
        asyncFixture(({ key }) => {
          const file = requireValue(
            [...files, ...staticFiles].find((entry) => entry.objectKey === key)
          );

          return {
            checksumSha256: Buffer.from(
              requireValue(file.checksum),
              "hex"
            ).toString("base64"),
            contentEncoding: file.encoding === "gzip" ? "gzip" : undefined,
            contentLength: file.contentLength,
            contentType: file.contentType,
            key,
          };
        })
      );
      context.storage.createDownloadUrl = vi.fn<
        typeof context.storage.createDownloadUrl
      >(
        asyncFixture(({ key }) => ({
          key,
          url: `https://uploads.example/${key}`,
        }))
      );

      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
        asyncFixture((input) => {
          const url = input instanceof Request ? input.url : String(input);

          if (url.endsWith("/client.js")) {
            return new Response(clientBundle);
          }

          if (url.endsWith("/server.js")) {
            return new Response(server);
          }

          return new Response(logo);
        })
      );

      const publish = call(
        deploymentRouter.publish,
        {
          body: { rollout: false, scope: productionScope },
          params: { deploymentId: created.body.deployment.id },
        },
        { context }
      );

      if (extraBytes > 0) {
        await expect(publish).rejects.toThrow(
          `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes after decompression.`
        );
        expect(
          await db.query.appDeployment.findFirst({
            where: { id: created.body.deployment.id },
          })
        ).toMatchObject({ status: "uploading" });

        return;
      }

      await expect(publish).resolves.toMatchObject({
        body: { status: "published" },
      });
      expect(fetchMock).toHaveBeenCalledTimes(encoding === "gzip" ? 3 : 2);
    }
  );

  it("rejects cross-app asset links and ownership changes in the database", async () => {
    const deployment = await createLogoDeployment();

    const [otherApp] = await db
      .insert(appTable)
      .values({
        name: "Other app",
        projectId,
        shortId: "app000000002",
        ...canonicalizeScope(productionScope),
      })
      .returning();

    const otherAppId = requireValue(otherApp).id;

    const [otherDeployment] = await db
      .insert(appDeployment)
      .values({ appId: otherAppId, shortId: "dep000000002" })
      .returning();

    const [asset] = await db
      .insert(appAsset)
      .values({
        appId: deployment.appId,
        checksum: "a".repeat(64),
        contentLength: 11,
        contentType: "application/octet-stream",
        objectKey: "stored/static/file",
        path: "doom.wad",
      })
      .returning();

    const appAssetId = requireValue(asset).id;
    const foreignKeyViolation = { cause: { code: "23503" } };

    await expect(
      db.insert(appDeploymentAsset).values({
        appAssetId,
        appDeploymentId: requireValue(otherDeployment).id,
        appId: deployment.appId,
      })
    ).rejects.toMatchObject(foreignKeyViolation);
    await expect(
      db.insert(appDeploymentAsset).values({
        appAssetId,
        appDeploymentId: requireValue(otherDeployment).id,
        appId: otherAppId,
      })
    ).rejects.toMatchObject(foreignKeyViolation);
    expect(
      await db
        .select()
        .from(appDeploymentAsset)
        .where(eq(appDeploymentAsset.appAssetId, appAssetId))
    ).toHaveLength(0);

    await db.insert(appDeploymentAsset).values({
      appAssetId,
      appDeploymentId: deployment.id,
      appId: deployment.appId,
    });
    await expect(
      db.update(appDeploymentAsset).set({ appId: otherAppId })
    ).rejects.toMatchObject(foreignKeyViolation);
    await expect(
      db
        .update(appAsset)
        .set({ appId: otherAppId })
        .where(eq(appAsset.id, appAssetId))
    ).rejects.toMatchObject(foreignKeyViolation);
    await expect(
      db
        .update(appDeployment)
        .set({ appId: otherAppId })
        .where(eq(appDeployment.id, deployment.id))
    ).rejects.toMatchObject(foreignKeyViolation);
  });

  it("reuses hashed files between deployments, lists their references, and preserves shared files on deletion", async () => {
    const context = publishContext("https://private.example/file");
    const currentApp = requireValue(await db.query.app.findFirst());
    const checksum = "a".repeat(64);

    const stored = new Map<
      string,
      {
        key: string;
        contentLength: number;
        contentType: string;
        checksumSha256: string;
      }
    >();

    const uploads: string[] = [];
    context.storage.head = async ({ key }) => {
      const object = stored.get(key);

      if (!object) {
        throw Object.assign(new Error("Not found"), { name: "NotFound" });
      }

      return await Promise.resolve(object);
    };

    context.storage.createUploadUrl = async (input) => {
      uploads.push(input.key);

      return await Promise.resolve({
        headers: {
          "content-type": input.contentType ?? "application/octet-stream",
        },
        key: input.key,
        uploadUrl: `https://uploads.example/${input.key}`,
      });
    };

    const create = async (hash: string) =>
      await call(
        deploymentRouter.create,
        {
          body: {
            app: { id: currentApp.id },
            assets: [
              {
                checksum: logoChecksum,
                contentLength: 11,
                contentType: "application/javascript",
                encoding: "utf-8",
                objectKey: "client.js",
              },
            ],
            scope: productionScope,
            staticAssets: [
              { checksum: hash, contentLength: 11, path: "game/doom.wad" },
            ],
          },
        },
        { context }
      );

    const first = await create(checksum);
    const firstAsset = requireValue(first.body.staticAssets?.[0]);
    expect(firstAsset.uploadUrl).toBeDefined();
    stored.set(firstAsset.file.objectKey, {
      checksumSha256: Buffer.from(checksum, "hex").toString("base64"),
      contentLength: 11,
      contentType: "application/octet-stream",
      key: firstAsset.file.objectKey,
    });
    const second = await create(checksum);
    expect(second.body.staticAssets?.[0]?.file.id).toBe(firstAsset.file.id);
    expect(second.body.staticAssets?.[0]?.uploadUrl).toBeUndefined();
    expect(uploads.filter((key) => key.includes("/assets/"))).toHaveLength(1);
    expect(await db.select().from(appAsset)).toHaveLength(1);
    expect(await db.select().from(appDeploymentAsset)).toHaveLength(2);

    const listed = await call(
      deploymentRouter.get,
      {
        body: { scopes: [productionScope] },
        params: { deploymentId: second.body.deployment.id },
      },
      { context }
    );

    expect(listed.body.staticAssets[0]?.checksum).toBe(checksum);
    await expect(
      db.delete(appAsset).where(eq(appAsset.id, firstAsset.file.id))
    ).rejects.toThrow();
    await db
      .delete(appDeployment)
      .where(eq(appDeployment.id, first.body.deployment.id));
    expect(await db.select().from(appAsset)).toHaveLength(1);
    expect(await db.select().from(appDeploymentAsset)).toHaveLength(1);
    const changed = await create("c".repeat(64));
    expect(changed.body.staticAssets?.[0]?.file.objectKey).not.toBe(
      firstAsset.file.objectKey
    );

    await expect(
      call(
        deploymentRouter.publish,
        {
          body: { rollout: false, scope: productionScope },
          params: { deploymentId: second.body.deployment.id },
        },
        { context }
      )
    ).rejects.toThrow();
    stored.set(requireValue(second.body.assets[0]).file.objectKey, {
      checksumSha256: logoChecksumBase64,
      contentLength: 11,
      contentType: "application/javascript",
      key: requireValue(second.body.assets[0]).file.objectKey,
    });
    stored.set(firstAsset.file.objectKey, {
      checksumSha256: logoChecksumBase64,
      contentLength: 11,
      contentType: "application/octet-stream",
      key: firstAsset.file.objectKey,
    });
    await expect(
      call(
        deploymentRouter.publish,
        {
          body: { rollout: false, scope: productionScope },
          params: { deploymentId: second.body.deployment.id },
        },
        { context }
      )
    ).rejects.toThrow("Failed to verify asset");
    stored.set(firstAsset.file.objectKey, {
      checksumSha256: Buffer.from(checksum, "hex").toString("base64"),
      contentLength: 11,
      contentType: "application/octet-stream",
      key: firstAsset.file.objectKey,
    });

    const published = await call(
      deploymentRouter.publish,
      {
        body: { rollout: false, scope: productionScope },
        params: { deploymentId: second.body.deployment.id },
      },
      { context }
    );

    expect(published.body.status).toBe("published");

    const verified = await db.query.appAsset.findFirst({
      where: { id: firstAsset.file.id },
    });

    expect(verified?.status).toBe("verified");
  });

  it("hides a deployment when its app has a malformed stored scope", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deployment = await createLogoDeployment();
    await db
      .update(appTable)
      .set({ scope: { name: "environment", value: {} } })
      .where(eq(appTable.id, deployment.appId));
    await expect(
      call(
        deploymentRouter.get,
        {
          body: { scopes: [productionScope] },
          params: { deploymentId: deployment.id },
        },
        { context: publishContext("https://uploads.example/logo-dark.svg") }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(warn).toHaveBeenCalledWith(
      "Deployment app has an invalid stored scope.",
      expect.objectContaining({
        appId: deployment.appId,
        deploymentId: deployment.id,
      })
    );
  });

  it("hides a deployment when its stored scope key does not match its scope", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deployment = await createLogoDeployment();
    await db
      .update(appTable)
      .set({ scopeKey: "0".repeat(32) })
      .where(eq(appTable.id, deployment.appId));

    await expect(
      call(
        deploymentRouter.get,
        {
          body: { scopes: [productionScope] },
          params: { deploymentId: deployment.id },
        },
        { context: publishContext("https://uploads.example/logo-dark.svg") }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(warn).toHaveBeenCalledWith(
      "Deployment app has an invalid stored scope.",
      expect.objectContaining({
        appId: deployment.appId,
        deploymentId: deployment.id,
      })
    );
  });

  it.each(["utf-8", "gzip"] as const)(
    "uploads and verifies %s client and private server code",
    async (encoding) => {
      const context = publishContext("https://private.example/server");

      const uploads = vi.fn(
        asyncFixture(({ key }: { key: string }) => ({
          key,
          uploadUrl: `https://uploads.example/${key}`,
        }))
      );

      context.storage.createUploadUrl = uploads;
      const currentApp = await db.query.app.findFirst();

      if (!currentApp) {
        throw new Error("Missing app");
      }

      const metadata = {
        checksum: logoChecksum,
        contentLength: 11,
        contentType: "application/javascript" as const,
        encoding,
      };

      const created = await call(
        deploymentRouter.create,
        {
          body: {
            app: { id: currentApp.id },
            assets: [{ ...metadata, objectKey: "client.js" }],
            hooks: ["sync", "billing.updated"],
            scope: productionScope,
            server: { ...metadata, objectKey: "server.js" },
            views: [
              { instances: true, path: "/", slot: "page" },
              { disabled: true, path: "/disabled", slot: "page" },
            ],
          },
        },
        { context }
      );

      expect(created.body.assets[0]?.file.objectKey).toMatch(
        /\/client\/client\.js$/u
      );
      expect(created.body.server?.file.objectKey).toMatch(
        /\/server\/server\.js$/u
      );
      expect(created.body.deployment.hooks).toEqual([
        "sync",
        "billing.updated",
      ]);
      expect(created.body.deployment.views).toEqual([
        { instances: true, path: "/", slot: "page" },
        { disabled: true, path: "/disabled", slot: "page" },
      ]);
      expect(uploads).toHaveBeenCalledTimes(2);
      expect(uploads).toHaveBeenCalledWith(
        expect.objectContaining({
          contentEncoding: encoding === "gzip" ? "gzip" : undefined,
          key: created.body.assets[0]?.file.objectKey,
        })
      );
      expect(uploads).toHaveBeenCalledWith(
        expect.objectContaining({
          contentEncoding: encoding === "gzip" ? "gzip" : undefined,
          key: created.body.server?.file.objectKey,
        })
      );
      await expect(
        call(
          deploymentRouter.runtime,
          { body: {}, params: { appId: currentApp.id } },
          { context: { ...context, runtimeService: true } }
        )
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(context.storage.createDownloadUrl).not.toHaveBeenCalled();
      context.storage.head = vi.fn().mockResolvedValue({
        checksumSha256: logoChecksumBase64,
        contentEncoding: encoding === "gzip" ? "gzip" : undefined,
        contentLength: 11,
        contentType: "application/javascript",
      });

      if (encoding === "gzip") {
        vi.mocked(context.storage.head).mockResolvedValueOnce({
          checksumSha256: logoChecksumBase64,
          contentLength: 11,
          contentType: "application/javascript",
          key: requireValue(created.body.assets[0]).file.objectKey,
        });
        await expect(
          call(
            deploymentRouter.publish,
            {
              body: { rollout: true, scope: productionScope },
              params: { deploymentId: created.body.deployment.id },
            },
            { context }
          )
        ).rejects.toThrow(
          "Uploaded file content encoding does not match deployment record."
        );
      }

      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(asyncFixture(() => new Response("client-code")));

      const published = await call(
        deploymentRouter.publish,
        {
          body: { rollout: true, scope: productionScope },
          params: { deploymentId: created.body.deployment.id },
        },
        { context }
      );

      expect(published.body.hooks).toEqual(["sync", "billing.updated"]);
      await expect(
        call(
          deploymentRouter.runtime,
          { body: {}, params: { appId: currentApp.id } },
          { context }
        )
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const runtime = await call(
        deploymentRouter.runtime,
        { body: {}, params: { appId: currentApp.id } },
        { context: { ...context, runtimeService: true } }
      );

      await expect(
        call(
          deploymentRouter.runtime,
          { body: {}, params: { appId: currentApp.id } },
          {
            context: {
              ...context,
              project: {
                ...context.project,
                id: "33333333-3333-4333-8333-333333333333",
              },
              runtimeService: true,
            },
          }
        )
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(runtime.body).toEqual(
        encoding === "gzip"
          ? {
              appId: currentApp.id,
              checksum: logoChecksum,
              contentEncoding: "gzip",
              contentLength: 11,
              deploymentId: created.body.deployment.id,
              objectKey: created.body.server?.file.objectKey,
              projectId: context.project.id,
            }
          : {
              appId: currentApp.id,
              checksum: logoChecksum,
              contentLength: 11,
              deploymentId: created.body.deployment.id,
              objectKey: created.body.server?.file.objectKey,
              projectId: context.project.id,
            }
      );

      if (encoding === "gzip") {
        expect(context.storage.createDownloadUrl).toHaveBeenCalledTimes(2);
        expect(context.storage.createDownloadUrl).toHaveBeenCalledWith({
          expiresInSeconds: 60,
          key: requireValue(created.body.assets[0]).file.objectKey,
        });
        expect(context.storage.createDownloadUrl).toHaveBeenCalledWith({
          expiresInSeconds: 60,
          key: requireValue(created.body.server).file.objectKey,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } else {
        expect(context.storage.createDownloadUrl).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
      }

      const files = await db.query.appDeploymentFile.findMany({
        where: { appDeploymentId: created.body.deployment.id },
      });

      expect(files).toHaveLength(2);
      expect(files.every((file) => file.status === "verified")).toBe(true);
    }
  );

  it.each([true, false])(
    "advances installations for client-only publication only with rollout enabled (%s)",
    async (rollout) => {
      const context = publishContext("https://uploads.example/client.js");
      const source = requireValue(await db.query.app.findFirst());

      const [previous, deployment] = await db
        .insert(appDeployment)
        .values([
          { appId: source.id, status: "published" },
          { appId: source.id, status: "uploading" },
        ])
        .returning();

      if (!previous || !deployment) {
        throw new Error("Expected rollout deployments");
      }

      await db
        .update(appTable)
        .set({ currentDeploymentId: previous.id })
        .where(eq(appTable.id, source.id));

      const [installation] = await db
        .insert(appTable)
        .values({
          currentDeploymentId: previous.id,
          name: "Installed Inbox",
          projectId,
          ...canonicalizeScope({
            name: "environment",
            value: { environment: "staging" },
          }),
        })
        .returning();

      if (!installation) {
        throw new Error("Expected rollout installation");
      }

      await db.insert(appDeploymentFile).values({
        appDeploymentId: deployment.id,
        checksum: logoChecksum,
        contentLength: 11,
        contentType: "application/javascript",
        objectKey: `projects/${context.project.shortId}/apps/${source.shortId}/deployments/${deployment.shortId}/client/client.js`,
      });
      context.storage.head = vi.fn().mockResolvedValue({
        checksumSha256: logoChecksumBase64,
        contentLength: 11,
        contentType: "application/javascript",
      });

      await call(
        deploymentRouter.publish,
        {
          body: { rollout, scope: productionScope },
          params: { deploymentId: deployment.id },
        },
        { context }
      );

      const expected = rollout ? deployment.id : previous.id;

      expect(
        await db.query.app.findFirst({ where: { id: source.id } })
      ).toMatchObject({ currentDeploymentId: expected });
      expect(
        await db.query.app.findFirst({ where: { id: installation.id } })
      ).toMatchObject({ currentDeploymentId: expected });
    }
  );

  const createGzipClientDeployment = async (decoded: Uint8Array) => {
    const bytes = gzipSync(decoded);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const context = publishContext("https://uploads.example/client.js");
    context.storage.createUploadUrl = vi.fn<
      typeof context.storage.createUploadUrl
    >(
      asyncFixture(({ key }) => ({
        key,
        uploadUrl: `https://uploads.example/${key}`,
      }))
    );
    context.storage.head = vi.fn<typeof context.storage.head>(
      asyncFixture(({ key }) => ({
        checksumSha256: Buffer.from(checksum, "hex").toString("base64"),
        contentEncoding: "gzip",
        contentLength: bytes.byteLength,
        contentType: "application/javascript",
        key,
      }))
    );
    const currentApp = await db.query.app.findFirst();

    if (!currentApp) {
      throw new Error("Missing app");
    }

    const created = await call(
      deploymentRouter.create,
      {
        body: {
          app: { id: currentApp.id },
          assets: [
            {
              checksum,
              contentLength: bytes.byteLength,
              contentType: "application/javascript",
              encoding: "gzip",
              objectKey: "client.js",
            },
          ],
          scope: productionScope,
        },
      },
      { context }
    );

    return { context, created };
  };

  it("rejects oversized inflated client code before publication and cancels the decoded stream", async () => {
    const decoded = new Uint8Array(maxDeploymentBytes + 1);
    const { context, created } = await createGzipClientDeployment(decoded);
    const cancel = vi.fn();
    let position = 0;

    const chunks = [
      decoded.subarray(0, maxDeploymentBytes),
      decoded.subarray(maxDeploymentBytes),
      new Uint8Array(1),
    ];

    const body = new ReadableStream<Uint8Array>(
      {
        cancel,
        pull(controller) {
          controller.enqueue(requireValue(chunks[(position += 1) - 1]));
        },
      },
      { highWaterMark: 0 }
    );

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(body, { headers: { "Content-Encoding": "gzip" } })
      );

    await expect(
      call(
        deploymentRouter.publish,
        {
          body: { rollout: true, scope: productionScope },
          params: { deploymentId: created.body.deployment.id },
        },
        { context }
      )
    ).rejects.toThrow(
      `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes after decompression.`
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(position).toBe(2);
    const expectedSignalMatcher1: unknown = expect.any(AbortSignal);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://uploads.example/client.js"),
      expect.objectContaining({
        redirect: "error",
        signal: expectedSignalMatcher1,
      })
    );

    const deployment = await db.query.appDeployment.findFirst({
      where: { id: created.body.deployment.id },
    });

    const file = await db.query.appDeploymentFile.findFirst({
      where: { appDeploymentId: created.body.deployment.id },
    });

    const currentApp = await db.query.app.findFirst();
    expect(deployment?.status).toBe("uploading");
    expect(file?.status).toBe("failed");
    expect(currentApp?.currentDeploymentId).toBeNull();
  });

  it("publishes gzip client code whose decoded size is exactly 10 MiB", async () => {
    const decoded = new Uint8Array(maxDeploymentBytes);
    const { context, created } = await createGzipClientDeployment(decoded);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(decoded, { headers: { "Content-Encoding": "gzip" } })
    );

    const published = await call(
      deploymentRouter.publish,
      {
        body: { rollout: true, scope: productionScope },
        params: { deploymentId: created.body.deployment.id },
      },
      { context }
    );

    expect(published.body.status).toBe("published");

    const file = await db.query.appDeploymentFile.findFirst({
      where: { appDeploymentId: created.body.deployment.id },
    });

    expect(file?.status).toBe("verified");
    const currentApp = await db.query.app.findFirst();
    expect(currentApp?.currentDeploymentId).toBe(published.body.id);
  });

  it.each(["stream-error", "missing-body", "upstream-failure"])(
    "rejects gzip client inspection with %s",
    async (failure) => {
      const { context, created } = await createGzipClientDeployment(
        new TextEncoder().encode("client-code")
      );

      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("Invalid gzip"));
        },
      });

      const response =
        failure === "stream-error"
          ? new Response(body)
          : new Response(null, {
              status: failure === "upstream-failure" ? 503 : 200,
            });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
      await expect(
        call(
          deploymentRouter.publish,
          {
            body: { rollout: true, scope: productionScope },
            params: { deploymentId: created.body.deployment.id },
          },
          { context }
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      const file = await db.query.appDeploymentFile.findFirst({
        where: { appDeploymentId: created.body.deployment.id },
      });

      expect(file?.status).toBe("failed");
    }
  );

  it("maps reordered returned files using their generated file IDs", () => {
    const assets = [
      { asset: { objectKey: "client.js" }, fileId: "client-file-id" },
      {
        asset: { objectKey: `logos/${logoChecksum}.svg` },
        fileId: "logo-file-id",
      },
    ];

    const returnedFiles = [
      { id: "logo-file-id", objectKey: "stored-logo" },
      { id: "client-file-id", objectKey: "stored-client" },
    ];

    const filesByAssetPath = mapReturnedFilesByAssetPath(assets, returnedFiles);

    expect(filesByAssetPath.get("client.js")?.id).toBe("client-file-id");
    expect(filesByAssetPath.get(`logos/${logoChecksum}.svg`)?.id).toBe(
      "logo-file-id"
    );
  });

  it.each([
    { assetPath: "logo.svg", contentLength: 11, path: "missing.svg" },
    { assetPath: "logo.js", contentLength: 11, path: "logo.js" },
    { assetPath: "logo.svg", contentLength: 262_145, path: "logo.svg" },
  ])(
    "rejects invalid logo asset references: $path ($contentLength bytes)",
    async ({ path, assetPath, contentLength }) => {
      const currentApp = requireValue(await db.query.app.findFirst());
      const context = publishContext("https://uploads.example/logo.svg");
      context.storage.head = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("Not found"), { name: "NotFound" })
        );
      context.storage.createUploadUrl = vi.fn<
        typeof context.storage.createUploadUrl
      >(
        asyncFixture(({ key }: { key: string }) => ({
          key,
          uploadUrl: `https://uploads.example/${key}`,
        }))
      );
      await expect(
        call(
          deploymentRouter.create,
          {
            body: {
              app: { id: currentApp.id },
              assets: [
                {
                  checksum: "a".repeat(64),
                  contentLength: 1,
                  contentType: "application/javascript",
                  encoding: "utf-8",
                  objectKey: "client.js",
                },
              ],
              logos: { dark: path },
              scope: productionScope,
              staticAssets: [
                { checksum: logoChecksum, contentLength, path: assetPath },
              ],
            },
          },
          { context }
        )
      ).rejects.toThrow("Logos must reference SVG, PNG, or WebP assets");
      expect(await db.select().from(appDeployment)).toHaveLength(0);
    }
  );

  it("creates optional logo assets alongside the client bundle", async () => {
    const createUploadUrl = vi.fn(
      asyncFixture(({ key }: { key: string }) => ({
        key,
        uploadUrl: `https://uploads.example/${key}`,
      }))
    );

    const context = {
      organization: {
        createdAt: new Date(),
        id: organizationId,
        logo: null,
        metadata: null,
        name: "Analytical Engines",
        shortId: "team00000001",
        slug: "analytical-engines",
      },
      project: {
        createdAt: new Date(),
        id: projectId,
        name: "Compiler",
        organizationId,
        shortId: "proj00000001",
        slug: "compiler",
        updatedAt: new Date(),
      },
      storage: {
        createDownloadUrl: vi.fn(),
        createUploadUrl,
        delete: vi.fn(),
        head: vi.fn().mockRejectedValue({ name: "NoSuchKey" }),
        type: "s3",
      },
    } satisfies Context;

    const app = await db.query.app.findFirst();

    if (!app) {
      throw new Error("Test app was not created.");
    }

    const result = await call(
      deploymentRouter.create,
      {
        body: {
          app: { id: app.id },
          assets: [
            {
              checksum: "a".repeat(64),
              contentLength: maxDeploymentBytes - 262_144,
              contentType: "application/javascript",
              encoding: "utf-8",
              objectKey: "client.js",
            },
          ],
          logos: { dark: "logo.svg", light: "logo.svg" },
          scope: productionScope,
          staticAssets: [
            {
              checksum: logoChecksum,
              contentLength: 262_144,
              path: "logo.svg",
            },
          ],
        },
      },
      { context }
    );

    expect(result.body.assets).toHaveLength(1);
    expect(result.body.staticAssets).toHaveLength(1);
    expect(result.body.staticAssets?.[0]?.file.path).toBe("logo.svg");
    expect(result.body.deployment).toMatchObject({
      logoDarkPath: `assets/${logoChecksum}/logo.svg`,
      logoLightPath: `assets/${logoChecksum}/logo.svg`,
    });
    expect(result.body.deployment.clientEntryFileId).toBeTypeOf("string");
    expect(createUploadUrl).toHaveBeenCalledTimes(2);
  });

  it("reuses a matching app logo without creating another upload URL", async () => {
    const createUploadUrl = vi.fn(
      asyncFixture(({ key }: { key: string }) => ({
        key,
        uploadUrl: `https://uploads.example/${key}`,
      }))
    );

    const context = {
      organization: {
        createdAt: new Date(),
        id: organizationId,
        logo: null,
        metadata: null,
        name: "Analytical Engines",
        shortId: "team00000001",
        slug: "analytical-engines",
      },
      project: {
        createdAt: new Date(),
        id: projectId,
        name: "Compiler",
        organizationId,
        shortId: "proj00000001",
        slug: "compiler",
        updatedAt: new Date(),
      },
      storage: {
        createDownloadUrl: vi.fn(),
        createUploadUrl,
        delete: vi.fn(),
        head: vi.fn().mockResolvedValue({
          checksumSha256: logoChecksumBase64,
          contentLength: 262_144,
          contentType: "image/svg+xml",
        }),
        type: "s3",
      },
    } satisfies Context;

    const currentApp = await db.query.app.findFirst();

    if (!currentApp) {
      throw new Error("Test app was not created.");
    }

    const result = await call(
      deploymentRouter.create,
      {
        body: {
          app: { id: currentApp.id },
          assets: [
            {
              checksum: "a".repeat(64),
              contentLength: 1,
              contentType: "application/javascript",
              encoding: "utf-8",
              objectKey: "client.js",
            },
          ],
          logos: { dark: "logo.svg" },
          scope: productionScope,
          staticAssets: [
            {
              checksum: logoChecksum,
              contentLength: 262_144,
              path: "logo.svg",
            },
          ],
        },
      },
      { context }
    );

    expect(result.body.staticAssets?.[0]?.uploadUrl).toBeUndefined();
    expect(createUploadUrl).toHaveBeenCalledTimes(1);
    expect(context.storage.head).toHaveBeenCalledWith({
      key: `projects/proj00000001/apps/app000000001/assets/${logoChecksum}/logo.svg`,
    });
  });

  it("rejects the client assets array when it exceeds 10 MiB", async () => {
    const createUploadUrl = vi.fn();

    const context = {
      organization: {
        createdAt: new Date(),
        id: organizationId,
        logo: null,
        metadata: null,
        name: "Analytical Engines",
        shortId: "team00000001",
        slug: "analytical-engines",
      },
      project: {
        createdAt: new Date(),
        id: projectId,
        name: "Compiler",
        organizationId,
        shortId: "proj00000001",
        slug: "compiler",
        updatedAt: new Date(),
      },
      storage: {
        createDownloadUrl: vi.fn(),
        createUploadUrl,
        delete: vi.fn(),
        head: vi.fn(),
        type: "s3",
      },
    } satisfies Context;

    const app = await db.query.app.findFirst();

    if (!app) {
      throw new Error("Test app was not created.");
    }

    await expect(
      call(
        deploymentRouter.create,
        {
          body: {
            app: { id: app.id },
            assets: [
              {
                checksum: "a".repeat(64),
                contentLength: maxDeploymentBytes + 1,
                contentType: "application/javascript",
                encoding: "utf-8",
                objectKey: "client.js",
              },
            ],
            scope: productionScope,
          },
        },
        { context }
      )
    ).rejects.toThrow("Input validation failed");
    expect(createUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS logo inspection URLs before fetching", async () => {
    const deployment = await createLogoDeployment();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      call(
        deploymentRouter.publish,
        {
          body: { rollout: true, scope: productionScope },
          params: { deploymentId: deployment.id },
        },
        { context: publishContext("http://uploads.example/logo-dark.svg") }
      )
    ).rejects.toThrow("Logo download URL must use HTTPS.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts logo inspection while reading the response body", async () => {
    const deployment = await createLogoDeployment();
    vi.useFakeTimers();
    const inspectionStarted = Promise.withResolvers<boolean>();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        asyncFixture(
          (_url: URL, init?: RequestInit) =>
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  inspectionStarted.resolve(true);
                  init?.signal?.addEventListener("abort", () => {
                    controller.error(new DOMException("Aborted", "AbortError"));
                  });
                },
              })
            )
        )
      )
    );

    const publish = call(
      deploymentRouter.publish,
      {
        body: { rollout: true, scope: productionScope },
        params: { deploymentId: deployment.id },
      },
      { context: publishContext("https://uploads.example/logo-dark.svg") }
    );

    await inspectionStarted.promise;
    const advanceTimers = vi.advanceTimersByTimeAsync(10_000);
    await expect(publish).rejects.toThrow("Logo inspection timed out.");
    await advanceTimers;
  });
});
