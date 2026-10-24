import * as v from "valibot";
import { expect, it } from "vite-plus/test";

import {
  createPatchsmithUploadManifest,
  patchsmithUploadManifestSchema,
} from "./upload-manifest";

it.each([256, 257])("enforces the static asset cap for %i files", (count) => {
  expect(
    v.safeParse(patchsmithUploadManifestSchema, {
      assets: {
        client: "client/client.js",
        static: Array.from({ length: count }, (_, index) => ({
          checksum: "a".repeat(64),
          contentLength: 1,
          path: `asset-${index}.bin`,
        })),
      },
      version: 1,
    }).success
  ).toBe(count === 256);
});

it("defaults older manifests to no hooks and retains dotted hook names", () => {
  expect(
    v.parse(patchsmithUploadManifestSchema, {
      assets: { client: "client/client.js" },
      version: 1,
    }).hooks
  ).toEqual([]);
  expect(
    createPatchsmithUploadManifest(undefined, true, undefined, undefined, [
      "sync",
      "billing.updated",
    ]).hooks
  ).toEqual(["sync", "billing.updated"]);
});

it.each([
  ["sync", "sync"],
  ["bad/name"],
  ["a..b"],
  ["a.constructor"],
  [""],
  Array.from({ length: 1001 }, (_, index) => `hook${index}`),
])("rejects invalid hook names or duplicate registrations: %j", (...hooks) => {
  expect(
    v.safeParse(patchsmithUploadManifestSchema, {
      assets: { client: "client/client.js" },
      hooks,
      version: 1,
    }).success
  ).toBe(false);
});

it("references one static asset for both logo variants", () => {
  const asset = {
    checksum: "a".repeat(64),
    contentLength: 64,
    path: "brand/logo.svg",
  };

  expect(
    createPatchsmithUploadManifest(
      { dark: asset.path, light: asset.path },
      false,
      undefined,
      undefined,
      [],
      [asset]
    ).assets
  ).toMatchObject({
    logos: { dark: asset.path, light: asset.path },
    static: [asset],
  });
});

it.each([
  "../logo.svg",
  "./logo.svg",
  "assets/logo.svg",
  "/logo.svg",
  "logo.js",
  "missing.svg",
])("rejects invalid or missing logo asset references: %s", (logo) => {
  expect(
    v.safeParse(patchsmithUploadManifestSchema, {
      assets: {
        client: "client/client.js",
        logos: { light: logo },
        static: [
          { checksum: "a".repeat(64), contentLength: 64, path: "logo.svg" },
        ],
      },
      version: 1,
    }).success
  ).toBe(false);
});
