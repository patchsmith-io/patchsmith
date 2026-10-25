import { call } from "@orpc/server";
import { maxDeploymentBytes } from "@patchsmith/asset-delivery";
import { asyncFixture } from "@patchsmith/config/testing";
import { app as appTable, appDeployment } from "@patchsmith/db/schema/apps";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Context } from "#context";
import {
  deploymentRouter,
  mapReturnedFilesByAssetPath,
} from "#routes/deployments";
import {
  deploymentTestFixture,
  requireValue,
  organizationId,
  projectId,
  logoChecksum,
  logoChecksumBase64,
  productionScope,
} from "#test/deployments";

describe("platform deployments-upload", () => {
  const fixture = deploymentTestFixture();
  const { createLogoDeployment, publishContext } = fixture;

  it.each([0, 1])(
    "checks the combined upload budget with %i bytes over the limit",
    async (extraBytes) => {
      const currentApp = requireValue(await fixture.db.query.app.findFirst());
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

  it("hides a deployment when its app has a malformed stored scope", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deployment = await createLogoDeployment();
    await fixture.db
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
    await fixture.db
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
      const currentApp = requireValue(await fixture.db.query.app.findFirst());
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
      expect(await fixture.db.select().from(appDeployment)).toHaveLength(0);
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
      ...fixture.services,
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

    const app = await fixture.db.query.app.findFirst();

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
      ...fixture.services,
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

    const currentApp = await fixture.db.query.app.findFirst();

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
      ...fixture.services,
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

    const app = await fixture.db.query.app.findFirst();

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
});
