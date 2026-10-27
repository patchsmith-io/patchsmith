import { handlerGen } from "@orpc/experimental-effect";
import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { App, app } from "@patchsmith/db/schema/apps";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

import { AppWithCurrentDeployment, discoverAppsEffect } from "#app-discovery";
import { appSelectorSchema, appSelectorWhere } from "#app-selector";
import { withAppAssetUrl } from "#asset-url";
import type { Context } from "#context";
import { paginatedOutput, paginationQuery } from "#pagination";
import {
  o,
  cliRouter,
  protectedRouter,
  requireApp,
  requireAppInScopes,
} from "#procedures";
import { canonicalizeScope, scopeSchema, scopesSchema } from "#scope";
import {
  attempt,
  PlatformDatabase,
  PlatformIds,
  PlatformRuntime,
  runPlatform,
} from "#services";

import {
  publishRuntimeMetadataEffect,
  runtimeSession,
  runtimeResolve,
} from "./app-runtime";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const uniqueViolationSchema = z.object({ code: z.literal("23505") });

const createUniqueAppShortIdEffect = (projectId: string) =>
  Effect.gen(function* createUniqueAppShortId() {
    const db = yield* PlatformDatabase;

    for (let retry = 0; retry < 5; retry += 1) {
      const ids = yield* PlatformIds;
      const shortId = yield* ids.shortId;

      const existing = yield* attempt(
        async () =>
          await db.query.app.findFirst({
            where: { projectId, shortId },
          })
      );

      if (!existing) {
        return shortId;
      }
    }

    return yield* Effect.fail(
      new ORPCError("BAD_REQUEST", { message: "Failed to create app id." })
    );
  });

const listApps = cliRouter
  .meta(
    openapi({
      method: "POST",
      path: "/apps/list",
    })
  )
  .input(z.object({ body: paginationQuery.extend({ scopes: scopesSchema }) }))
  .output(paginatedOutput(AppWithCurrentDeployment))
  .handler(
    handlerGen(function* listApps({ context, input }) {
      const { page, pageSize } = input.body;
      const apps = yield* discoverAppsEffect(context.project.id, input.body);

      return {
        body: {
          items: apps
            .slice(0, pageSize)
            .map((item) => withAppAssetUrl(item, context.project.shortId)),
          pagination: {
            hasMore: apps.length > pageSize,
            page,
            pageSize,
          },
        },
      };
    })
  );

const getApp = cliRouter
  .meta(
    openapi({
      method: "POST",
      path: "/apps/lookup",
    })
  )
  .input(
    z.object({
      body: z.strictObject({ app: appSelectorSchema, scopes: scopesSchema }),
    })
  )
  .output(z.object({ body: AppWithCurrentDeployment }))
  .use(requireAppInScopes.adaptInput(({ body }) => body))
  .handler(({ context }) => ({
    body: withAppAssetUrl(context.app, context.project.shortId),
  }));

const createAppInput = z.object({
  description: App.shape.description,
  isShared: z
    .boolean()
    .optional()
    .describe(
      "Reserve a project-wide slug without changing visibility or scope access. Defaults to false."
    ),
  name: App.shape.name,
  scope: scopeSchema,
  slug: App.shape.slug.optional(),
});

export const createAppRecordEffect = (
  context: Context,
  input: z.infer<typeof createAppInput>,
  createdByAgent = false
) =>
  Effect.gen(function* createAppRecord() {
    const db = yield* PlatformDatabase;

    if (input.isShared === true && (createdByAgent || context.agentToken)) {
      return yield* Effect.fail(
        new ORPCError("FORBIDDEN", {
          message: "Agent-created apps cannot reserve shared slugs.",
        })
      );
    }

    const scope = canonicalizeScope(input.scope);

    const shortId = yield* createUniqueAppShortIdEffect(context.project.id);

    const [createdApp] = yield* attempt(
      async () =>
        await db
          .insert(app)
          .values({
            createdByAgent,
            description: input.description?.trim() ?? undefined,
            isShared: input.isShared ?? false,
            name: input.name.trim(),
            projectId: context.project.id,
            scope: scope.scope,
            scopeKey: scope.scopeKey,
            shortId,
            slug: input.slug,
          })
          .onConflictDoNothing()
          .returning()
    );

    if (!createdApp) {
      return yield* Effect.fail(
        new ORPCError("CONFLICT", {
          message: "App slug is already in use in this namespace.",
        })
      );
    }

    return {
      ...createdApp,
      currentDeployment: null,
      views: [],
    };
  });

const createApp = cliRouter
  .meta(
    openapi({
      method: "POST",
      path: "/apps",
    })
  )
  .input(z.object({ body: createAppInput.strict() }))
  .output(z.object({ body: AppWithCurrentDeployment }))
  .handler(
    handlerGen(function* createApp({ context, input }) {
      return {
        body: yield* createAppRecordEffect(context, input.body),
      };
    })
  );

// Only the trusted host may select a source outside the destination scope.
const installApp = protectedRouter
  .meta(openapi({ method: "POST", path: "/apps/install" }))
  .input(
    z.object({
      body: z.strictObject({
        app: appSelectorSchema,
        scope: scopeSchema,
        slug: App.shape.slug.optional(),
        sourceScope: scopeSchema.optional(),
      }),
    })
  )
  .output(z.object({ body: AppWithCurrentDeployment }))
  .handler(
    handlerGen(function* installApp({ context, input }) {
      const db = yield* PlatformDatabase;

      const selector = input.body.app;
      const localSource = "slug" in selector && selector.isShared === false;

      if (localSource && input.body.sourceScope === undefined) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", {
            message:
              "A source scope is required when installing by local slug. Use an app ID to select a source directly.",
          })
        );
      }

      const sourceScope =
        input.body.sourceScope === undefined
          ? undefined
          : canonicalizeScope(input.body.sourceScope);

      const source = yield* attempt(
        async () =>
          await db.query.app.findFirst({
            where: {
              projectId: context.project.id,
              ...appSelectorWhere(selector),
              RAW:
                sourceScope === undefined
                  ? undefined
                  : (fields, { eq: eqValue }) =>
                      eqValue(fields.scope, sourceScope.scope),
              scopeKey: sourceScope?.scopeKey,
            },
            with: {
              currentDeployment: {
                where: { status: "published" },
                with: { app: { columns: { shortId: true } } },
              },
            },
          })
      );

      const originDeployment = source?.currentDeployment;

      if (!source || !originDeployment) {
        return yield* Effect.fail(
          new ORPCError("NOT_FOUND", {
            message: "App has no published deployment.",
          })
        );
      }

      const scope = canonicalizeScope(input.body.scope);
      const shortId = yield* createUniqueAppShortIdEffect(context.project.id);

      const { installed, deployment } = yield* attempt(
        async () =>
          await db.transaction(async (tx) => {
            // Use the same owner lock as rollout so an install cannot copy a version
            // just before rollout and insert its stale pointer after the fan-out.
            await tx
              .select({ id: app.id })
              .from(app)
              .where(eq(app.id, originDeployment.appId))
              .for("update");

            const current = await tx.query.app.findFirst({
              where: { id: source.id, projectId: context.project.id },
              with: {
                currentDeployment: {
                  where: { status: "published" },
                  with: { app: { columns: { shortId: true } } },
                },
              },
            });

            const selectedDeployment = current?.currentDeployment;

            if (!selectedDeployment) {
              throw new ORPCError("NOT_FOUND", {
                message: "App has no published deployment.",
              });
            }

            const [createdInstallation] = await tx
              .insert(app)
              .values({
                currentDeploymentId: selectedDeployment.id,
                description: source.description,
                isShared: false,
                name: source.name,
                projectId: context.project.id,
                scope: scope.scope,
                scopeKey: scope.scopeKey,
                shortId,
                slug: input.body.slug ?? source.slug,
              })
              .onConflictDoNothing()
              .returning();

            return {
              deployment: selectedDeployment,
              installed: createdInstallation,
            };
          })
      );

      if (!installed) {
        return yield* Effect.fail(
          new ORPCError("CONFLICT", {
            message: "App slug is already in use in this namespace.",
          })
        );
      }

      const runtime = yield* PlatformRuntime;
      yield* runtime
        .warmDeployment(context.project.id, installed.id)
        .pipe(
          Effect.catch((error) =>
            Effect.logWarning("Could not warm new app installation", error)
          )
        );

      return {
        body: withAppAssetUrl(
          { ...installed, currentDeployment: deployment },
          context.project.shortId
        ),
      };
    })
  );

const deleteApp = cliRouter
  .meta(
    openapi({
      method: "POST",
      path: "/apps/delete",
    })
  )
  .input(
    z.object({
      body: z.strictObject({ app: appSelectorSchema, scope: scopeSchema }),
    })
  )
  .output(z.object({ body: App.pick({ id: true }) }))
  .use(requireApp.adaptInput(({ body }) => body))
  .handler(
    handlerGen(function* deleteApp({ context }) {
      const db = yield* PlatformDatabase;

      const dependent = yield* attempt(
        async () =>
          await db.query.app.findFirst({
            columns: { id: true },
            where: {
              currentDeployment: { appId: context.app.id },
              id: { ne: context.app.id },
            },
          })
      );

      if (dependent) {
        return yield* Effect.fail(
          new ORPCError("CONFLICT", {
            message: "Remove installations using this app before deleting it.",
          })
        );
      }

      yield* attempt(async () => {
        try {
          await db.delete(app).where(eq(app.id, context.app.id));
        } catch (error) {
          const candidate =
            error instanceof Error && error.cause !== undefined
              ? error.cause
              : error;

          const dependencyViolation = z
            .object({
              code: z.enum(["23503", "23001"]),
              constraint: z.literal(
                "app_current_deployment_id_app_deployment_id_fkey"
              ),
            })
            .safeParse(candidate);

          if (dependencyViolation.success) {
            throw new ORPCError("CONFLICT", {
              message:
                "Remove installations using this app before deleting it.",
            });
          }

          throw error;
        }
      });

      return { body: { id: context.app.id } };
    })
  );

const updateApp = cliRouter
  .meta(
    openapi({
      method: "POST",
      path: "/apps/update",
    })
  )
  .input(
    z.object({
      body: App.pick({ description: true, name: true })
        .extend({
          app: appSelectorSchema,
          isShared: z.boolean().optional(),
          scope: scopeSchema,
        })
        .strict(),
    })
  )
  .output(z.object({ body: AppWithCurrentDeployment }))
  .use(requireApp.adaptInput(({ body }) => body))
  .handler(
    handlerGen(function* updateApp({ context, input }) {
      const db = yield* PlatformDatabase;

      if (input.body.isShared === true && context.agentToken) {
        return yield* Effect.fail(
          new ORPCError("FORBIDDEN", {
            message: "Agents cannot reserve shared slugs.",
          })
        );
      }

      const [updatedApp] = yield* attempt(async () => {
        try {
          return await db
            .update(app)
            .set({
              description:
                input.body.description === undefined
                  ? undefined
                  : (input.body.description?.trim() ?? null),
              isShared: input.body.isShared,
              name: input.body.name?.trim(),
            })
            .where(eq(app.id, context.app.id))
            .returning();
        } catch (error) {
          if (
            uniqueViolationSchema.safeParse(error).success ||
            uniqueViolationSchema.safeParse(
              error instanceof Error ? error.cause : undefined
            ).success
          ) {
            throw new ORPCError("CONFLICT", {
              message: "App slug is already in use in this namespace.",
            });
          }

          throw error;
        }
      });

      if (!updatedApp) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", { message: "Failed to update app." })
        );
      }

      return {
        body: {
          ...updatedApp,
          currentDeployment: null,
          views: [],
        },
      };
    })
  );

const deploy = cliRouter
  .meta(
    openapi({
      method: "POST",
      path: "/apps/deploy",
    })
  )
  .input(
    z.object({
      body: z.strictObject({
        app: appSelectorSchema,
        deploymentId: z.string(),
        scope: scopeSchema,
      }),
    })
  )
  .output(z.object({ body: AppWithCurrentDeployment }))
  .use(requireApp.adaptInput(({ body }) => body))
  .handler(
    handlerGen(function* deploy({ context, input }) {
      const db = yield* PlatformDatabase;

      const deploymentByShortId = yield* attempt(
        async () =>
          await db.query.appDeployment.findFirst({
            where: {
              appId: context.app.id,
              shortId: input.body.deploymentId,
            },
          })
      );

      const deployment =
        deploymentByShortId ??
        (uuidPattern.test(input.body.deploymentId)
          ? yield* attempt(
              async () =>
                await db.query.appDeployment.findFirst({
                  where: {
                    appId: context.app.id,
                    id: input.body.deploymentId,
                  },
                })
            )
          : null);

      if (!deployment) {
        return yield* Effect.fail(
          new ORPCError("NOT_FOUND", { message: "Deployment not found." })
        );
      }

      const [updatedApp] = yield* attempt(
        async () =>
          await db
            .update(app)
            .set({ currentDeploymentId: deployment.id })
            .where(eq(app.id, context.app.id))
            .returning()
      );

      if (!updatedApp) {
        return yield* Effect.fail(
          new ORPCError("BAD_REQUEST", { message: "Failed to deploy app." })
        );
      }

      const { selectRuntimeDeployment } = yield* attempt(
        async () => await import("#app-runtime/deployment-steps")
      );

      const selected = yield* attempt(
        async () =>
          await selectRuntimeDeployment(
            {
              appId: context.app.id,
              deploymentId: deployment.id,
              projectId: context.project.id,
            },
            db
          )
      );

      if (selected && deployment.status === "published") {
        const server = yield* attempt(
          async () =>
            await db.query.appDeploymentFile.findFirst({
              where: {
                appDeploymentId: deployment.id,
                objectKey: `projects/${context.project.shortId}/apps/${context.app.shortId}/deployments/${deployment.shortId}/server/server.js`,
                status: "verified",
              },
            })
        );

        if (
          server?.checksum !== undefined &&
          server?.checksum !== null &&
          server?.checksum !== ""
        ) {
          yield* publishRuntimeMetadataEffect({
            appId: context.app.id,
            checksum: server.checksum,
            contentEncoding: server.encoding === "gzip" ? "gzip" : undefined,
            contentLength: server.contentLength,
            deploymentId: deployment.id,
            objectKey: server.objectKey,
            projectId: context.project.id,
          });
        }
      }

      return {
        body: withAppAssetUrl(
          { ...updatedApp, currentDeployment: deployment },
          context.project.shortId
        ),
      };
    })
  );

export const appRouter = o.router({
  create: createApp,
  delete: deleteApp,
  deploy,
  get: getApp,
  install: installApp,
  list: listApps,
  runtimeResolve,
  runtimeSession,
  update: updateApp,
});

export const createAppRecord = async (
  context: Context,
  input: z.infer<typeof createAppInput>,
  createdByAgent = false
) =>
  await runPlatform(
    createAppRecordEffect(context, input, createdByAgent),
    context
  );

export { AppWithCurrentDeployment } from "#app-discovery";
