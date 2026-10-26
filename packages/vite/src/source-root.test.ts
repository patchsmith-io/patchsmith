import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vite-plus/test";

import { resolveAppSourceRoot } from "./source-root";

it("defaults to the project root and supports an empty src tree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-source-root-"));

  try {
    expect(resolveAppSourceRoot(root)).toBe(root);
    await mkdir(path.join(root, "src"));
    expect(resolveAppSourceRoot(root)).toBe(path.join(root, "src"));
    await mkdir(path.join(root, "slots"));
    expect(resolveAppSourceRoot(root)).toBe(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it.each(["slots", "functions", "hooks", "db"])(
  "rejects mixed source trees containing %s",
  async (directory) => {
    const root = await mkdtemp(path.join(tmpdir(), "patchsmith-source-root-"));

    try {
      await mkdir(path.join(root, directory));
      await mkdir(path.join(root, "src/functions"), { recursive: true });
      expect(() => resolveAppSourceRoot(root)).toThrow("not both");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);
