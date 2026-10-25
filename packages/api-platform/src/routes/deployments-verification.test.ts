import { setImmediate } from "node:timers/promises";
import { gzipSync } from "node:zlib";

import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { call } from "@orpc/server";
import { maxDeploymentBytes } from "@patchsmith/asset-delivery";
import { asyncFixture } from "@patchsmith/config/testing";
import { relations } from "@patchsmith/db/relations";
import {
  app as appTable,
  appDeployment,
  appDeploymentFile,
} from "@patchsmith/db/schema/apps";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Context } from "#context";
import { verifyAndPublishDeploymentEffect } from "#deployments/verification";
import { verificationUnavailableMessage } from "#routes/deployment-effects";
import { deploymentRouter } from "#routes/deployments";
import { canonicalizeScope } from "#scope";
import { runPlatform } from "#services";
import {
  deploymentTestFixture,
  requireValue,
  describeFile,
  projectId,
  logoChecksum,
  logoChecksumBase64,
  productionScope,
} from "#test/deployments";
import { testServices } from "#test/services";

describe("platform deployments-verification", () => {
  const fixture = deploymentTestFixture();

  const {
    createLogoDeployment,
    createGzipClientDeployment,
    http,
    publishContext,
  } = fixture;

  it.each([
    { encoding: "gzip", extraBytes: 0 },
    { encoding: "gzip", extraBytes: 1 },
    { encoding: "utf-8", extraBytes: 0 },
    { encoding: "utf-8", extraBytes: 1 },
  ] as const)(
    "checks the decoded client, $encoding server, and both logos together ($extraBytes bytes over)",
    async ({ encoding, extraBytes }) => {
      const currentApp = requireValue(await fixture.db.query.app.findFirst());
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

      const files = await fixture.db.query.appDeploymentFile.findMany({
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

      const fetchMock = http.mockImplementation(
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
          await fixture.db.query.appDeployment.findFirst({
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
      const currentApp = await fixture.db.query.app.findFirst();

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

      const fetchMock = http.mockImplementation(
        asyncFixture(() => new Response("client-code"))
      );

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

      const files = await fixture.db.query.appDeploymentFile.findMany({
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
      const source = requireValue(await fixture.db.query.app.findFirst());

      const [previous, deployment] = await fixture.db
        .insert(appDeployment)
        .values([
          { appId: source.id, status: "published" },
          { appId: source.id, status: "uploading" },
        ])
        .returning();

      if (!previous || !deployment) {
        throw new Error("Expected rollout deployments");
      }

      await fixture.db
        .update(appTable)
        .set({ currentDeploymentId: previous.id })
        .where(eq(appTable.id, source.id));

      const [installation] = await fixture.db
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

      await fixture.db.insert(appDeploymentFile).values({
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
        await fixture.db.query.app.findFirst({ where: { id: source.id } })
      ).toMatchObject({ currentDeploymentId: expected });
      expect(
        await fixture.db.query.app.findFirst({ where: { id: installation.id } })
      ).toMatchObject({ currentDeploymentId: expected });
    }
  );

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

    const fetchMock = http.mockResolvedValue(
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

    const deployment = await fixture.db.query.appDeployment.findFirst({
      where: { id: created.body.deployment.id },
    });

    const file = await fixture.db.query.appDeploymentFile.findFirst({
      where: { appDeploymentId: created.body.deployment.id },
    });

    const currentApp = await fixture.db.query.app.findFirst();
    expect(deployment?.status).toBe("uploading");
    expect(file?.status).toBe("failed");
    expect(currentApp?.currentDeploymentId).toBeNull();
  });

  it("publishes gzip client code whose decoded size is exactly 10 MiB", async () => {
    const decoded = new Uint8Array(maxDeploymentBytes);
    const { context, created } = await createGzipClientDeployment(decoded);
    http.mockResolvedValue(
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

    const file = await fixture.db.query.appDeploymentFile.findFirst({
      where: { appDeploymentId: created.body.deployment.id },
    });

    expect(file?.status).toBe("verified");
    const currentApp = await fixture.db.query.app.findFirst();
    expect(currentApp?.currentDeploymentId).toBe(published.body.id);
  });

  it.each([
    "stream-error",
    "missing-body",
    "upstream-failure",
    "invalid-gzip",
    "truncated-gzip",
    "empty-bundle",
  ])("rejects gzip client inspection with %s", async (failure) => {
    const { context, created } = await createGzipClientDeployment(
      new TextEncoder().encode("client-code")
    );

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        if (failure === "empty-bundle") {
          controller.close();

          return;
        }

        const cause = Object.assign(
          new Error("incorrect gzip header or length"),
          {
            code: failure === "invalid-gzip" ? "Z_DATA_ERROR" : "Z_BUF_ERROR",
          }
        );

        controller.error(
          failure === "stream-error"
            ? new Error("Network interrupted")
            : new TypeError("terminated", { cause })
        );
      },
    });

    const response =
      failure === "stream-error" ||
      failure === "invalid-gzip" ||
      failure === "truncated-gzip" ||
      failure === "empty-bundle"
        ? new Response(body)
        : new Response(null, {
            status: failure === "upstream-failure" ? 503 : 200,
          });

    http.mockResolvedValue(response);
    await expect(
      call(
        deploymentRouter.publish,
        {
          body: { rollout: true, scope: productionScope },
          params: { deploymentId: created.body.deployment.id },
        },
        { context }
      )
    ).rejects.toMatchObject({
      code:
        failure === "invalid-gzip" ||
        failure === "truncated-gzip" ||
        failure === "empty-bundle"
          ? "BAD_REQUEST"
          : "SERVICE_UNAVAILABLE",
    });

    const file = await fixture.db.query.appDeploymentFile.findFirst({
      where: { appDeploymentId: created.body.deployment.id },
    });

    expect(file?.status).toBe("failed");
  });

  it("keeps a timed-out bundle failed when a late download succeeds", async () => {
    const { context, created } = await createGzipClientDeployment(
      new TextEncoder().encode("client-code")
    );

    vi.useFakeTimers();
    const started = Promise.withResolvers<boolean>();
    const release = Promise.withResolvers<Response>();
    const cancel = vi.fn();
    http.mockImplementation(async () => {
      started.resolve(true);

      return await release.promise;
    });

    const publishing = call(
      deploymentRouter.publish,
      {
        body: { rollout: true, scope: productionScope },
        params: { deploymentId: created.body.deployment.id },
      },
      { context }
    );

    await started.promise;

    const rejected = expect(publishing).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: verificationUnavailableMessage,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    release.resolve(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await setImmediate();
    expect(cancel).toHaveBeenCalledOnce();
    expect(await fixture.db.query.appDeployment.findFirst()).toMatchObject({
      status: "uploading",
    });
    expect(await fixture.db.query.appDeploymentFile.findFirst()).toMatchObject({
      status: "failed",
    });
    expect(await fixture.db.query.app.findFirst()).toMatchObject({
      currentDeploymentId: null,
    });
  });

  it.each(["head", "signing", "fetch"])(
    "cleans up cancelled bundle %s operations and ignores their late results",
    async (phase) => {
      const { context, created } = await createGzipClientDeployment(
        new TextEncoder().encode("client-code")
      );

      const started = Promise.withResolvers<boolean>();
      const release = Promise.withResolvers<boolean>();
      const { head } = context.storage;
      const sign = context.storage.createDownloadUrl;

      if (phase === "head") {
        context.storage.head = async (input) => {
          started.resolve(true);
          await release.promise;

          return await head(input);
        };
      }

      if (phase === "signing") {
        context.storage.createDownloadUrl = async (input) => {
          started.resolve(true);
          await release.promise;

          return await sign(input);
        };
      }

      const cancel = vi.fn();

      const fetchAsset = http.mockImplementation(async () => {
        if (phase === "fetch") {
          started.resolve(true);
          await release.promise;
        }

        return new Response(new ReadableStream<Uint8Array>({ cancel }));
      });

      const controller = new AbortController();

      const input = {
        body: { rollout: true, scope: productionScope },
        params: { deploymentId: created.body.deployment.id },
      };

      const publishing = call(deploymentRouter.publish, input, {
        context,
        signal: controller.signal,
      });

      await started.promise;
      const abortError = new Error("Publish cancelled");
      const rejected = expect(publishing).rejects.toBe(abortError);
      controller.abort(abortError);
      await rejected;
      release.resolve(true);
      await setImmediate();

      expect(
        await fixture.db.query.appDeployment.findFirst({
          where: { id: created.body.deployment.id },
        })
      ).toMatchObject({ status: "uploading" });
      expect(
        await fixture.db.query.appDeploymentFile.findFirst({
          where: { appDeploymentId: created.body.deployment.id },
        })
      ).toMatchObject({ status: "failed" });
      expect(await fixture.db.query.app.findFirst()).toMatchObject({
        currentDeploymentId: null,
      });

      if (phase === "fetch") {
        expect(cancel).toHaveBeenCalledOnce();
      } else {
        expect(fetchAsset).not.toHaveBeenCalled();
      }

      context.storage.head = head;
      context.storage.createDownloadUrl = sign;
      fetchAsset.mockResolvedValue(new Response("client-code"));
      await expect(
        call(deploymentRouter.publish, input, { context })
      ).resolves.toMatchObject({ body: { status: "published" } });
    }
  );

  it.each(["bundle-head", "asset-head", "signing", "fetch", "body"])(
    "returns a sanitized HTTP error for %s failures and allows publication retry",
    async (phase) => {
      const deployment = await createLogoDeployment();

      const context = publishContext(
        "https://storage.test/private?credential=secret"
      );

      const { head } = context.storage;
      const sign = context.storage.createDownloadUrl;
      const cause = new Error("storage bucket private: credential=secret");
      context.storage.head = async (input) => {
        if (
          (phase === "bundle-head" && input.key.endsWith("client.js")) ||
          (phase === "asset-head" && input.key.endsWith("logo.svg"))
        ) {
          throw cause;
        }

        return await head(input);
      };

      if (phase === "signing") {
        context.storage.createDownloadUrl = asyncFixture(() => {
          throw cause;
        });
      }

      const fetchAsset = http.mockImplementation(
        asyncFixture(() => {
          if (phase === "fetch") {
            throw cause;
          }

          return new Response(
            new ReadableStream<Uint8Array>({
              start(stream) {
                stream.error(cause);
              },
            })
          );
        })
      );

      const handler = new OpenAPIHandler({ deployments: deploymentRouter });

      const result = await handler.handle(
        new Request(`https://platform.test/deployments/${deployment.id}`, {
          body: JSON.stringify({ rollout: true, scope: productionScope }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        { context }
      );

      const response = requireValue(result.response);
      expect(response.status).toBe(503);
      const responseBody: unknown = await response.json();
      expect(responseBody).toEqual({
        code: "SERVICE_UNAVAILABLE",
        defined: true,
        message: verificationUnavailableMessage,
      });
      expect(
        await fixture.db.query.appDeployment.findFirst({
          where: { id: deployment.id },
        })
      ).toMatchObject({ status: "uploading" });
      expect(await fixture.db.query.appAsset.findFirst()).toMatchObject({
        status: "uploading",
      });
      expect(await fixture.db.query.app.findFirst()).toMatchObject({
        currentDeploymentId: null,
      });

      context.storage.head = head;
      context.storage.createDownloadUrl = sign;
      fetchAsset.mockResolvedValue(new Response("<svg></svg>"));
      await expect(
        call(
          deploymentRouter.publish,
          {
            body: { rollout: true, scope: productionScope },
            params: { deploymentId: deployment.id },
          },
          { context }
        )
      ).resolves.toMatchObject({ body: { status: "published" } });
    }
  );

  it.each([
    { message: "content length", metadata: { contentLength: 12 } },
    { message: "content type", metadata: { contentType: "text/plain" } },
    { message: "content encoding", metadata: { contentEncoding: "gzip" } },
    { message: "checksum", metadata: { checksumSha256: "different" } },
  ])(
    "returns an actionable validation error for mismatched $message",
    async ({ metadata, message }) => {
      const expectedMessage: unknown = expect.stringContaining(message);
      const deployment = await createLogoDeployment();
      const context = publishContext("https://storage.test/logo.svg");
      const { head } = context.storage;
      context.storage.head = async (input) => ({
        ...(await head(input)),
        ...metadata,
      });
      await expect(
        call(
          deploymentRouter.publish,
          {
            body: { rollout: false, scope: productionScope },
            params: { deploymentId: deployment.id },
          },
          { context }
        )
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expectedMessage,
      });
      expect(await fixture.db.query.appDeployment.findFirst()).toMatchObject({
        status: "uploading",
      });
      expect(
        await fixture.db.query.appDeploymentFile.findFirst()
      ).toMatchObject({
        status: "failed",
      });
    }
  );

  it("keeps unsafe logo content a validation error with its internal cause", async () => {
    const deployment = await createLogoDeployment();
    const context = publishContext("https://storage.test/logo.svg");
    http.mockResolvedValue(new Response("<svg><script></script></svg>"));
    const expectedCause: unknown = expect.any(Error);
    await expect(
      call(
        deploymentRouter.publish,
        {
          body: { rollout: false, scope: productionScope },
          params: { deploymentId: deployment.id },
        },
        { context }
      )
    ).rejects.toMatchObject({
      cause: expectedCause,
      code: "BAD_REQUEST",
      message: "SVG logos cannot contain scripts or external resources.",
    });
    expect(await fixture.db.query.appAsset.findFirst()).toMatchObject({
      status: "uploading",
    });
  });

  it("rejects non-HTTPS logo inspection URLs before fetching", async () => {
    const deployment = await createLogoDeployment();
    const fetchMock = vi.fn();
    http.mockImplementation(fetchMock);

    await expect(
      call(
        deploymentRouter.publish,
        {
          body: { rollout: true, scope: productionScope },
          params: { deploymentId: deployment.id },
        },
        { context: publishContext("http://uploads.example/logo-dark.svg") }
      )
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: verificationUnavailableMessage,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts logo inspection while reading the response body", async () => {
    const deployment = await createLogoDeployment();
    vi.useFakeTimers();
    const inspectionStarted = Promise.withResolvers<boolean>();
    http.mockImplementation(
      vi.fn(
        asyncFixture(
          (_url: Parameters<typeof fetch>[0], init?: RequestInit) =>
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
    await expect(publish).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: verificationUnavailableMessage,
    });
    await advanceTimers;
  });

  it("restores retryable state on cancellation and ignores late storage completion", async () => {
    const deployment = await createLogoDeployment();
    const waiting = Promise.withResolvers<boolean>();

    const released =
      Promise.withResolvers<Awaited<ReturnType<Context["storage"]["head"]>>>();

    const context = publishContext("https://uploads.example/logo.svg");
    context.storage.head = vi.fn(async () => {
      waiting.resolve(true);

      return await released.promise;
    });
    const controller = new AbortController();

    const publication = call(
      deploymentRouter.publish,
      {
        body: { rollout: true, scope: productionScope },
        params: { deploymentId: deployment.id },
      },
      { context, signal: controller.signal }
    );

    const completed = expect(publication).rejects.toBeDefined();
    await waiting.promise;
    controller.abort(new Error("Request cancelled"));
    await completed;

    const failed = await fixture.db.query.appDeploymentFile.findFirst({
      where: { appDeploymentId: deployment.id, status: "failed" },
    });

    if (!failed) {
      throw new Error("Missing failed verification record");
    }

    const persisted = await fixture.db.query.appDeployment.findFirst({
      where: { id: deployment.id },
    });

    expect(persisted?.status).toBe("uploading");
    released.resolve({
      checksumSha256: logoChecksumBase64,
      contentLength: 11,
      contentType: "image/svg+xml",
      key: "late-storage-completion",
    });
    // A database read queues behind any accidental write after the released storage promise.
    await fixture.db.query.appDeploymentFile.findMany();

    const afterCompletion = await fixture.db.query.appDeploymentFile.findFirst({
      where: { id: failed.id },
    });

    expect(afterCompletion?.status).toBe("failed");
  });

  it.each(["interrupt-after-deployment-status", "fail-between-files"])(
    "restores retryable state on %s outside file inspection",
    async (phase) => {
      const deployment = await createLogoDeployment();
      await fixture.db.insert(appDeploymentFile).values({
        appDeploymentId: deployment.id,
        checksum: logoChecksum,
        contentLength: 11,
        contentType: "application/javascript",
        encoding: null,
        objectKey: "second-client.js",
      });
      const controller = new AbortController();
      let startedFiles = 0;
      let triggered = false;

      const database = drizzle({
        client: fixture.db.$client,
        logger: {
          logQuery(query, params) {
            if (params[0] !== "verifying") {
              return;
            }

            if (
              phase === "interrupt-after-deployment-status" &&
              query.startsWith('update "app_deployment"')
            ) {
              triggered = true;
              controller.abort();
            }

            if (query.startsWith('update "app_deployment_file"')) {
              startedFiles += 1;

              if (phase === "fail-between-files" && startedFiles === 2) {
                triggered = true;
                throw new Error(
                  "Database write failed between file inspections"
                );
              }
            }
          },
        },
        relations,
      });

      const context = {
        ...publishContext("https://storage.test/logo.svg"),
        ...testServices({ database, fetch: http }),
      };

      await expect(
        runPlatform(
          verifyAndPublishDeploymentEffect(deployment, context.storage),
          context,
          controller.signal
        )
      ).rejects.toBeDefined();
      expect(triggered).toBe(true);
      expect(
        await fixture.db.query.appDeployment.findFirst({
          where: { id: deployment.id },
        })
      ).toMatchObject({ status: "uploading" });

      const files = await fixture.db.query.appDeploymentFile.findMany({
        where: { appDeploymentId: deployment.id },
      });

      expect(files.filter((file) => file.status === "verified")).toHaveLength(
        phase === "fail-between-files" ? 1 : 0
      );
      expect(files.some((file) => file.status === "failed")).toBe(false);
    }
  );
});
