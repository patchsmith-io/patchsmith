import { call } from "@orpc/server";
import { app, appDeployment } from "@patchsmith/db/schema/apps";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  appTestFixture,
  productionScope,
  stagingScope,
  otherProjectId,
} from "#test/apps";

import { appRouter } from "./apps";

describe("app slug namespaces", () => {
  const fixture = appTestFixture();

  beforeEach(async () => {
    // Exercise the final namespace rules before the separate contraction PR ships.
    // Other suites retain the legacy index to cover the backend rollout stage.
    await fixture.client.exec(
      "DROP INDEX IF EXISTS app_project_id_slug_unique"
    );
  });

  const create = async (scope = productionScope, isShared = false) => {
    const { body } = await call(
      appRouter.create,
      {
        body: {
          description: null,
          isShared,
          name: "Stripe",
          scope,
          slug: "stripe",
        },
      },
      { context: fixture.createContext() }
    );

    return body;
  };

  it("allows a shared slug and independent local slugs while rejecting concurrent duplicates within each namespace", async () => {
    const local = await create();
    const otherLocal = await create(stagingScope);
    const shared = await create(productionScope, true);

    expect(new Set([local.id, otherLocal.id, shared.id]).size).toBe(3);
    expect(local).toMatchObject({ isShared: false, slug: "stripe" });
    expect(shared).toMatchObject({ isShared: true, slug: "stripe" });

    await expect(create(stagingScope, true)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(create()).rejects.toMatchObject({ code: "CONFLICT" });

    const context = fixture.createContext();

    const outcomes = await Promise.allSettled(
      [1, 2].map(
        async () =>
          await call(
            appRouter.create,
            {
              body: {
                description: null,
                name: "Inbox",
                scope: stagingScope,
                slug: "inbox",
              },
            },
            { context }
          )
      )
    );

    expect(
      outcomes.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      outcomes.find((result) => result.status === "rejected")
    ).toMatchObject({ reason: { code: "CONFLICT" } });
  });

  it("resolves bare names only in the shared namespace and requires unambiguous authorized scopes for local names", async () => {
    const local = await create();
    const context = fixture.createContext();

    const lookup = async (isShared?: boolean, scopes = [productionScope]) =>
      await call(
        appRouter.get,
        { body: { app: { isShared, slug: "stripe" }, scopes } },
        { context }
      );

    await expect(lookup()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(lookup(false)).resolves.toMatchObject({
      body: { id: local.id },
    });
    await expect(lookup(false, [stagingScope])).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const shared = await create(productionScope, true);
    const otherLocal = await create(stagingScope);
    await expect(lookup()).resolves.toMatchObject({ body: { id: shared.id } });
    await expect(lookup(true, [stagingScope])).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(lookup(false, [stagingScope])).resolves.toMatchObject({
      body: { id: otherLocal.id },
    });
    await expect(
      lookup(false, [productionScope, stagingScope])
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(lookup(false, [])).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    await expect(
      call(
        appRouter.get,
        {
          body: {
            app: { id: local.id },
            scopes: [productionScope, stagingScope],
          },
        },
        { context }
      )
    ).resolves.toMatchObject({ body: { id: local.id } });

    await expect(
      call(
        appRouter.get,
        {
          body: {
            app: { isShared: false, slug: "stripe" },
            scopes: [productionScope],
          },
        },
        {
          context: fixture.createContext({
            project: { ...context.project, id: otherProjectId },
          }),
        }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("requires an explicit source scope for local slug installs and keeps the source name local in the destination", async () => {
    const source = await create();
    const context = fixture.createContext();

    const [deployment] = await fixture.db
      .insert(appDeployment)
      .values({
        appId: source.id,
        status: "published",
      })
      .returning();

    if (!deployment) {
      throw new Error("Missing deployment");
    }

    await fixture.db
      .update(app)
      .set({ currentDeploymentId: deployment.id })
      .where(eq(app.id, source.id));

    const input = {
      app: { isShared: false, slug: source.slug },
      scope: stagingScope,
    };

    await expect(
      call(appRouter.install, { body: input }, { context })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(
        appRouter.install,
        { body: { ...input, sourceScope: stagingScope } },
        { context }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const installed = await call(
      appRouter.install,
      {
        body: { ...input, sourceScope: productionScope },
      },
      { context }
    );

    expect(installed.body).toMatchObject({
      isShared: false,
      scope: stagingScope,
      slug: "stripe",
    });
    expect(installed.body.id).not.toBe(source.id);

    await expect(
      call(
        appRouter.install,
        {
          body: { ...input, sourceScope: productionScope },
        },
        { context }
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("can reclassify existing names while enforcing namespace collisions atomically", async () => {
    const shared = await create(productionScope, true);
    const local = await create();
    const context = fixture.createContext();

    const reclassify = async (id: string, isShared: boolean) =>
      await call(
        appRouter.update,
        {
          body: {
            app: { id },
            description: null,
            isShared,
            name: "Stripe",
            scope: productionScope,
          },
        },
        { context }
      );

    await expect(reclassify(local.id, true)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(reclassify(shared.id, false)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await call(
      appRouter.delete,
      { body: { app: { id: local.id }, scope: productionScope } },
      { context }
    );
    await expect(reclassify(shared.id, false)).resolves.toMatchObject({
      body: { id: shared.id, isShared: false },
    });
    await expect(create(stagingScope, true)).resolves.toMatchObject({
      isShared: true,
      slug: "stripe",
    });
  });
});
