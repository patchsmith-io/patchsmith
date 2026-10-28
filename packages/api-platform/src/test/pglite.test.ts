import { expect, it } from "vite-plus/test";

import { createTestDb } from "#test/pglite";

it("keeps migrated database snapshots isolated from test writes and schema changes", async () => {
  const first = await createTestDb();

  try {
    await first.client.exec("CREATE TABLE isolation_probe (value text)");
    await first.client.exec(
      "INSERT INTO isolation_probe VALUES ('first test')"
    );
    const second = await createTestDb();

    try {
      const { rows } = await second.client.query<{ name: string | null }>(
        "SELECT to_regclass('public.isolation_probe')::text AS name"
      );

      expect(rows).toEqual([{ name: null }]);

      const migrations = await second.client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"
      );

      expect(migrations.rows[0]?.count).toBeGreaterThan(0);
    } finally {
      await second.client.close();
    }
  } finally {
    await first.client.close();
  }
}, 30_000);
