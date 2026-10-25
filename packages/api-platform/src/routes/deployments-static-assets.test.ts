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
} from "@patchsmith/db/schema/apps";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { deploymentRouter } from "#routes/deployments";
import { prepareStaticAssets, staticAssetsInput } from "#routes/static-assets";
import { canonicalizeScope } from "#scope";
import {
  deploymentTestFixture,
  requireValue,
  projectId,
  logoChecksum,
  logoChecksumBase64,
  productionScope,
} from "#test/deployments";

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

describe("platform deployments-static-assets", () => {
  const fixture = deploymentTestFixture();
  const { createLogoDeployment, http, publishContext } = fixture;

  it.each([false, true])(
    "bounds storage preparation and stops on failures (%s)",
    async (fail) => {
      const context = publishContext("https://storage.test/logo");
      const currentApp = requireValue(await fixture.db.query.app.findFirst());
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
    const currentApp = requireValue(await fixture.db.query.app.findFirst());
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
    expect(await fixture.db.select().from(appDeploymentAsset)).toHaveLength(9);
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
    const verifiedAssets = await fixture.db.select().from(appAsset);
    expect(verifiedAssets.every((asset) => asset.status === "verified")).toBe(
      true
    );
    await fixture.db.update(appAsset).set({ contentLength: 2 });
    context.storage.head = vi.fn().mockRejectedValue({ name: "NoSuchKey" });
    await expect(create()).rejects.toThrow("Asset metadata conflicts");
    expect(await fixture.db.select().from(appDeployment)).toHaveLength(1);
    expect(await fixture.db.select().from(appDeploymentAsset)).toHaveLength(9);
  });

  it.each([
    { extraBytes: 0, reuse: false },
    { extraBytes: 1, reuse: false },
    { extraBytes: 0, reuse: true },
    { extraBytes: 1, reuse: true },
  ])(
    "counts static assets with bundles and logos at creation ($extraBytes bytes over, reused=$reuse)",
    async ({ extraBytes, reuse }) => {
      const currentApp = requireValue(await fixture.db.query.app.findFirst());
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
        await fixture.db.insert(appAsset).values({
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
      const currentApp = requireValue(await fixture.db.query.app.findFirst());
      const context = publishContext("https://uploads.example/bundle");
      const staticBytes = 3 * 1024 * 1024;
      const checksum = "a".repeat(64);
      const objectKey = `projects/${context.project.shortId}/apps/${currentApp.shortId}/assets/${checksum}/doom.wad`;
      await fixture.db.insert(appAsset).values({
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
      http.mockResolvedValue(new Response(decoded));

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

    const [asset] = await fixture.db
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

    await fixture.db.insert(appDeploymentAsset).values({
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

  it("rejects cross-app asset links and ownership changes in the database", async () => {
    const deployment = await createLogoDeployment();

    const [otherApp] = await fixture.db
      .insert(appTable)
      .values({
        name: "Other app",
        projectId,
        shortId: "app000000002",
        ...canonicalizeScope(productionScope),
      })
      .returning();

    const otherAppId = requireValue(otherApp).id;

    const [otherDeployment] = await fixture.db
      .insert(appDeployment)
      .values({ appId: otherAppId, shortId: "dep000000002" })
      .returning();

    const [asset] = await fixture.db
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
      fixture.db.insert(appDeploymentAsset).values({
        appAssetId,
        appDeploymentId: requireValue(otherDeployment).id,
        appId: deployment.appId,
      })
    ).rejects.toMatchObject(foreignKeyViolation);
    await expect(
      fixture.db.insert(appDeploymentAsset).values({
        appAssetId,
        appDeploymentId: requireValue(otherDeployment).id,
        appId: otherAppId,
      })
    ).rejects.toMatchObject(foreignKeyViolation);
    expect(
      await fixture.db
        .select()
        .from(appDeploymentAsset)
        .where(eq(appDeploymentAsset.appAssetId, appAssetId))
    ).toHaveLength(0);

    await fixture.db.insert(appDeploymentAsset).values({
      appAssetId,
      appDeploymentId: deployment.id,
      appId: deployment.appId,
    });
    await expect(
      fixture.db.update(appDeploymentAsset).set({ appId: otherAppId })
    ).rejects.toMatchObject(foreignKeyViolation);
    await expect(
      fixture.db
        .update(appAsset)
        .set({ appId: otherAppId })
        .where(eq(appAsset.id, appAssetId))
    ).rejects.toMatchObject(foreignKeyViolation);
    await expect(
      fixture.db
        .update(appDeployment)
        .set({ appId: otherAppId })
        .where(eq(appDeployment.id, deployment.id))
    ).rejects.toMatchObject(foreignKeyViolation);
  });

  it("reuses hashed files between deployments, lists their references, and preserves shared files on deletion", async () => {
    const context = publishContext("https://private.example/file");
    const currentApp = requireValue(await fixture.db.query.app.findFirst());
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
    expect(await fixture.db.select().from(appAsset)).toHaveLength(1);
    expect(await fixture.db.select().from(appDeploymentAsset)).toHaveLength(2);

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
      fixture.db.delete(appAsset).where(eq(appAsset.id, firstAsset.file.id))
    ).rejects.toThrow();
    await fixture.db
      .delete(appDeployment)
      .where(eq(appDeployment.id, first.body.deployment.id));
    expect(await fixture.db.select().from(appAsset)).toHaveLength(1);
    expect(await fixture.db.select().from(appDeploymentAsset)).toHaveLength(1);
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

    const verified = await fixture.db.query.appAsset.findFirst({
      where: { id: firstAsset.file.id },
    });

    expect(verified?.status).toBe("verified");
  });
});
