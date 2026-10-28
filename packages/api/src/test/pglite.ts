import nodePath from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { relations } from "@patchsmith/db/relations";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const { resolve } = nodePath;

const apiDir = import.meta.dirname;
const migrationsDir = resolve(apiDir, "../../../db/src/migrations");

const createMigratedSnapshot = async () => {
  const client = new PGlite();

  const db = drizzle({
    client,
    relations,
  });

  try {
    await migrate(db, { migrationsFolder: migrationsDir });

    return await client.dumpDataDir("none");
  } finally {
    await client.close();
  }
};

// Cache only the migrated template. Each test owns and closes a separate database.
let snapshot: ReturnType<typeof createMigratedSnapshot> | undefined;

export const createTestDb = async () => {
  snapshot ??= createMigratedSnapshot();
  const client = new PGlite({ loadDataDir: await snapshot });
  await client.waitReady;
  const db = drizzle({ client, relations });

  return { client, db };
};
