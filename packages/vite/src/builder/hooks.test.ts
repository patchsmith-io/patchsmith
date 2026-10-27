import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readFile,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as v from "valibot";
import { build } from "vite";
import { expect, it } from "vite-plus/test";

import { loadPatchsmithConfig } from "#config/loader";
import { patchsmith } from "#index";
import { createDatabaseTestApp } from "#test-utils";

import { createFileFunctionEntry } from "./file-functions";
import { discoverHooks } from "./hooks";
import { buildServer } from "./server";
import { patchsmithUploadManifestSchema } from "./upload-manifest";

it("discovers dotted and nested hook names, ignores helpers and rejects duplicates", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-hook-discovery-"));

  try {
    expect(await discoverHooks(root)).toEqual([]);
    await mkdir(path.join(root, "src/hooks/customers"), { recursive: true });
    await writeFile(path.join(root, "src/hooks/customers/sync.hook.ts"), "");
    await writeFile(path.join(root, "src/hooks/sync.hook.ts"), "");
    await writeFile(path.join(root, "src/hooks/helper.ts"), "");
    const discovered = await discoverHooks(root);
    expect(discovered.map(({ name }) => name)).toEqual([
      "customers.sync",
      "sync",
    ]);
    await writeFile(path.join(root, "src/hooks/customers.sync.hook.ts"), "");
    await expect(discoverHooks(root)).rejects.toThrow("Duplicate hook");
    await rm(path.join(root, "src/hooks/customers.sync.hook.ts"));
    await writeFile(path.join(root, "src/hooks/bad-name.hook.ts"), "");
    await expect(discoverHooks(root)).rejects.toThrow("Invalid hook file path");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it.each([".", "src"])(
  "bundles %s hooks privately and watches changes",
  async (directory) => {
    const root = await mkdtemp(path.join(tmpdir(), "patchsmith-hook-build-"));

    try {
      await createDatabaseTestApp(root, directory);
      const sourceRoot = path.join(root, directory);
      await mkdir(path.join(sourceRoot, "hooks"));
      const filename = path.join(sourceRoot, "hooks/sync.hook.ts");

      const source =
        'import { defineHook as handler } from "patchsmith/server"; export default handler({ hook: "sync", handler: () => "PRIVATE_HOOK_HANDLER" });';

      await writeFile(filename, source);
      await build({
        configFile: false,
        logLevel: "silent",
        plugins: [
          patchsmith({ configPath: path.join(root, "patchsmith.config.mjs") }),
        ],
        root,
      });
      expect(
        await readFile(path.join(root, ".patchsmith/client/client.js"), "utf-8")
      ).not.toContain("PRIVATE_HOOK_HANDLER");
      expect(
        await readFile(path.join(root, ".patchsmith/server/server.js"), "utf-8")
      ).toContain("PRIVATE_HOOK_HANDLER");

      const application = v.parse(
        v.object({
          runtimeManifest: v.object({ requires: v.array(v.string()) }),
        }),
        await import(
          pathToFileURL(path.join(root, ".patchsmith/server/server.js")).href
        )
      );

      expect(application.runtimeManifest.requires).toEqual(
        expect.arrayContaining(["hooks", "nested-actions"])
      );

      const readHooks = async () =>
        v.parse(
          patchsmithUploadManifestSchema,
          JSON.parse(
            await readFile(
              path.join(root, ".patchsmith/patchsmith-upload.json"),
              "utf-8"
            )
          )
        ).hooks;

      expect(await readHooks()).toEqual(["sync"]);

      await writeFile(
        filename,
        source.replace('hook: "sync"', 'hook: "wrong"')
      );

      const loaded = await loadPatchsmithConfig(
        path.join(root, "patchsmith.config.mjs")
      );

      const functions = await createFileFunctionEntry(
        root,
        path.join(root, ".patchsmith"),
        false
      );

      await expect(buildServer(loaded, functions.entry)).rejects.toThrow(
        'defineHook hook must be "sync"'
      );
      await writeFile(filename, source);
      const watcher = await buildServer(loaded, functions.entry, true);

      if (!("close" in watcher)) {
        throw new Error("Expected a server watcher");
      }

      const server = path.join(root, ".patchsmith/server/server.js");

      try {
        await rename(filename, path.join(sourceRoot, "hooks/other.hook.ts"));
        await writeFile(
          path.join(sourceRoot, "hooks/other.hook.ts"),
          source
            .replaceAll("sync", "other")
            .replace("PRIVATE_HOOK_HANDLER", "RENAMED_HOOK_HANDLER")
        );
        await expect
          .poll(async () => await readFile(server, "utf-8").catch(() => ""), {
            timeout: 10_000,
          })
          .toContain("RENAMED_HOOK_HANDLER");
        await expect.poll(readHooks).toEqual(["other"]);
        await rm(path.join(sourceRoot, "hooks/other.hook.ts"));
        await expect
          .poll(
            async () => {
              const output = await readFile(server, "utf-8").catch(() => "");

              return (
                output.length > 0 && !output.includes("RENAMED_HOOK_HANDLER")
              );
            },
            { timeout: 10_000 }
          )
          .toBe(true);
        await expect.poll(readHooks).toEqual([]);
        await writeFile(
          filename,
          source.replace("PRIVATE_HOOK_HANDLER", "ADDED_HOOK_HANDLER")
        );
        await expect
          .poll(async () => await readFile(server, "utf-8").catch(() => ""), {
            timeout: 10_000,
          })
          .toContain("ADDED_HOOK_HANDLER");
        await expect.poll(readHooks).toEqual(["sync"]);
      } finally {
        await watcher.close();
        await functions.close();
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
  30_000
);

it("discovers the installation hook and rejects unknown platform hook files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-platform-hook-"));

  try {
    const directory = path.join(root, "src/hooks/patchsmith");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "onInstall.hook.ts"), "");
    const discovered = await discoverHooks(root);
    expect(discovered.map(({ name }) => name)).toEqual([
      "patchsmith.onInstall",
    ]);
    await writeFile(path.join(directory, "custom.hook.ts"), "");
    await expect(discoverHooks(root)).rejects.toThrow(
      'Unknown platform hook "patchsmith.custom"'
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
