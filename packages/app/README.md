# Patchsmith app SDK

Use `@patchsmith/app` to build Patchsmith extensions. Apps require Preact 11; install `preact@^11` alongside the SDK.

Define app tables, relations, and database capabilities with `patchsmith/db`, backed by [`@patchsmith/app-db`](../app-db/README.md). Define queries, mutations, and actions with `patchsmith/server`.

## File routing

App source lives at the project root by default, or together under optional `src/`. The paths below are relative to that source root. Configuration and assets remain at the project root.

The builder registers views from `slots` automatically. Only files ending in `.view.tsx` register views, so supporting components can live beside them:

```text
slots/
  root.tsx
  panel/
    root.tsx
    layout.tsx
    index.view.tsx
    customers.view.tsx
    customers.layout.tsx
    customers.details.view.tsx
    customer-card.tsx
```

The slot directory is its literal host slot name, including dots in names such as `panel.links`. Dots in a view filename separate route segments: `customers.details.view.tsx` registers `/customers/details`. Subdirectories also separate segments. `customer-card.tsx` is an ordinary component and is ignored unless imported.

Duplicate view paths in a slot fail the build.

For example, `slots/panel/customers.details.view.tsx` registers `/customers/details`:

```tsx
import { defineView } from "patchsmith/client";

import CustomerCard from "./customer-card";

export default defineView({ component: CustomerCard });
```

The builder supplies the slot and route before compiling. In `slots/panel/index.view.tsx`, an explicit `view` gives typed host context and must match `/`:

```tsx
import { defineView } from "patchsmith/client";

const view = defineView({ view: "/", component: Home });

function Home() {
  const context = view.useContext();
  return <>Welcome</>;
}

export default view;
```

`index.view.tsx` maps to `/`. A final `index` segment is omitted, so `customers/index.view.tsx` and `customers.index.view.tsx` both map to `/customers`. Other segments stay literal: `index.details.view.tsx` maps to `/index/details`.

An explicit `view` or `slot` must be a matching string literal; mismatches fail the build. Use named properties in the inline `defineView` options so the build can check them.

For multi-instance views, provide `instances: { dataSchema, resolve }`. By default, the builder extracts resolvers into the private server bundle. Host slot/view support and multiplicity are validated when publishing. An explicit slot also retains the source-level TypeScript checks for that slot's supported views and instances.

## Static instance lists

Use `cache: "static"` for fixed navigation entries or tiles:

```tsx
instances: {
  cache: "static",
  dataSchema: z.object({ section: z.string() }),
  resolve: () => [
    { key: "reports", metadata: { label: "Reports" }, data: { section: "reports" } },
  ],
},
```

The build evaluates each static resolver once, including async resolvers, applies `dataSchema`, and writes the parsed entries into the deployment view manifest. Static resolver implementations are excluded from both deployed bundles. The platform uses the snapshot without an app runtime session or Cloudflare resolver call, including on the first request. New deployments replace the snapshot.

Static resolvers take no arguments and have no request context, identity, registered queries, or cancellation signal. Returned data and metadata must be JSON-compatible; schema transformations must also produce JSON-compatible output. Invalid output, duplicate or empty keys, more than 1,000 entries, resolver failures, or evaluation beyond the 10-second build budget fail the build. An empty array is valid. Returned entries are shared deployment metadata, so keep secrets out of them.

Omitting `cache` or setting `cache: "none"` preserves runtime resolution with the existing request capabilities. The client response cache remains independent of this setting. Runtime lifetime objects are not supported. Static instances retain the host's authentication, scopes, selected-view rules, and context readiness checks; later UI queries still use the app runtime.

Deploy platform and host support before publishing apps with static instances. Older readers ignore the snapshot and try runtime resolution, but static resolvers have no deployed runtime implementation.

## Roots and layouts

`slots/root.tsx` is the optional app shell. Init generates a shell with the backend provider:

```tsx
import { ClientProvider, defineRoute, Route } from "patchsmith/client";

function Shell() {
  return (
    <ClientProvider>
      <Route />
    </ClientProvider>
  );
}

export default defineRoute({ shellComponent: Shell });
```

Each slot can also have a `root.tsx` exporting `defineRoute({ shellComponent })`. It wraps every view in that slot, inside the app shell. A shell can render its `children` prop instead of `<Route />`.

`layout.tsx` wraps its directory path: at the slot root it wraps the entire slot; `members/layout.tsx` wraps `/members` and its descendants. `customers.layout.tsx` wraps `/customers` and its descendants, with matching at segment boundaries.

Unlike view paths, layout paths retain a final `index` segment: `index.layout.tsx` maps to `/index`, and `members/index.layout.tsx` maps to `/members/index`. Layouts do not register views themselves.

Export a component as the layout’s default export, or use a `defineRoute({ shellComponent })` definition:

```tsx
import { Route } from "patchsmith/client";

export default function CustomersLayout() {
  return <Route />;
}
```

For `/customers/details`, the order is app root → slot root → slot layout → customers layout → details view. Shared shells and layouts stay mounted as the selected view changes; layouts mount and unmount when entering or leaving their route subtree. Layouts do not automatically receive a leaf view's typed context.

Each mounted slot instance has its own shell, provider, and layout state. Two separate host mounts do not share provider state. A provider is disposed when its slot mount is removed.

## Build tooling

Run `patchsmith init` to create an app. Choose **Vite+ (recommended)** for building, linting, formatting, and testing, or **Vite (build only)** for a minimal setup. For non-interactive setup, pass `--tooling vite-plus` or `--tooling vite`.

Build tooling lives in the separate [`@patchsmith/vite`](../vite/README.md) package. Both options generate `vite.config.ts` with the Patchsmith plugin. Vite+ apps use:

```ts
import { patchsmith } from "patchsmith/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  plugins: lazyPlugins(() => [patchsmith()]),
  lint: { ignorePatterns: ["patchsmith.gen.ts", ".patchsmith/**"] },
  fmt: { ignorePatterns: ["patchsmith.gen.ts", ".patchsmith/**"] },
});
```

Vite apps import `defineConfig` from `vite` and use `plugins: [patchsmith()]`. They do not install linting, formatting, or test tooling.

Run your package manager's `build` script to build either setup. Vite+ apps also include `check`, `fix`, `format`, and `test` scripts. A global Vite+ installation is not required.

Add aliases, compile-time constants, and custom Vite plugins to `vite.config.ts`. Custom plugins, aliases, and constants also apply to the private server build. Set `build.outDir` to change the output directory; the default is `.patchsmith`. The plugin owns the client entry and the deployable bundle filenames.

The plugin discovers file routes, extracts private instance resolvers, bundles the backend and migrations, copies logos, and writes `patchsmith-upload.json`. `patchsmith deploy` builds using the same Vite configuration before uploading. Keep host, app ID, logos, and backend settings in `patchsmith.config.ts`.

For builds outside the app's directory, pass `patchsmith({ cwd: appDirectory })`. To use a different Patchsmith configuration file, pass `configPath` to the plugin.

File routing is the app client entry point. Generated entries live in the build output and are cleaned up after builds or when a build watcher closes.

## Backend function routers

Bind your database once in `db/index.ts`:

```ts
import { defineDatabase } from "patchsmith/db";
import { createFunctions } from "patchsmith/server";

import { relations } from "./relations";

export const db = defineDatabase({ relations });
export const fn = createFunctions({ database: db });
```

Each function file exports its public router. Handlers receive the scoped database automatically, with read-only access in queries and write access in mutations:

```ts
// functions/tasks.router.ts
import { defineRouter } from "patchsmith/server";

import { fn } from "#db";

const listTasks = fn.query.handler(({ db }) =>
  db.query.tasks.findMany().sync()
);

export default defineRouter({ listTasks });
```

Every app includes a private backend without additional configuration. The builder discovers `functions/**/*.router.ts` and registers each default router automatically; no `server.ts` is needed. Other files remain ordinary helpers.

File paths prefix router keys. Both `billing.invoices.router.ts` and `billing/invoices.router.ts` expose `api.billing.invoices.*`; mixed dots and directories work too. `index.router.ts` creates an `index` namespace. Router objects may nest, so `tasks.router.ts` exporting `defineRouter({ get: { children, parents } })` exposes `api.tasks.get.children` and `api.tasks.get.parents`.

Shared namespaces merge across files. Duplicate callable paths and function/namespace conflicts throw when the server bundle loads, with the API path and both source files. Every namespace and function name must start with a letter and contain at most 64 letters, digits, or underscores. `name` and `then` are reserved because client references use them internally.

Run `patchsmith generate` after adding, moving, or deleting function files. Generated `patchsmith.functions.gen.ts` imports routers only as types; `patchsmith.gen.ts` uses those types for client `api` references. Builds refresh the function registry, and build watch mode tracks new, renamed, and removed modules. Private implementations stay out of the browser bundle.

Actions can import a router from `#functions/tasks.router`, declare `.functions({ tasks })`, and call `queries.tasks.listTasks()`; they receive no direct database handle. Discovery does not grant additional action capabilities.

## Internal functions

Functions are public by default. Add `.internal()` before `.handler()` to restrict a query, mutation, or action to backend execution:

```ts
// functions/tasks.router.ts
import { defineRouter } from "patchsmith/server";

import { fn } from "#db";

const listTasks = fn.query
  .internal()
  .handler(({ db }) => db.query.tasks.findMany({ limit: 100 }).sync());

export default defineRouter({ listTasks });
```

The builder discovers this router alongside public routers. An action importing it as `tasks` and declaring `.functions({ tasks })` can call `queries.tasks.listTasks()`. Internal mutations work through the action's `mutations` namespace with the same transaction and retry behavior as public mutations. Generated view instance resolvers can also read registered internal queries.

Internal functions are omitted from the typed client `api`, including namespaces with no public functions. The runtime rejects direct client calls and query subscriptions with `NOT_FOUND`, even when the caller supplies the function name manually. Visibility is enforced before mutation receipt lookup, so a client cannot replay the result of an internal mutation.

`.internal()` preserves input/output schemas and database capabilities, and can appear anywhere before `.handler()`. Action dependencies may include queries, mutations, and actions.

New backend builds require the `internal-functions` and `nested-actions` runtime capabilities, including apps without hooks. Deploy the updated apps worker before using the updated SDK and builder; older workers reject these bundles as incompatible.

## Host hooks

Hosts declare hooks in their contract. Apps implement any subset of them in `hooks`:

```text
hooks/
  sync.hook.ts                 → sync
  customers/sync.hook.ts       → customers.sync
  billing.updated.hook.ts      → billing.updated
  helpers.ts                  → ordinary supporting module
```

Each hook file default-exports `defineHook` from `patchsmith/server`. The required `hook` string supplies input and output types from the generated host bindings and must match the file path. Duplicate names and mismatches fail the build. Regenerate bindings after changing the host contract or registered app functions.

```ts
// hooks/sync.hook.ts
import { defineHook } from "patchsmith/server";

export default defineHook({
  hook: "sync",
  handler: async ({ input, actions }) => {
    return await actions.customers.sync(input);
  },
});
```

The example assumes the app server registers `customers.sync`. Hook handlers receive typed `queries`, `mutations`, and `actions` for all discovered function routers, plus server `tools`, `identity`, `scope`, `requestId`, and `signal`. They receive no direct database handle. Ordinary actions can call other actions declared through `.functions(...)` using `actions` as well.

Hook files are discovered automatically and bundled only into the private server bundle. Hook files do not need manual registration. Watch builds discover added, renamed, and removed hook files. Deployment typechecks include discovered hooks.

Only host-issued sessions granting the named hook can invoke its handler. Browser backend sessions cannot invoke hooks. Actions and other hooks cannot dispatch hooks through nested action calls. Nested actions retain the caller's identity and cancellation; their query and mutation access follows their own `.functions(...)` declarations. Calls after completion or cancellation fail.

Hooks use the existing action lifetime and execution limits. Invocation waits for completion and does not automatically retry, schedule continuations, or provide durable execution. Keep sync batches bounded and make host writes safe to repeat.
