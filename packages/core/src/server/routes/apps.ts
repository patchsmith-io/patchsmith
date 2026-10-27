import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import {
  appsCreate,
  appsDelete,
  appsDeploy,
  appsGet,
  appsList,
  appsUpdate,
} from "@patchsmith/client-platform/client";
import type { AppsGetData } from "@patchsmith/client-platform/client/types.gen";
import * as v from "valibot";

import { slugSelector, withAppSlug } from "#server/app-slug";
import type { Context } from "#server/context";
import { httpPolicy } from "#server/http";
import { listApps } from "#server/list-apps";
import { platformAppSelector } from "#server/platform-app-selector";
import {
  getPatchsmithScope,
  getPatchsmithScopes,
  o,
  requireCliDeployToken,
  requireHostAuth,
} from "#server/procedures";
import { selectPatchsmithScopes } from "#server/scope";
import type { PatchsmithNamedScope } from "#server/types";

const paginationInput = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  pageSize: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))
  ),
});

const appInput = v.object({
  description: v.nullable(v.string()),
  isShared: v.optional(v.boolean()),
  name: v.string(),
  slug: v.optional(v.string()),
});

const scopeNamesInput = v.optional(
  v.union([
    v.pipe(
      v.string(),
      v.transform((name) => [name])
    ),
    v.array(v.string()),
  ])
);

const lookupErrorSchema = v.object({
  code: v.picklist([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "TOO_MANY_REQUESTS",
    "SERVICE_UNAVAILABLE",
  ]),
  message: v.string(),
});

const lookupHostApp = async (
  context: Pick<Context, "platform" | "platformHeaders" | "localSlugPrefix">,
  app: AppsGetData["body"]["app"],
  scopes: PatchsmithNamedScope[]
) => {
  try {
    const { data } = await appsGet({
      body: { app, scopes },
      client: context.platform,
      headers: context.platformHeaders,
      responseStyle: "fields",
      throwOnError: true,
    });

    return withAppSlug(data, context.localSlugPrefix);
  } catch (error) {
    const failure = v.safeParse(lookupErrorSchema, error);

    if (failure.success) {
      throw new ORPCError(failure.output.code, {
        message: failure.output.message,
      });
    }

    throw error;
  }
};

/** Resolve a URL slug using the host's verified scopes, without accepting browser scope values. */
export const lookupApp = o
  .meta(
    openapi({ method: "GET", path: "/apps/lookup" }),
    httpPolicy({ authenticate: true })
  )
  .use(requireHostAuth)
  .input(v.object({ scopes: scopeNamesInput, slug: v.string() }))
  .handler(
    async ({ context, input }) =>
      await lookupHostApp(
        context,
        slugSelector(input.slug, context.localSlugPrefix),
        getPatchsmithScopes(context, input.scopes)
      )
  );

export const appRouter = {
  create: o
    .use(requireCliDeployToken)
    .input(v.strictObject(appInput.entries))
    .handler(async ({ context, input }) => {
      const { data } = await appsCreate({
        body: { ...input, scope: getPatchsmithScope(context) },
        client: context.platform,
        headers: context.platformHeaders,
        responseStyle: "fields",
        throwOnError: true,
      });

      return withAppSlug(data, context.localSlugPrefix);
    }),
  delete: o
    .use(requireCliDeployToken)
    .input(v.object({ appId: v.string() }))
    .handler(
      async ({ context, input }) =>
        await appsDelete({
          body: {
            app: platformAppSelector(input.appId),
            scope: getPatchsmithScope(context),
          },
          client: context.platform,
          headers: context.platformHeaders,
        })
    ),
  deploy: o
    .use(requireCliDeployToken)
    .input(v.object({ appId: v.string(), deploymentId: v.string() }))
    .handler(async ({ context, input }) => {
      const { data } = await appsDeploy({
        body: {
          app: platformAppSelector(input.appId),
          deploymentId: input.deploymentId,
          scope: getPatchsmithScope(context),
        },
        client: context.platform,
        headers: context.platformHeaders,
        responseStyle: "fields",
        throwOnError: true,
      });

      return withAppSlug(data, context.localSlugPrefix);
    }),
  get: o
    .use(requireCliDeployToken)
    .input(
      v.union([
        v.strictObject({
          appId: v.string(),
          scopes: v.optional(v.array(v.string())),
        }),
        v.strictObject({
          scopes: v.optional(v.array(v.string())),
          slug: v.string(),
        }),
      ])
    )
    .handler(
      async ({ context, input }) =>
        await lookupHostApp(
          context,
          "slug" in input
            ? slugSelector(input.slug, context.localSlugPrefix)
            : platformAppSelector(input.appId),
          getPatchsmithScopes(context, input.scopes)
        )
    ),
  list: o
    .use(requireCliDeployToken)
    .input(
      v.optional(
        v.object({
          ...paginationInput.entries,
          scopes: v.optional(v.array(v.string())),
        })
      )
    )
    .handler(async ({ context, input }) => {
      const { data } = await appsList({
        body: {
          page: input?.page,
          pageSize: input?.pageSize,
          scopes: getPatchsmithScopes(context, input?.scopes),
        },
        client: context.platform,
        headers: context.platformHeaders,
        responseStyle: "fields",
        throwOnError: true,
      });

      return {
        ...data,
        items: data.items.map((app) =>
          withAppSlug(app, context.localSlugPrefix)
        ),
      };
    }),
  update: o
    .use(requireCliDeployToken)
    .input(
      v.strictObject({
        appId: v.string(),
        ...v.omit(appInput, ["slug"]).entries,
      })
    )
    .handler(async ({ context, input }) => {
      const { data } = await appsUpdate({
        body: {
          app: platformAppSelector(input.appId),
          description: input.description,
          isShared: input.isShared,
          name: input.name,
          scope: getPatchsmithScope(context),
        },
        client: context.platform,
        headers: context.platformHeaders,
        responseStyle: "fields",
        throwOnError: true,
      });

      return withAppSlug(data, context.localSlugPrefix);
    }),
};

/** Browser discovery uses host authentication; CLI app operations keep deploy-token authentication. */
export const discoverApps = o
  .meta(
    openapi({ method: "GET", path: "/apps" }),
    httpPolicy({ authenticate: true })
  )
  .use(requireHostAuth)
  .input(
    v.object({
      scopes: scopeNamesInput,
    })
  )
  .handler(async ({ context, input }) => {
    const names = input.scopes;

    let scopes;

    try {
      scopes =
        names?.length === 1 && names[0] === ""
          ? []
          : selectPatchsmithScopes(context.patchsmith.scopes, names);
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          error instanceof Error ? error.message : "Invalid scope selection.",
      });
    }

    return scopes.length
      ? await listApps(context, scopes, context.request.signal)
      : [];
  });
