import type { ViewInstance } from "@patchsmith/app/client";
import * as v from "valibot";

import type { PatchsmithSchema } from "#schema/schema";

const isObjectValue = <TValue>(value: TValue): value is TValue & object =>
  typeof value === "object" && value !== null;

// Each view schema owns its field values; composition only merges checked object containers.
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- A schema-agnostic composer cannot narrow arbitrary registered schema outputs.
export type ViewContextValues = Record<string, unknown>;

export type ViewStatus = "ready" | "loading" | "error";

export interface ViewLayer {
  path: string;
  context?: unknown;
  status: ViewStatus;
}

export interface ActiveView {
  view: string;
  layers: ViewLayer[];
}

/** Includes the requested path, followed by its parents through the root. */
export const getViewHierarchy = (path: string): string[] => {
  const hierarchy = [path];
  let current = path;

  while (current !== "/") {
    const separator = current.lastIndexOf("/");
    current = separator <= 0 ? "/" : current.slice(0, separator);
    hierarchy.push(current);
  }

  return hierarchy;
};

export const isViewAncestor = (ancestor: string, path: string): boolean =>
  ancestor === "/" || ancestor === path || path.startsWith(`${ancestor}/`);

export const getViewDepth = (path: string): number =>
  path.split("/").filter(Boolean).length;

/** Context supplied to the selected view after combining its registered ancestors. */
export interface ReadyViewProps {
  view: string;
  status: "ready";
  context: ViewContextValues;
}

export type ResolvedViewProps =
  | ReadyViewProps
  | { view: string; status: "loading" | "error"; context?: never };

export const composeViewContext = (
  selected: string,
  request: { layers: readonly ViewLayer[]; declaredViews: readonly string[] }
): ResolvedViewProps => {
  let status: ViewStatus = "ready";
  const context: ViewContextValues = {};

  for (const path of getViewHierarchy(selected).toReversed()) {
    const layer = request.layers.find((entry) => entry.path === path);

    if (!layer) {
      if (request.declaredViews.includes(path) || path === selected) {
        status = "error";
      }

      continue;
    }

    if (layer.status === "error") {
      status = "error";
    } else if (layer.status === "loading" && status !== "error") {
      status = "loading";
    }

    if (layer.status !== "ready" || layer.context === undefined) {
      continue;
    }

    if (
      layer.context === null ||
      !isObjectValue(layer.context) ||
      Array.isArray(layer.context)
    ) {
      status = "error";
      continue;
    }

    for (const [key, value] of Object.entries(layer.context)) {
      if (Object.hasOwn(context, key)) {
        throw new Error(`Duplicate view context field "${key}".`);
      }

      Object.defineProperty(context, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    }
  }

  const props: ResolvedViewProps =
    status === "ready"
      ? { context, status, view: selected }
      : { context: undefined, status, view: selected };

  return props;
};

export interface PatchsmithApp {
  /** Host-formatted slug; local apps default to an "@" prefix. */
  slug?: string;
  isShared?: boolean;
  scope?: { name: string };
  views?: {
    slot: string;
    path: string;
    instances?: true;
    disabled?: true;
  }[];
  clientPath?: string;
  description?: string | null;
  id: string;
  logoPaths?: {
    dark?: string;
    light?: string;
  };
  projectId?: string;
  currentDeployment?: {
    id: string;
  } | null;
  name?: string;
}

/** Select the supported view without reading or composing its context. */
export const selectSlotView = (
  views: NonNullable<PatchsmithApp["views"]>,
  slot: string,
  activePath: string,
  schema: Pick<PatchsmithSchema, "slots" | "views">
) => {
  const supported = schema.slots[slot]?.views ?? [];

  const path = getViewHierarchy(activePath).find(
    (pathValue) =>
      supported.includes(pathValue) &&
      views.some(
        (view) =>
          view.slot === slot && view.path === pathValue && !view.disabled
      )
  );

  return (
    views.find(
      (view) => view.slot === slot && view.path === path && !view.disabled
    ) ?? null
  );
};

/** Match the same path and compose the same ancestor context as the sandbox renderer. */
export const resolveSlotView = (
  views: NonNullable<PatchsmithApp["views"]>,
  slot: string,
  activeView: ActiveView,
  schema: Pick<PatchsmithSchema, "slots" | "views">
) => {
  const view = selectSlotView(views, slot, activeView.view, schema);

  if (!view) {
    return null;
  }

  return {
    ...composeViewContext(view.path, {
      declaredViews: Object.keys(schema.views),
      layers: activeView.layers,
    }),
    instances: Boolean(view.instances),
  };
};

/** The host authenticates and validates context; the platform resolves instances. */
export interface ViewsInput {
  slot: string;
  scopes?: readonly string[];
  appIds?: readonly string[];
  activeView: ActiveView | null;
}

export const viewsInputSchema = v.strictObject({
  activeView: v.nullable(
    v.object({
      layers: v.pipe(
        v.array(
          v.object({
            context: v.optional(v.unknown()),
            path: v.pipe(v.string(), v.startsWith("/")),
            status: v.picklist(["ready", "loading", "error"]),
          })
        ),
        v.check(
          (layers) =>
            new Set(layers.map((layer) => layer.path)).size === layers.length,
          "View layers must have unique paths"
        )
      ),
      view: v.pipe(v.string(), v.startsWith("/")),
    })
  ),
  appIds: v.optional(v.array(v.string())),
  scopes: v.optional(v.array(v.string())),
  slot: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
});

export const patchsmithAppSchema: v.GenericSchema<PatchsmithApp> =
  v.looseObject({
    clientPath: v.optional(v.string()),
    currentDeployment: v.optional(
      v.nullable(v.looseObject({ id: v.string() }))
    ),
    description: v.optional(v.nullable(v.string())),
    id: v.string(),
    isShared: v.optional(v.boolean()),
    logoPaths: v.optional(
      v.object({ dark: v.optional(v.string()), light: v.optional(v.string()) })
    ),
    name: v.optional(v.string()),
    projectId: v.optional(v.string()),
    scope: v.optional(v.looseObject({ name: v.string() })),
    slug: v.optional(v.string()),
    views: v.optional(
      v.array(
        v.object({
          disabled: v.optional(v.literal(true)),
          instances: v.optional(v.literal(true)),
          path: v.string(),
          slot: v.string(),
        })
      )
    ),
  });

/** A non-fatal issue for an app omitted from a partial views response. */
export interface ViewResolutionWarning {
  appId: string;
  code: "INSTANCE_RESOLUTION_TIMEOUT";
  message: string;
  path: string;
}

const viewResolutionWarningSchema = v.object({
  appId: v.string(),
  code: v.literal("INSTANCE_RESOLUTION_TIMEOUT"),
  message: v.string(),
  path: v.string(),
});

export const viewsResultSchema: v.GenericSchema<ViewsResult> = v.variant(
  "status",
  [
    v.object({
      data: v.array(
        v.union([
          v.object({
            app: patchsmithAppSchema,
            data: v.unknown(),
            key: v.string(),
            metadata: v.record(v.string(), v.unknown()),
          }),
          v.strictObject({ app: patchsmithAppSchema }),
        ])
      ),
      status: v.literal("ready"),
      warnings: v.array(viewResolutionWarningSchema),
    }),
    v.object({ status: v.picklist(["idle", "loading"]) }),
  ]
);

export type ViewsResult =
  | {
      status: "ready";
      warnings: ViewResolutionWarning[];
      data: (
        | { app: PatchsmithApp }
        | (ViewInstance & { app: PatchsmithApp })
      )[];
    }
  | { status: "idle" | "loading" };
