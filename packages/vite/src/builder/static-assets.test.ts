import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vite-plus/test";

import { readStaticAssets, writeStaticAssets } from "./static-assets";

it("removes obsolete static assets when a rebuild changes or empties the snapshot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-static-rebuild-"));

  try {
    await mkdir(path.join(root, "assets/nested"), { recursive: true });
    await writeFile(path.join(root, "assets/nested/old.txt"), "old");
    await writeStaticAssets(
      path.join(root, "output"),
      await readStaticAssets(root)
    );
    await rm(path.join(root, "assets/nested"), { recursive: true });
    await writeFile(path.join(root, "assets/current.txt"), "current");
    await writeStaticAssets(
      path.join(root, "output"),
      await readStaticAssets(root)
    );
    expect(await readdir(path.join(root, "output/assets"))).toEqual([
      "current.txt",
    ]);
    await writeStaticAssets(path.join(root, "output"), []);
    expect(await readdir(path.join(root, "output"))).toEqual([]);
    expect(await readFile(path.join(root, "assets/current.txt"), "utf-8")).toBe(
      "current"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it("accepts 256 static files and rejects a 257th file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-static-count-"));

  try {
    await mkdir(path.join(root, "assets"));
    await Promise.all(
      Array.from({ length: 256 }, async (_, index) => {
        await writeFile(path.join(root, "assets", `asset-${index}.txt`), "x");
      })
    );
    expect(await readStaticAssets(root)).toHaveLength(256);
    await writeFile(path.join(root, "assets/extra.txt"), "x");
    await expect(readStaticAssets(root)).rejects.toThrow(
      "Static asset size or count limit exceeded"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it("snapshots binary files, uses stable hashes, and copies the exact hashed bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-static-assets-"));

  try {
    expect(await readStaticAssets(root)).toEqual([]);
    await mkdir(path.join(root, "assets/game"), { recursive: true });
    const bytes = Buffer.from([0, 255, 1, 128]);
    await writeFile(path.join(root, "assets/game/doom.wad"), bytes);
    const assets = await readStaticAssets(root);
    expect(assets[0]?.checksum).toBe(
      createHash("sha256").update(bytes).digest("hex")
    );
    await writeFile(path.join(root, "assets/game/doom.wad"), "changed");
    await writeStaticAssets(path.join(root, "output"), assets);
    expect(
      await readFile(path.join(root, "output/assets/game/doom.wad"))
    ).toEqual(bytes);
    const changed = await readStaticAssets(root);
    expect(changed[0]?.checksum).not.toBe(assets[0]?.checksum);
    await symlink(path.join(root, "output"), path.join(root, "assets/escape"));
    await expect(readStaticAssets(root)).rejects.toThrow("symlinks");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
