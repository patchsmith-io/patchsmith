import { runPromise } from "@orpc/experimental-effect";
import {
  app,
  appDeployment,
  appDeploymentFile,
} from "@patchsmith/db/schema/apps";
import { organization } from "@patchsmith/db/schema/auth";
import { project } from "@patchsmith/db/schema/project";
import { eq } from "drizzle-orm";
import { Effect, Exit } from "effect";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import type { Context } from "#context";
import { publishDeployment } from "#deployments/verification";
import { canonicalizeScope } from "#scope";
import { PlatformHttp } from "#services";
import { createTestDb } from "#test/pglite";

const requireValue = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error("Expected a fixture row.");
  }

  return value;
};

const checksum = "a".repeat(64);

const objectMetadata = {
  checksumSha256: Buffer.from(checksum, "hex").toString("base64"),
  contentLength: 11,
  contentType: "application/javascript",
};

const fixture = async () => {
  const database = await createTestDb();
  const { db } = database;

  const [team] = await db
    .insert(organization)
    .values({
      createdAt: new Date(),
      id: "11111111-1111-4111-8111-111111111111",
      name: "Publication tests",
      shortId: "team00000001",
      slug: "publication-tests",
    })
    .returning();

  const [owner] = await db
    .insert(project)
    .values({
      name: "Publication tests",
      organizationId: requireValue(team).id,
      slug: "publication-tests",
    })
    .returning();

  const [source] = await db
    .insert(app)
    .values({
      name: "Inbox",
      projectId: requireValue(owner).id,
      ...canonicalizeScope({
        name: "environment",
        value: { environment: "production" },
      }),
    })
    .returning();

  const [previous, deployment] = await db
    .insert(appDeployment)
    .values([
      { appId: requireValue(source).id, status: "published" },
      { appId: requireValue(source).id, status: "uploading" },
    ])
    .returning();

  await db
    .update(app)
    .set({ currentDeploymentId: requireValue(previous).id })
    .where(eq(app.id, requireValue(source).id));

  const [installation] = await db
    .insert(app)
    .values({
      currentDeploymentId: requireValue(previous).id,
      name: "Installed Inbox",
      projectId: requireValue(owner).id,
      ...canonicalizeScope({
        name: "environment",
        value: { environment: "staging" },
      }),
    })
    .returning();

  await db.insert(appDeploymentFile).values(
    ["client", "server"].map((kind) => ({
      appDeploymentId: requireValue(deployment).id,
      checksum,
      contentLength: objectMetadata.contentLength,
      contentType: "application/javascript" as const,
      objectKey: `deployments/${requireValue(deployment).id}/${kind}/${kind}.js`,
    }))
  );

  const head = vi.fn<Context["storage"]["head"]>(
    async ({ key }) => await Promise.resolve({ ...objectMetadata, key })
  );

  const storage: Context["storage"] = {
    createDownloadUrl: vi.fn(),
    createUploadUrl: vi.fn(),
    delete: vi.fn(),
    head,
    type: "s3",
  };

  const enqueue = vi.fn(async () => {
    await Promise.resolve();
  });

  const context = {
    app: requireValue(source),
    deployment: requireValue(deployment),
    project: requireValue(owner),
    storage,
  };

  const publish = (rollout = true) =>
    publishDeployment(db, context, rollout, enqueue).pipe(
      Effect.provideService(PlatformHttp, { fetch: globalThis.fetch })
    );

  const storedDeployment = async () =>
    await db.query.appDeployment.findFirst({
      where: { id: context.deployment.id },
    });

  const files = async () =>
    await db.query.appDeploymentFile.findMany({
      where: { appDeploymentId: context.deployment.id },
    });

  return {
    ...database,
    context,
    enqueue,
    files,
    head,
    installation: requireValue(installation),
    previous: requireValue(previous),
    publish,
    storedDeployment,
  };
};

describe("deployment publication ownership", () => {
  let state: Awaited<ReturnType<typeof fixture>>;

  beforeEach(async () => {
    state = await fixture();
  });
  afterEach(async () => {
    await state.client.close();
  });

  it.each(["failure", "cancellation"] as const)(
    "releases a claim after %s and fences late storage responses from a successful retry",
    async (outcome) => {
      const started = Promise.withResolvers<boolean>();

      const response =
        Promise.withResolvers<
          Awaited<ReturnType<Context["storage"]["head"]>>
        >();

      const controller = new AbortController();
      state.head.mockImplementationOnce(async () => {
        started.resolve(true);

        return await response.promise;
      });

      const first = Effect.runPromiseExit(state.publish(), {
        signal: controller.signal,
      });

      await started.promise;

      // Without ownership the contender publishes while the first storage request is pending.
      const contender = await Effect.runPromiseExit(state.publish());

      if (outcome === "failure") {
        response.reject(new Error("Controlled storage failure"));
      } else {
        controller.abort();
      }

      expect(Exit.isFailure(await first)).toBe(true);
      expect(await state.storedDeployment()).toMatchObject({
        status: "uploading",
      });
      const unfinishedFiles = await state.files();
      expect(unfinishedFiles.some((file) => file.status === "verifying")).toBe(
        false
      );
      expect(state.head).toHaveBeenCalledOnce();
      expect(state.enqueue).not.toHaveBeenCalled();
      expect(contender).toMatchObject({ _tag: "Failure" });

      // Assert the error at the Effect boundary, without replacing the production verifier.
      if (Exit.isFailure(contender)) {
        await expect(
          runPromise(Effect.failCause(contender.cause))
        ).rejects.toMatchObject({ code: "CONFLICT" });
      }

      await expect(runPromise(state.publish())).resolves.toMatchObject({
        status: "published",
      });
      // An interrupted storage promise can settle after the replacement has finished.
      response.reject(new Error("Storage failed after retry published"));
      await response.promise.catch(() => null);
      expect(await state.storedDeployment()).toMatchObject({
        status: "published",
      });
      const verifiedFiles = await state.files();
      expect(verifiedFiles.every((file) => file.status === "verified")).toBe(
        true
      );
      expect(state.enqueue).toHaveBeenCalledOnce();
    }
  );

  it("rejects an overlapping attempt while the owner succeeds without duplicating publication", async () => {
    const started = Promise.withResolvers<boolean>();
    const response = Promise.withResolvers<boolean>();
    state.head.mockImplementationOnce(async ({ key }) => {
      started.resolve(true);
      await response.promise;

      return { ...objectMetadata, key };
    });
    const owner = Effect.runPromiseExit(state.publish());
    await started.promise;
    const contender = await Effect.runPromiseExit(state.publish());
    response.resolve(true);
    expect(await owner).toMatchObject({
      _tag: "Success",
      value: { status: "published" },
    });
    expect(contender).toMatchObject({ _tag: "Failure" });
    expect(state.head).toHaveBeenCalledTimes(2);
    expect(state.enqueue).toHaveBeenCalledOnce();
    expect(await state.storedDeployment()).toMatchObject({
      status: "published",
    });
    const verifiedFiles = await state.files();
    expect(verifiedFiles.every((file) => file.status === "verified")).toBe(
      true
    );
  });

  it("finishes publication side effects when cancellation arrives after commit", async () => {
    const enqueueStarted = Promise.withResolvers<boolean>();
    const enqueueFinished = Promise.withResolvers<boolean>();
    let completed = false;
    state.enqueue.mockImplementationOnce(async () => {
      enqueueStarted.resolve(true);
      await enqueueFinished.promise;
      completed = true;
    });
    const controller = new AbortController();

    const owner = Effect.runPromiseExit(state.publish(), {
      signal: controller.signal,
    });

    await enqueueStarted.promise;
    controller.abort();

    await expect(runPromise(state.publish())).resolves.toMatchObject({
      status: "published",
    });
    expect(completed).toBe(false);
    enqueueFinished.resolve(true);
    await owner;
    expect(completed).toBe(true);
    expect(state.enqueue).toHaveBeenCalledOnce();
    expect(await state.storedDeployment()).toMatchObject({
      status: "published",
    });
    const apps = await state.db.query.app.findMany();

    for (const selectedApp of apps) {
      expect(selectedApp.currentDeploymentId).toBe(state.context.deployment.id);
    }
  });

  it("rolls back publication and selection together when rollout fails, then permits retry", async () => {
    await state.client.exec(`
      CREATE FUNCTION fail_rollout() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Controlled rollout failure';
      END;
      $$;
      CREATE TRIGGER fail_rollout BEFORE UPDATE ON app
      FOR EACH ROW EXECUTE FUNCTION fail_rollout();
    `);
    await expect(runPromise(state.publish())).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(await state.storedDeployment()).toMatchObject({
      status: "uploading",
    });
    expect(state.enqueue).not.toHaveBeenCalled();
    const apps = await state.db.query.app.findMany();

    for (const selectedApp of apps) {
      expect(selectedApp.currentDeploymentId).toBe(state.previous.id);
    }

    await state.client.exec("DROP TRIGGER fail_rollout ON app");
    await expect(runPromise(state.publish())).resolves.toMatchObject({
      status: "published",
    });
    expect(state.enqueue).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "makes the first successful rollout choice final (%s)",
    async (rollout) => {
      const published = await runPromise(state.publish(rollout));
      expect(published.status).toBe("published");
      const expected = rollout ? published.id : state.previous.id;
      const selectedApps = await state.db.query.app.findMany();
      expect(selectedApps).toHaveLength(2);

      for (const selectedApp of selectedApps) {
        expect(selectedApp.currentDeploymentId).toBe(expected);
      }

      // A repeated request must preserve subsequent selection changes.
      await state.db
        .update(app)
        .set({ currentDeploymentId: state.previous.id });
      const repeated = await runPromise(state.publish(!rollout));
      expect(repeated).toEqual(published);
      expect(state.head).toHaveBeenCalledTimes(2);
      expect(state.enqueue).toHaveBeenCalledTimes(rollout ? 1 : 0);
      const repeatedApps = await state.db.query.app.findMany();

      for (const selectedApp of repeatedApps) {
        expect(selectedApp.currentDeploymentId).toBe(state.previous.id);
      }
    }
  );
});
