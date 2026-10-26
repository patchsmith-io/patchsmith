import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vite-plus/test";

import {
  createFileFunctionEntry,
  discoverFunctionFiles,
  renderFunctionTypes,
} from "./file-functions";

it("discovers router namespaces while ignoring helpers and legacy function files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-functions-"));

  try {
    await mkdir(path.join(root, "src/functions/some/nested"), {
      recursive: true,
    });
    await mkdir(path.join(root, "src/functions/ignored.router.ts"));

    await Promise.all(
      [
        "some.nested.file.router.ts",
        "some/nested/file.router.ts",
        "some/nested.other.router.ts",
        "helpers.ts",
        "legacy.fn.ts",
        "single.route.ts",
        "index.router.ts",
      ].map(async (file) => {
        await writeFile(
          path.join(root, "src/functions", file),
          'throw new Error("Discovery never executes server code");'
        );
      })
    );
    const files = await discoverFunctionFiles(root);
    expect(files.map((file) => file.path)).toEqual([
      ["index"],
      ["some", "nested", "file"],
      ["some", "nested", "other"],
      ["some", "nested", "file"],
    ]);

    const types = renderFunctionTypes(
      files,
      path.join(root, "src/patchsmith.functions.gen.ts")
    );

    expect(types).toContain(
      'import type module0 from "./functions/index.router"'
    );
    expect(types).toContain(
      '{ readonly "some": { readonly "nested": { readonly "file": typeof module1 } } }'
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it.each([
  "name",
  "then",
  "some.name",
  "some/then",
  "some..file",
  "123",
  "invalid-name",
])("rejects invalid or reserved file namespaces: %s", async (name) => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-function-names-"));

  try {
    const filename = path.join(root, "src/functions", `${name}.router.ts`);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, "export default {};");
    await expect(discoverFunctionFiles(root)).rejects.toThrow(filename);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it.each([".", "src"])(
  "watches added, renamed and removed modules in %s",
  async (directory) => {
    const root = await mkdtemp(
      path.join(tmpdir(), "patchsmith-function-watch-")
    );

    const source = path.join(root, directory);
    await mkdir(source, { recursive: true });

    const registry = await createFileFunctionEntry(
      root,
      path.join(root, ".patchsmith"),
      true
    );

    const types = path.join(source, "patchsmith.functions.gen.ts");

    try {
      await mkdir(path.join(source, "functions"));
      const first = path.join(source, "functions/todos.router.ts");
      await writeFile(first, "export default {};");
      await expect
        .poll(async () => await readFile(types, "utf-8"), { timeout: 5000 })
        .toContain('"./functions/todos.router"');
      await expect
        .poll(async () => await readFile(registry.entry, "utf-8"), {
          timeout: 5000,
        })
        .toContain('path: ["todos"]');
      await rename(first, path.join(source, "functions/tasks.router.ts"));
      await expect
        .poll(async () => await readFile(types, "utf-8"), { timeout: 5000 })
        .toContain('"./functions/tasks.router"');
      await expect
        .poll(async () => await readFile(registry.entry, "utf-8"), {
          timeout: 5000,
        })
        .not.toContain('path: ["todos"]');
      await rm(path.join(source, "functions/tasks.router.ts"));
      await expect
        .poll(async () => await readFile(types, "utf-8"), { timeout: 5000 })
        .toContain("Record<never, never>");
      await expect
        .poll(async () => await readFile(registry.entry, "utf-8"), {
          timeout: 5000,
        })
        .toContain("createFileServer([])");
    } finally {
      await registry.close();
      await rm(root, { force: true, recursive: true });
    }
  },
  10_000
);
