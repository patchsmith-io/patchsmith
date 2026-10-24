import {
  maxDeploymentBytes,
  maxStaticAssets,
} from "@patchsmith/asset-delivery/deployment-limits";
import * as v from "valibot";

import { logosConfigSchema } from "#config/config";

export {
  assertDeploymentSize,
  maxDeploymentBytes,
} from "@patchsmith/asset-delivery/deployment-limits";

export const staticInstancesSchema = v.pipe(
  v.array(
    v.object({
      data: v.unknown(),
      key: v.pipe(v.string(), v.minLength(1)),
      metadata: v.record(v.string(), v.unknown()),
    })
  ),
  v.maxLength(1000),
  v.check(
    (items) => new Set(items.map((item) => item.key)).size === items.length,
    "Instance keys must be unique"
  )
);

export const patchsmithUploadManifestSchema = v.pipe(
  v.object({
    appId: v.optional(v.pipe(v.string(), v.minLength(1))),
    assets: v.object({
      client: v.literal("client/client.js"),
      logos: v.optional(logosConfigSchema),
      server: v.optional(v.literal("server/server.js")),
      static: v.optional(
        v.pipe(
          v.array(
            v.object({
              checksum: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)),
              contentLength: v.pipe(
                v.number(),
                v.integer(),
                v.minValue(1),
                v.maxValue(maxDeploymentBytes)
              ),
              path: v.pipe(
                v.string(),
                v.maxLength(512),
                v.regex(
                  /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/u
                )
              ),
            })
          ),
          v.maxLength(maxStaticAssets),
          v.check(
            (assets) =>
              new Set(assets.map((asset) => asset.path)).size === assets.length,
            "Asset paths must be unique"
          ),
          v.check(
            (assets) =>
              assets.reduce((size, asset) => size + asset.contentLength, 0) <=
              maxDeploymentBytes,
            "Static assets exceed the deployment size limit"
          )
        )
      ),
    }),
    hooks: v.optional(
      v.pipe(
        v.array(
          v.pipe(
            v.string(),
            v.minLength(1),
            v.maxLength(255),
            v.regex(
              /^[a-zA-Z][a-zA-Z0-9_]{0,63}(?:\.[a-zA-Z][a-zA-Z0-9_]{0,63})*$/u
            ),
            v.check(
              (name) =>
                !name
                  .split(".")
                  .some((part) =>
                    ["constructor", "prototype", "__proto__"].includes(part)
                  )
            )
          )
        ),
        v.maxLength(1000),
        v.check((names) => new Set(names).size === names.length)
      ),
      () => []
    ),
    version: v.literal(1),
    views: v.optional(
      v.pipe(
        v.array(
          v.pipe(
            v.object({
              disabled: v.optional(v.literal(true)),
              instances: v.optional(v.literal(true)),
              path: v.pipe(v.string(), v.startsWith("/"), v.maxLength(1024)),
              slot: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
              staticInstances: v.optional(staticInstancesSchema),
            }),
            v.check(
              (view) =>
                view.staticInstances === undefined || view.instances === true,
              "Static entries require an instance view"
            )
          )
        ),
        v.maxLength(1000)
      )
    ),
  }),
  v.check(
    ({ assets }) =>
      Object.values(assets.logos ?? {}).every(
        (path) => assets.static?.some((asset) => asset.path === path) === true
      ),
    "Logos must reference files in assets/"
  )
);

export type PatchsmithUploadManifest = v.InferOutput<
  typeof patchsmithUploadManifestSchema
>;

export const createPatchsmithUploadManifest = (
  logos?: PatchsmithUploadManifest["assets"]["logos"],
  server = false,
  views?: PatchsmithUploadManifest["views"],
  appId?: string,
  hooks: string[] = [],
  staticAssets: PatchsmithUploadManifest["assets"]["static"] = []
): PatchsmithUploadManifest => {
  const assets: PatchsmithUploadManifest["assets"] = {
    client: "client/client.js",
  };

  if (staticAssets.length > 0) {
    assets.static = staticAssets;
  }

  if (server) {
    assets.server = "server/server.js";
  }

  if (logos && Object.keys(logos).length > 0) {
    assets.logos = logos;
  }

  return v.parse(patchsmithUploadManifestSchema, {
    appId,
    assets,
    hooks,
    version: 1,
    views,
  });
};
