# App functions

Every app includes a backend. Queries read reactively, mutations write atomically, and actions await external work. Queries/mutations are synchronous; actions use `queries`, `mutations`, and exposed server `tools` instead of a direct `db`.

Chain `.input(schema)` and optional `.output(schema)` with synchronous Standard Schema v1-compatible validators. Builder handlers receive validated `input`. Return JSON-compatible values, using `null` for absence. Export each function module with `export default defineRouter({ list, add })`, save it under `functions/**/*.router.ts`, and regenerate bindings. The file path supplies its API namespace; dots and directories are equivalent. Nested router objects add segments. Shared namespaces merge, while duplicate function paths and function/namespace conflicts fail the build. Each segment starts with a letter and contains at most 64 letters, digits, or underscores; `name` and `then` are reserved. `index` stays literal.

## Small example

Import the shared `fn` from `#db`, configured once with `createFunctions({ database: db })` in `db/index.ts`. This uses the database skill's `todos` table, shared by the installation. For private records, add ownership from verified identity and enforce it in every read/write.

```ts
// functions/todos.router.ts
import { defineRouter } from "patchsmith/server";
import * as v from "valibot";

import { fn } from "#db";
import { todos } from "#db/schema";

const list = fn.query.handler(({ db }) =>
  db.query.todos.findMany({ orderBy: { id: "asc" }, limit: 100 }).sync()
);

const add = fn.mutation
  .input(v.object({ title: v.pipe(v.string(), v.trim(), v.minLength(1)) }))
  .handler(({ db, input }) => {
    const id = crypto.randomUUID();
    db.insert(todos).values({ id, title: input.title }).run();
    return { id };
  });

export default defineRouter({ list, add });
```

Under `ClientProvider`, use `useQuery(api.todos.list)` and `useMutation(api.todos.add)` from `patchsmith/client`. Render hook data/loading/error state directly; writes refresh affected queries. Use `mutate`/`execute` in ordinary callbacks, and their async variants when later work needs a result. Keep hooks unconditional; mount a record's query component when its required ID is available. For inputless queries with options, preserve the second argument: `useQuery(api.todos.list, undefined, { enabled: isOpen })`.

## Runtime details when needed

Execute relational reads with `.sync()`, selects with `.all()`/`.get()`, and writes with `.run()` or `.returning(...).all()`/`.get()`. A mutation owns one transaction and rolls back on throw. Database handles are valid only during the handler.

For actions calling app functions, import the router from `#functions/todos.router`, declare `.functions({ todos })` and use `queries.todos.list()` or `mutations.todos.add(input)`. Public fetches use `signal`, status checks, and response validation. Product credentials remain behind exposed server tools. External effects and separate mutations do not form one transaction; choose retry behavior for the operation being implemented.

`identity.subjectId` is the authenticated user or service principal supplied by the host and is always a nonempty string. Installation isolation is not user authorization; filter private records by that subject. Use `AppError` from `patchsmith/server` for expected failures. For uncovered APIs, inspect installed public declarations behind `patchsmith/server` or `patchsmith/client`.
