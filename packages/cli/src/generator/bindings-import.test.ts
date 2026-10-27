import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vite-plus/test";

import { resolveBindingsImport } from "./bindings-import";

const linkVite = async (root: string): Promise<void> => {
  const require = createRequire(import.meta.url);

  await mkdir(path.join(root, "node_modules"));
  await symlink(
    path.dirname(require.resolve("vite/package.json")),
    path.join(root, "node_modules/vite"),
    "dir"
  );
};

it.each([
  {
    expected: "#patchsmith",
    imports: { "#p": "./src/host.ts", "#patchsmith": "./src/host.ts" },
    name: "prefers the conventional import over a shorter alias",
  },
  {
    expected: "#h",
    imports: { "#h": "./src/host.ts", "#host": "./src/host.ts" },
    name: "finds the shortest custom import",
  },
  {
    expected: "#host",
    imports: { "#*": ["./src/*", "./src/*.ts"] },
    name: "expands wildcard arrays",
  },
  {
    expected: "#host",
    imports: {
      "#host": { browser: "./src/host.ts", default: "./other.ts" },
      "#patchsmith": { default: "./other.ts", types: "./src/host.ts" },
    },
    name: "checks the browser condition instead of accepting a types-only target",
  },
  {
    expected: "#host",
    imports: { "#host": "./src/host.ts", "#patchsmith": "./other.ts" },
    name: "rejects stale conventional imports",
  },
  {
    expected: "#patchsmith",
    imports: { "#host": "./src/host.ts", "#patchsmith": "#host" },
    name: "follows indirect package imports",
  },
  {
    expected: "#host",
    imports: { "#host": "./src/host.ts", "#x": null },
    name: "continues after a blocked shorter import",
  },
  {
    expected: "./host",
    imports: {},
    name: "falls back to a source-relative import",
  },
])("$name", async ({ imports, expected }) => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-imports-"));

  try {
    const sourceRoot = path.join(root, "src");
    const bindingsFile = path.join(sourceRoot, "host.ts");

    await mkdir(sourceRoot);
    await writeFile(bindingsFile, "export {};\n");
    await writeFile(path.join(root, "other.ts"), "export {};\n");
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ imports, type: "module" })
    );

    expect(await resolveBindingsImport(root, sourceRoot, bindingsFile)).toBe(
      expected
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it.each([true, false])(
  "verifies inherited TS paths against Vite (enabled: %s)",
  async (enabled) => {
    const root = await mkdtemp(path.join(tmpdir(), "patchsmith-ts-paths-"));

    try {
      const sourceRoot = path.join(root, "src");
      const bindingsFile = path.join(sourceRoot, "host.ts");

      await mkdir(sourceRoot);
      await mkdir(path.join(root, "config"));
      await linkVite(root);
      await writeFile(bindingsFile, "export {};\n");
      await writeFile(path.join(root, "package.json"), '{"type":"module"}');
      await writeFile(
        path.join(root, "config/base.json"),
        JSON.stringify({
          compilerOptions: { baseUrl: "..", paths: { "@/*": ["src/*.ts"] } },
        })
      );
      await writeFile(
        path.join(root, "tsconfig.json"),
        JSON.stringify({ extends: "./config/base.json", include: ["src"] })
      );
      await writeFile(
        path.join(root, "vite.config.mjs"),
        `export default { resolve: { tsconfigPaths: ${enabled} } };`
      );

      expect(await resolveBindingsImport(root, sourceRoot, bindingsFile)).toBe(
        enabled ? "@/host" : "./host"
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);

it("keeps a relative fallback when Vite config cannot load", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "patchsmith-uninstalled-app-")
  );

  try {
    const bindingsFile = path.join(root, "host.ts");

    await writeFile(bindingsFile, "export {};\n");
    await linkVite(root);
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ imports: { "#patchsmith": "./host.ts" } })
    );
    await writeFile(
      path.join(root, "vite.config.mjs"),
      'throw new Error("Config is not ready");'
    );

    expect(await resolveBindingsImport(root, root, bindingsFile)).toBe(
      "./host"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
