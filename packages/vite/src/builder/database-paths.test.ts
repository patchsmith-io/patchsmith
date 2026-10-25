import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vite-plus/test";

import { appDatabasePaths } from "./database-paths";

it.each([".", "src"])(
  "resolves database paths in %s and custom migrations from the project root",
  async (directory) => {
    const root = await mkdtemp(path.join(tmpdir(), "patchsmith-db-paths-"));

    try {
      const source = path.join(root, directory);
      await mkdir(path.join(source, "db"), { recursive: true });
      expect(appDatabasePaths(root)).toEqual({
        migrations: path.join(source, "db/migrations"),
        schema: path.join(source, "db/schema.ts"),
      });
      expect(appDatabasePaths(root, "custom/history")).toEqual({
        migrations: path.join(root, "custom/history"),
        schema: path.join(source, "db/schema.ts"),
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);
