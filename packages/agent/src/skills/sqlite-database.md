# App SQLite

Use the installation's managed SQLite for app-owned persistent data. It can be shared by multiple users; enforce the feature's access rules in functions. Product-owned records stay behind product tools.

Use `patchsmith/db` for columns, tables, relations, database definitions, and filter/order helpers. Follow the scaffold's three files:

```ts
// db/schema.ts
import { table, text, boolean } from "patchsmith/db";

export const todos = table("todos", {
  id: text().primaryKey(),
  title: text().notNull(),
  done: boolean().notNull().default(false),
});
```

```ts
// db/relations.ts
import { defineRelations } from "patchsmith/db";

import * as schema from "./schema";

export const relations = defineRelations(schema);
```

```ts
// db/index.ts
import { defineDatabase } from "patchsmith/db";

import { relations } from "./relations";

export const db = defineDatabase({ relations });
```

Generate text IDs explicitly, for example `crypto.randomUUID()` in a mutation. Choose columns and defaults for the actual feature. `$inferInsert` describes complete insert rows; a draft may need a smaller type. `.$type<T>()` narrows TypeScript, so validate input values too. Table names start with a letter, contain letters/digits/underscores, are at most 63 characters, and avoid `sqlite_`/`patchsmith_` prefixes.

Pass all tables to `defineRelations(schema)`. Add relation navigation only when used. `r.one.users({ from: r.notes.authorId, to: r.users.id })` defines navigation; foreign keys require column references.

Export `fn = createFunctions({ database: db })` from `db/index.ts`, importing `createFunctions` from `patchsmith/server`. Function modules import the shared `fn` from `#db` and receive typed `db` in their handlers. Relational reads end with `.sync()`, selects with `.all()`/`.get()`, and writes with `.run()` or `.returning(...).all()`/`.get()`. Apply access conditions to reads/updates/deletes. Filter and limit in the query as needed. The capability is synchronous and restricted; mutations already provide transactions, so no driver, raw connection, or nested transaction is needed.

After schema changes, run `db:generate`. Inspect generated SQL and keep migrations/snapshots together under `db/migrations` or the configured directory. Append migrations without rewriting applied history. For existing rows, supply suitable defaults/backfills for new required fields. The build checks drift and deployment applies pending migrations. Preserve data; correct source and generate forward migrations instead of resetting the database or pushing live schema.
