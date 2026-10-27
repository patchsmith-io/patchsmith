import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vite-plus/test";

it("preserves shared names during expansion, then defaults new rows to local after contraction", async () => {
  const client = new PGlite();

  try {
    await client.exec(`
      CREATE TABLE app (project_id text NOT NULL, scope_key text NOT NULL, slug text NOT NULL);
      CREATE UNIQUE INDEX app_project_id_slug_unique ON app (project_id, slug);
      INSERT INTO app VALUES ('project', 'first', 'stripe');
    `);

    const expansion = await readFile(
      new URL(
        "../../db/src/migrations/20261027110427_steady_joshua_kane/migration.sql",
        import.meta.url
      ),
      "utf-8"
    );

    await client.exec(expansion);

    const { rows: existingRows } = await client.query<{ is_shared: boolean }>(
      "SELECT is_shared FROM app"
    );

    expect(existingRows).toEqual([{ is_shared: true }]);

    // The previous backend still targets the legacy unique index during overlap.
    await client.exec(`
      INSERT INTO app (project_id, scope_key, slug) VALUES ('project', 'second', 'stripe')
        ON CONFLICT (project_id, slug) DO NOTHING;
      INSERT INTO app (project_id, scope_key, slug) VALUES ('project', 'second', 'legacy');
    `);
    const { rows: overlapRows } = await client.query("SELECT * FROM app");

    expect(overlapRows).toHaveLength(2);

    const contraction = await readFile(
      new URL(
        "../../db/src/migrations/20261027113142_ancient_madame_masque/migration.sql",
        import.meta.url
      ),
      "utf-8"
    );

    await client.exec(contraction);

    // Changing a default preserves rows written before the switch.
    const { rows: retainedRows } = await client.query<{ is_shared: boolean }>(
      "SELECT is_shared FROM app"
    );

    expect(retainedRows).toEqual([{ is_shared: true }, { is_shared: true }]);
    await client.exec(`
      INSERT INTO app (project_id, scope_key, slug) VALUES
        ('project', 'first', 'default-local'), ('project', 'second', 'default-local');
    `);

    const { rows: localRows } = await client.query<{ is_shared: boolean }>(
      "SELECT is_shared FROM app WHERE slug = 'default-local'"
    );

    expect(localRows).toEqual([{ is_shared: false }, { is_shared: false }]);
    await client.exec(`
      INSERT INTO app VALUES ('project', 'first', 'stripe', false), ('project', 'second', 'stripe', false);
      INSERT INTO app VALUES ('other-project', 'first', 'stripe', true);
    `);

    await expect(
      client.exec("INSERT INTO app VALUES ('project', 'third', 'stripe', true)")
    ).rejects.toThrow("app_project_shared_slug_unique");
    await expect(
      client.exec(
        "INSERT INTO app VALUES ('project', 'second', 'stripe', false)"
      )
    ).rejects.toThrow("app_project_scope_slug_unique");
    await expect(
      client.exec(
        "UPDATE app SET is_shared = true WHERE project_id = 'project' AND scope_key = 'second' AND slug = 'stripe'"
      )
    ).rejects.toThrow("app_project_shared_slug_unique");
  } finally {
    await client.close();
  }
});
