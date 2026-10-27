import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import * as v from "valibot";
import { expect, expectTypeOf, it } from "vite-plus/test";

import type { PatchsmithConfig, ResolvedPatchsmithConfig } from "./config";
import { patchsmithConfigSchema } from "./config";
import { loadPatchsmithConfig } from "./loader";

const config = { host: "https://host.test", name: "My App", slug: "my-app" };

it("requires name and slug in the public and resolved config types", () => {
  expectTypeOf<PatchsmithConfig>().toExtend<{ name: string; slug: string }>();
  expectTypeOf<ResolvedPatchsmithConfig>().toExtend<{
    name: string;
    slug: string;
  }>();
});

it.each([true, false])(
  "loads the internal shared-slug option without changing its value: %s",
  async (isShared) => {
    const root = await mkdtemp(
      path.join(tmpdir(), "patchsmith-internal-config-")
    );

    try {
      const input = {
        ...config,
        $internal: { isShared },
      } satisfies PatchsmithConfig;

      await writeFile(
        path.join(root, "patchsmith.config.mjs"),
        `export default ${JSON.stringify(input)};`
      );
      const loaded = await loadPatchsmithConfig(undefined, root);

      expect(loaded.config.$internal?.isShared).toBe(isShared);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);

it("leaves the sharing option unset when omitted", () => {
  expect(v.parse(patchsmithConfigSchema, config).$internal).toBeUndefined();
  expect(
    v.parse(patchsmithConfigSchema, { ...config, $internal: {} }).$internal
      ?.isShared
  ).toBeUndefined();
});

it.each([
  { isShared: true },
  { $internal: { isShared: "true" } },
  { $internal: { isShared: 1 } },
  { $internal: { isShared: null } },
  { $internal: { installable: true } },
])("rejects unsupported sharing configuration: %j", (input) => {
  expect(() =>
    v.parse(patchsmithConfigSchema, { ...config, ...input })
  ).toThrow();
});

it.each(["name", "slug"])("rejects a missing %s", (field) => {
  const input = { ...config, [field]: undefined };
  expect(() => v.parse(patchsmithConfigSchema, input)).toThrow();
});

it.each(["", "   "])("rejects a blank app name: %j", (name) => {
  expect(() => v.parse(patchsmithConfigSchema, { ...config, name })).toThrow();
});

it("loads and trims the configured app name and description", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-named-config-"));

  try {
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { host: "https://host.test", name: "  My App  ", slug: "my-app", description: "  My app description  " };'
    );
    const loaded = await loadPatchsmithConfig(undefined, root);
    expect(loaded.config.name).toBe("My App");
    expect(loaded.config.description).toBe("My app description");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it.each([null, "", "a".repeat(255)])(
  "accepts a clear, empty, or maximum-length description: %j",
  (description) => {
    expect(
      v.parse(patchsmithConfigSchema, { ...config, description })
    ).toMatchObject({ description });
  }
);

it("rejects app descriptions longer than 255 characters", () => {
  expect(() =>
    v.parse(patchsmithConfigSchema, {
      ...config,
      description: "a".repeat(256),
    })
  ).toThrow();
});

it("preserves optional backend settings and migration configuration", () => {
  expect(v.parse(patchsmithConfigSchema, { ...config, server: {} })).toEqual({
    ...config,
    server: {},
  });
  expect(
    v.parse(patchsmithConfigSchema, {
      ...config,
      server: { migrations: "./migrations" },
    })
  ).toEqual({
    ...config,
    server: { migrations: "./migrations" },
  });
});

it("rejects unsupported storage configuration", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-invalid-config-"));

  try {
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { host: "https://host.test", name: "My App", slug: "my-app", storage: { entry: "./server.ts" } };'
    );
    await expect(loadPatchsmithConfig(undefined, root)).rejects.toThrow(
      "Invalid key"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it("rejects manual client entry configuration", () => {
  expect(() =>
    v.parse(patchsmithConfigSchema, {
      client: { entry: "./frontend.ts" },
      ...config,
    })
  ).toThrow();
});

it.each([
  "",
  " ",
  "a",
  "ab",
  "UPPER",
  "my_app",
  "-app",
  "app-",
  "my--app",
  "a".repeat(33),
])("rejects an invalid app slug: %j", (slug) => {
  expect(() => v.parse(patchsmithConfigSchema, { ...config, slug })).toThrow();
});

it.each(["abc", "a-b", "my-app-1", "a".repeat(32)])(
  "accepts app slug %j",
  (slug) => {
    expect(v.parse(patchsmithConfigSchema, { ...config, slug }).slug).toBe(
      slug
    );
  }
);
