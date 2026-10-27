import { handlerGen } from "@orpc/experimental-effect";
import { openapi } from "@orpc/openapi";
import { ORPCError, RPCJsonSerializer } from "@orpc/server";
import { appsRuntimeResolve } from "@patchsmith/client-platform/client";
import { Effect } from "effect";
import * as v from "valibot";

import type { PatchsmithSchema } from "#schema/schema";
import { withAppSlug } from "#server/app-slug";
import { httpPolicy, recordHttpTiming } from "#server/http";
import { listApps } from "#server/list-apps";
import { o, requireHostAuth } from "#server/procedures";
import { selectPatchsmithScopes } from "#server/scope";
import {
  composeViewContext,
  getViewHierarchy,
  viewsInputSchema,
  viewsResultSchema,
} from "#views";
import type { ViewLayer, ViewContextValues } from "#views";

const contextSerializer = new RPCJsonSerializer();

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Schema and serialization failures enter through untyped exception boundaries.
const invalidContext = (cause: unknown) =>
  new ORPCError("BAD_REQUEST", {
    cause,
    message: "Invalid view context",
  });

const serializeContext = (context: ViewContextValues) =>
  Effect.gen(function* serializeValues() {
    const serialized = yield* Effect.try({
      catch: invalidContext,
      try: () => contextSerializer.serialize(context),
    });

    const blobs =
      serialized.blobs === undefined
        ? undefined
        : yield* Effect.forEach(
            serialized.blobs,
            (blob) =>
              Effect.gen(function* serializeBlob() {
                const buffer = yield* Effect.tryPromise({
                  catch: invalidContext,
                  try: async () => await blob.arrayBuffer(),
                });

                const bytes = new Uint8Array(buffer);
                let binary = "";

                for (let offset = 0; offset < bytes.length; offset += 8192) {
                  binary += String.fromCodePoint(
                    ...bytes.subarray(offset, offset + 8192)
                  );
                }

                return {
                  data: btoa(binary),
                  lastModified:
                    blob instanceof File ? blob.lastModified : undefined,
                  name: blob instanceof File ? blob.name : undefined,
                  type: blob.type,
                };
              }),
            { concurrency: "unbounded" }
          );

    const json = yield* Effect.try({
      catch: invalidContext,
      try: () => v.parse(v.record(v.string(), v.unknown()), serialized.json),
    });

    return {
      context: json,
      contextBlobs: blobs,
      contextMaps: serialized.maps,
      contextMeta: serialized.meta?.map(([type, ...path]) => ({ path, type })),
    };
  });

const validateLayers = (
  schema: PatchsmithSchema,
  paths: Set<string>,
  layers: ViewLayer[]
) =>
  Effect.forEach(
    layers,
    (layer) =>
      Effect.gen(function* validateLayer() {
        const validator = Object.entries(schema.views).find(
          ([path]) => path === layer.path
        )?.[1];

        if (!paths.has(layer.path) || layer.status !== "ready" || !validator) {
          return layer;
        }

        const parsed = yield* Effect.tryPromise({
          catch: invalidContext,
          try: async () => await validator["~standard"].validate(layer.context),
        });

        return parsed.issues
          ? { path: layer.path, status: "error" as const }
          : { ...layer, context: parsed.value };
      }).pipe(
        Effect.orElseSucceed((): ViewLayer => ({
          path: layer.path,
          status: "error",
        }))
      ),
    { concurrency: "unbounded" }
  );

/** The host authenticates and validates context; the platform owns app-backend fan-out. */
export const views = o
  .meta(
    openapi({ method: "POST", path: "/views" }),
    httpPolicy({ authTiming: "views_auth", authenticate: true, json: true })
  )
  .errors({ GATEWAY_TIMEOUT: { message: "View resolution timed out" } })
  .use(requireHostAuth)
  .input(viewsInputSchema)
  .output(viewsResultSchema)
  .handler(
    handlerGen(function* views({ context, input }) {
      const { schema } = context;
      const viewer = context.patchsmith;

      const scopes = yield* Effect.try({
        catch: () =>
          new ORPCError("BAD_REQUEST", { message: "Invalid views request" }),
        try: () =>
          input.scopes?.length === 0
            ? []
            : selectPatchsmithScopes(viewer.scopes, input.scopes),
      });

      const definition = schema.slots[input.slot];

      if (!definition || !scopes.length || input.appIds?.length === 0) {
        return { data: [], status: "ready" as const, warnings: [] };
      }

      return yield* Effect.gen(function* resolveViews() {
        if (definition.multiple !== true) {
          const started = performance.now();

          const apps = yield* Effect.tryPromise({
            catch: () =>
              new ORPCError("BAD_GATEWAY", {
                message: "Unable to resolve views",
              }),
            try: async (signal) => await listApps(context, scopes, signal),
          });

          recordHttpTiming(context, "views_discovery", started);

          return {
            data: apps
              .filter(
                (app) =>
                  input.appIds === undefined || input.appIds.includes(app.id)
              )
              .filter((app) =>
                app.views?.some(
                  (view) =>
                    view.slot === input.slot &&
                    !view.disabled &&
                    !view.instances &&
                    definition.views.includes(view.path)
                )
              )
              .map((app) => ({ app })),
            status: "ready" as const,
            warnings: [],
          };
        }

        const active = input.activeView;

        if (!active) {
          return { status: "idle" as const };
        }

        const paths = getViewHierarchy(active.view).filter((path) =>
          definition.views.includes(path)
        );

        const layers = yield* validateLayers(
          schema,
          new Set(paths.flatMap(getViewHierarchy)),
          active.layers
        );

        const contexts = yield* Effect.forEach(
          paths,
          (path) =>
            Effect.gen(function* prepareContext() {
              const props = yield* Effect.try({
                catch: invalidContext,
                try: () =>
                  composeViewContext(path, {
                    declaredViews: Object.keys(schema.views),
                    layers,
                  }),
              });

              if (props.status !== "ready") {
                return { path, status: props.status };
              }

              return {
                ...(yield* serializeContext(props.context)),
                path,
                status: props.status,
              };
            }).pipe(
              // Reject errors only for views selected by an installation on the platform.
              Effect.orElseSucceed(() => ({ path, status: "error" as const }))
            ),
          { concurrency: "unbounded" }
        );

        const started = performance.now();

        const { data, response } = yield* Effect.tryPromise({
          catch: () =>
            new ORPCError("BAD_GATEWAY", {
              message: "Unable to resolve views",
            }),
          try: async (signal) =>
            await appsRuntimeResolve({
              baseUrl:
                context.runtimeResolveBaseUrl ??
                context.platform.getConfig().baseUrl,
              body: {
                appIds:
                  input.appIds === undefined ? undefined : [...input.appIds],
                contexts,
                scopes,
                slot: input.slot,
                subjectId: viewer.subjectId,
                toolUrl: context.toolUrl,
              },
              client: context.platform,
              headers: context.platformHeaders,
              redirect: "error",
              responseStyle: "fields",
              signal,
              throwOnError: false,
            }),
        });

        recordHttpTiming(context, "views_platform", started);

        if (!response) {
          return yield* Effect.fail(
            new ORPCError("BAD_GATEWAY", {
              message: "Unable to resolve views",
            })
          );
        }

        const timing = response.headers.get("server-timing");

        if (timing !== null) {
          context.resHeaders?.append("server-timing", timing);
        }

        if (response.status === 400) {
          return yield* Effect.fail(
            new ORPCError("BAD_REQUEST", { message: "Invalid view context" })
          );
        }

        if (response.status === 504) {
          return yield* Effect.fail(
            new ORPCError("GATEWAY_TIMEOUT", {
              message: "View resolution timed out",
            })
          );
        }

        if (!response.ok || !data) {
          return yield* Effect.fail(
            new ORPCError("BAD_GATEWAY", {
              message: "Unable to resolve views",
            })
          );
        }

        if (data.status !== "ready") {
          return data;
        }

        return {
          ...data,
          data: data.data.map((entry) => ({
            ...entry,
            app: withAppSlug(entry.app, context.localSlugPrefix),
          })),
        };
      });
    })
  );
