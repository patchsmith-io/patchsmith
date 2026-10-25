# App database

Each installation, an installed copy of the app, has persistent SQLite shared by its users. Use it for data the app owns. Backend functions enforce who can read or change that data; Patchsmith manages the connection and transactions.

Import database APIs from `patchsmith/db` in backend files. For storage choices, see the optional [data flow reference](references/workflows.md).

## Tables

Define tables in `db/schema.ts` with `table`, `text`, `integer`, `real`, and `boolean`. Use `crypto.randomUUID()` for text IDs. Table names start with a letter, contain letters/digits/underscores, have at most 63 characters, and avoid `sqlite_` and `patchsmith_` prefixes.

For example, define installation-shared notes in `db/schema.ts`:

<!-- example: db/schema.ts -->

```ts
import { table, text } from "patchsmith/db";

export const notes = table("notes", {
  id: text().primaryKey(),
  title: text().notNull(),
});
```

`.$type<T>()` narrows a column's TypeScript type; function input still needs runtime validation. `typeof notes.$inferInsert` gives the insert row type.

## Database and function builder

In `db/index.ts`, include the tables and bind the function builder:

<!-- example: db/index.ts -->

```ts
import { defineDatabase, defineRelations } from "patchsmith/db";
import { createFunctions } from "patchsmith/server";

import * as schema from "./schema";

export const db = defineDatabase({ relations: defineRelations(schema) });
export const fn = createFunctions({ database: db });
```

Function modules import `fn` from `#db`; see `patchsmith-functions` for handler examples. Run relational reads with `.sync()`, select builders with `.all()`/`.get()`, and writes with `.run()` or `.returning(...).all()`/`.get()`. Filter by access rules, select needed fields, and limit growing lists.

Relations describe connected records. Add a `defineRelations` callback when needed: `r.one.users({ from: r.notes.authorId, to: r.users.id })`. A column reference defines a foreign-key constraint.

## Migrations

Run `pnpm run db:generate` after table changes. Keep SQL and snapshots under `db/migrations`, or the configured migration directory. Preserve applied migrations and existing data; new required columns need defaults or a backfill.

Deployment applies pending migrations before database functions run. Use migrations for schema changes, preserving existing data instead of resetting it.
