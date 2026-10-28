# @patchsmith/app

## 0.1.0-beta.72

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.72

## 0.1.0-beta.71

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.71

## 0.1.0-beta.70

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.70

## 0.1.0-beta.69

### Minor Changes

- 2ac11bc: Default new apps to root-level source and support an optional `src/` source tree with `patchsmith init --src-dir`. Views, functions, hooks, database paths, generated bindings, and watch builds use the same detected source root. Keep app source directories together; mixed root and `src/` layouts fail.

  Move the shared frontend shell from `root.tsx` to `slots/root.tsx` (or from `src/root.tsx` to `src/slots/root.tsx`). This is a breaking change: move existing shells to the new location and run `patchsmith generate`. Configuration, environment files, assets, and explicit migration paths remain relative to the project root. Update package import aliases and TypeScript includes if moving an existing app out of `src/`.

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.69

## 0.1.0-beta.68

### Patch Changes

- a023f8b: Publish files from an app's `assets/` directory with SHA-256 URLs that remain stable across deployments. Resolve files with `assetUrl()` from `patchsmith/client` or Vite `?url` imports. Deployments track their asset references and reuse existing uploads. Each deployment supports up to 256 static assets, including logos. Static files share the 10 MiB deployment budget with client code and server code before and after compression, including reused assets. Upgrade the platform database and backend, then the host SDK, before deploying apps with assets.

  Breaking: logos now reference files inside `assets/`, using paths such as `logos: { light: "logo-light.svg", dark: "logo-dark.svg" }`. Move logo files into `assets/` and remove the directory prefix from config. Logos use the same hashed URLs, deployment references, uploads, verification, and size accounting as other assets; a file used by both variants counts once. The deployment API accepts logo paths instead of separate file metadata and no longer returns dedicated logo uploads. Old logo URLs and deployment logo file references are removed; redeploy apps after upgrading.

- @patchsmith/app-db@0.1.0-beta.68

## 0.1.0-beta.67

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.67

## 0.1.0-beta.66

### Minor Changes

- 7ab8c01: Add `instances.cache: "static"` to evaluate instance resolvers during the build, validate their JSON-compatible output, and publish the snapshot with the deployment. The platform resolves static entries without an app runtime session or Cloudflare resolver call. Omitted cache policies and `cache: "none"` retain runtime resolution; client response caching is unchanged.

  Static resolvers take no request arguments and are excluded from deployed bundles. Deploy platform and host support before publishing apps that use static instances.

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.66

## 0.1.0-beta.65

### Minor Changes

- 92fd903: Add host-defined hooks with typed app handlers discovered from `src/hooks/**/*.hook.ts`. Hosts can discover supporting installations and invoke hooks with validated inputs, outputs, scopes, and hook-specific sessions. Hooks can only be invoked by the host, not through nested action calls. Both hook methods accept `scopes` and `subjectId` directly in their options. App authors use `defineHook`; hook registration stays in the builder-only internal server entry point. Handlers can call registered app queries, mutations, actions, and host server tools. Actions can also call other declared actions with the same identity and cancellation lifetime.

  Synchronous schema serialization treats asynchronous validators as required in generated hook and view bindings.

  Hook names are stored on deployments and exposed through installation metadata, so hosts can discover support without calling app runtimes. Existing deployments and older uploaders default to no hooks; rebuild and republish to advertise hook support.

  All rebuilt server bundles require a runtime supporting `nested-actions`; hook-enabled builds also require `hooks`. Older runtimes reject these bundles, including apps without hooks. Deploy the database migration first, then the updated platform and app runtime before publishing the updated SDK or rebuilding apps. Scheduling and durable retries remain controlled by the host.

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.65

## 0.1.0-beta.64

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.64

## 0.1.0-beta.63

### Minor Changes

- 29d4061: Pace canvas draws on the host clock so Chrome's hidden-iframe timer throttling does not reduce requested frame rates to roughly one frame per second. Preserve cancellation, backpressure, and host frame-rate limits, including draws that skip bitmap presentation.

  The experimental canvas surface now requires `waitForFrame(milliseconds, signal)`, and capped or skipped draws use a new pacing exchange. Upgrade the host SDK before rebuilding installed apps with this release. Existing apps remain supported by the upgraded host. Custom surface implementations must provide the cancellable wait method.

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.63

## 0.1.0-beta.62

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.62

## 0.1.0-beta.61

### Minor Changes

- dfca420: Add `.internal()` to app query, mutation, and action builders. Internal functions stay registered for backend execution and are omitted from the typed client API. The runtime rejects direct client calls and subscriptions, including mutation receipt replays, while declared action dependencies and view instance resolvers can call internal queries and mutations.

  Backend builds now require the `internal-functions` runtime capability. Deploy the updated apps worker before upgrading the SDK and builder; older workers reject new bundles rather than ignore internal visibility. Existing function definitions remain public by default. Actions continue to call queries and mutations only; this does not add action-to-action calls.

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.61

## 0.1.0-beta.60

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.60

## 0.1.0-beta.59

### Minor Changes

- c96def0: Register app backend routers automatically from `src/functions/**/*.fn.ts`, replacing the app's `server.ts` entry and `server.entry` configuration. Dots and directories create equivalent namespaces, nested router objects remain supported, and shared namespaces merge. Duplicate functions and function/namespace conflicts throw when the server bundle loads, with their API path and source files. Builds bundle backend code without executing it. Watch builds refresh registrations and generated type-only API bindings as modules change.

  Reject `name` and `then` in every function and namespace segment because those names conflict with client reference properties. The manual `defineServer` composition API is removed; backend registration is owned by file discovery.

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.59

## 0.1.0-beta.58

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.58

## 0.1.0-beta.57

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.57

## 0.1.0-beta.56

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.56

## 0.1.0-beta.55

### Minor Changes

- 7f5d15b: Add experimental opt-in canvas surfaces to the low-level iframe sandbox. Hosts register named canvases; apps render with OffscreenCanvas and transfer complete ImageBitmap frames over a dedicated, backpressured channel. The host validates frame dimensions, limits presentation rate, and can revoke surfaces without granting app code access to host DOM.

  Expose experimental_canvas() contract declarations, experimental_canvasRenderer for React hosts, and experimental_useCanvasSurface() for apps, with automatic mounting, resize, dependency redraws, and cleanup. Prefix all canvas public APIs and types with experimental_, including the low-level experimental_requestCanvas() and experimental_registerCanvas() APIs.

  Add create/resize/update/draw/dispose lifecycles with separate creation and update dependencies with cancellation, bounded recovery, invalidation, and optional preserved drawing buffers. Hosts can opt into bounded pointer events and focused, allowlisted keyboard input; apps receive local synthetic canvas events without host DOM references or privileged host operations.

  Add optional app-requested frame rates and timestamp/deltaTime draw contexts. Returning false from a draw callback skips bitmap creation and presentation; continuous skipped frames yield and pending scheduling waits cancel on teardown. Existing void-returning callbacks retain their behavior.

  Permit JavaScript string evaluation and WebAssembly compilation with unsafe-eval inside the opaque-origin iframe. Host DOM isolation, host capability validation, and the worker ban remain enforced.

### Patch Changes

- 2b3e206: Prevent redundant canvas ready notifications, apply frame-rate changes promptly, and release initializing surfaces when cancelled. Keep host presentation progressing while the document is hidden and correct generated usage guidance for components without children.
- @patchsmith/app-db@0.1.0-beta.55

## 0.1.0-beta.54

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.54

## 0.1.0-beta.53

### Minor Changes

- e96dce2: Rename TailorKit to Patchsmith. Install `patchsmith` and `@patchsmith/*` packages, replace `TailorKit`/`tailorkit` identifiers with `Patchsmith`/`patchsmith`, and use the `patchsmith` CLI. Rename `tailorkit.config.ts` to `patchsmith.config.ts`, regenerate app bindings with `patchsmith generate`, and update imports to `#patchsmith` and `src/patchsmith.gen.ts`.

  Move platform URLs to `https://patchsmith.io` and host integration routes to `/api/patchsmith`. Rename `TAILORKIT_*` environment variables to `PATCHSMITH_*`; app output and local credential directories now use `.patchsmith`. Sign in again after upgrading. Hosted app assets and RPC URLs continue to use `tailorkit.app`.

- 1912070: Build packages with Vite+ instead of tsup while preserving public entry points and declaration paths.

  Drop Node.js 20 support and target Node.js 22 for all public packages, including the CLI and sandbox library. Use Node.js 22 or newer. Public package manifests and generated apps declare `engines.node: ">=22"`. Internal builds and workspace manifests require Node.js 24.

### Patch Changes

- d799743: Update package repository links to `patchsmith-io/patchsmith`.
- Updated dependencies [d799743]
- Updated dependencies [e96dce2]
- Updated dependencies [1912070]
  - @patchsmith/app-db@0.1.0-beta.53

## 0.1.0-beta.52

### Minor Changes

- 1fa87fe: Remove legacy session and CLI credential shapes. App sessions now require complete identity metadata, including `identity.subjectId` and `identity.toolUrl`; remove the duplicate top-level subject from host responses and the duplicate top-level tool URL from platform responses. The host forwards the platform session without synthesizing a subject. Share the session validator with the iframe protocol so complete authenticated sessions reach sandboxed apps.

  Custom session providers must return `{ expiresAt, identity, token, url }` with a complete identity. Stored CLI credentials must contain a named scope; delete obsolete entries from `~/.patchsmith/auth.json` and log in again to replace flat-scope or scopeless credentials.

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.52

## 0.1.0-beta.51

### Minor Changes

- 38e1ced: Require a nonempty `subjectId` in authenticated host contexts, MCP transports, backend sessions, and signed app/tool credentials. App functions and host tools can now rely on `identity.subjectId` being a string.

  Update every host `authenticate()` callback and `server.mcp.transport()` call to supply the authenticated user's stable ID, or a stable service-principal ID for automation. Values must contain 1–256 characters. Return `null` for unauthenticated callers; client-provided IDs and installation-ID fallbacks do not establish a principal.

  Upgrade host integrations before enforcing the new platform/runtime contracts. Existing sessions and signed credentials without a subject are rejected and must be reissued after the host is updated.

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.51

## 0.1.0-beta.50

### Minor Changes

- 71fc3a7: Return component callback results across the sandbox bridge instead of dropping them. Callback definitions use only input and output schemas. App callbacks accept direct or promised results, and every host callback returns a promise, including callbacks without an output schema. Callback failures, sandbox destruction, and a 30-second timeout reject pending results.

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.50

## 0.1.0-beta.49

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.49

## 0.1.0-beta.48

### Minor Changes

- 6a5c17a: Add `createFunctions({ database })` to bind database types and relations once for all query and mutation handlers. Add `defineRouter` for explicit function module exports composed in `defineServer`.

  Remove per-function `.database(...)` builders and the `database` option on standalone query/mutation definitions. Configure `createFunctions({ database })` once in the shared database module and import its `fn` in function modules.

  New apps scaffold the shared `fn`, default router exports, and a namespaced greeting at `api.greeting.getGreeting`. Export each function module with `export default defineRouter({ ... })` and import its default router in the server entry point.

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.48

## 0.1.0-beta.47

### Patch Changes

- @patchsmith/app-db@0.1.0-beta.47

## 0.1.0-beta.46

### Minor Changes

- 20947c7: Move the app database API into the new `@patchsmith/app-db` package, exposed through `patchsmith/db`. Import `defineDatabase`, table and column builders, query helpers, and database types from `patchsmith/db` instead of `patchsmith/server`.

  Use Patchsmith's `defineRelations` from `patchsmith/db` instead of importing it directly from `drizzle-orm`. New apps scaffold these imports automatically. Existing relation callbacks keep the same typed one/many navigation syntax.

### Patch Changes

- Updated dependencies [20947c7]
  - @patchsmith/app-db@0.1.0-beta.46

## 0.1.0-beta.45

No changes in this release.

## 0.1.0-beta.44

### Patch Changes

- Restore the 0.x beta release line after the accidental 1.0.0-beta.44 release. This release includes the app slug and validation changes from that release; use 0.1.0-beta.44 instead of 1.0.0-beta.44.
- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.

## 1.0.0-beta.44

### Patch Changes

- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.

## 0.1.0-beta.43

No changes in this release.

## 0.1.0-beta.42

No changes in this release.

## 0.1.0-beta.41

No changes in this release.

## 0.1.0-beta.40

No changes in this release.

## 0.1.0-beta.39

No changes in this release.

## 0.1.0-beta.38

No changes in this release.

## 0.1.0-beta.37

### Patch Changes

- 0d72562: Name empty contract tables and server function defaults with the exported EmptyDefinitionMap and EmptyFunctions types while preserving their key inference.

## 0.1.0-beta.36

No changes in this release.

## 0.1.0-beta.35

No changes in this release.

## 0.1.0-beta.34

No changes in this release.

## 0.1.0-beta.33

No changes in this release.

## 0.1.0-beta.32

No changes in this release.

## 0.1.0-beta.31

### Patch Changes

- 4d2f904: Align source code with Ultracite’s default Oxlint and Oxfmt presets while preserving public APIs and runtime lifecycle behavior.

## 0.1.0-beta.30

### Minor Changes

- 29f3e30: Move the complete build pipeline and configuration loading into `@patchsmith/vite`. Build Patchsmith apps with the public `patchsmith()` plugin from `patchsmith/vite`. Init now offers Vite+ (recommended, with linting, formatting and testing) or Vite (build only), with one `vite.config.ts` for app tooling. Deploy builds using the app's Vite configuration and installation.

  Remove `patchsmith build`, `buildApp()`, the init lint/format flags, and build settings in `patchsmith.config.ts`. Set `build.outDir` in `vite.config.ts` instead.

### Patch Changes

- f8dce5d: Rename the app function builder export from `tk` to `fn` and update generated apps to use it from `patchsmith/server`.

## 0.1.0-beta.29

No changes in this release.

## 0.1.0-beta.28

No changes in this release.

## 0.1.0-beta.27

### Minor Changes

- 4685874: Remove the React provider's `subjectId` prop and subject-based cache partitioning and remounting. Providers share their client cache, and backend sessions are cached per app until renewal or an explicit refresh. Remove the session provider's subject cache key and the endpoint client's `setSubject` method; authenticated subject identity continues to come from the server.

  Expose `client.clearCache()` to clear shared app data and backend sessions after host authentication changes.

## 0.1.0-beta.26

No changes in this release.

## 0.1.0-beta.25

### Patch Changes

- 441a5a9: Rename `Slot` to `RenderSlot` (including client-bound `RenderSlot.Controlled`) and replace its `name` prop with `slot`. Rename the public types to `RenderSlotProps`, `ControlledRenderSlotProps`, `RuntimeRenderSlotProps`, `RenderSlotContext`, and `RenderSlotComponent`.

  Remove the standalone `Root` provider and its DOM/render props. Return a client-bound `Provider` from `createPatchsmithClient`, accepting only `children` and `apps`, with the client supplied internally. Export it as `Provider: PatchsmithProvider` alongside the hooks and `RenderSlot`, and wrap host components in `<PatchsmithProvider>`. Export `PatchsmithProviderProps` for the bound provider.

## 0.1.0-beta.24

### Minor Changes

- 057cfde: Scaffold app databases in `src/db` with schema, relations and a `defineDatabase` export. Generate migrations in `src/db/migrations`, support typed synchronous Drizzle relational queries in database handlers.

  Discover app views from `src/slots/<slot-name>/*.view.tsx`, with dotted filenames mapping to nested routes and optional explicit view paths. Add `defineRoute({ shellComponent })` roots and nested slot layouts with a `Route` outlet, preserving shared layout state during navigation. Init generates a root shell with `ClientProvider`.

  Remove manual `defineClient` registration, `client.entry` configuration, and fallback discovery of `src/schema.ts` and root migrations. Apps use the file-based client and `src/db` database layout exclusively.

  Update sandbox diagnostics to describe the generated app client instead of the removed manual client API.

- 4985d4e: Replace `useViewContext`'s status union with `{ context, loading?, error? }` so query data, loading, and errors can be passed together. Keep the view path as the first argument and infer the complete context type from that path. Loading defaults to false, errors take precedence, and loading/error states omit context. Update host examples to use the new API.

  Log diagnostics for ready views with missing required context or context that does not match the server's serialized JSON Schema. Allow omitted optional context, skip loading/error states, and suppress repeated errors for unchanged inputs. Reuse the existing Zod dependency to build JSON Schema context validators.

  Move context registration, status handling, equivalent-value deduplication, metadata observation, and diagnostics into the Nanostores-backed `client-core` view context store. Export shared context types so framework adapters can reuse the behavior. React only registers and unregisters context through its lifecycle effects. Remove React forwarding modules for slot and scope helpers and import them directly from `client-core`. Share view-query options and refetch coordination in `client-core`, including awaiting queries after app-discovery retries.

  Generalize remote view state in `client-core` with Nanostores for runtime status, component registrations, and node selectors. Share iframe lifecycle, prop updates, and callback binding across adapters, keep remote views isolated, and react to component renderer updates without recreating the sandbox.

  Use Nano Stores Async for cached fetching and task tracking, and expose cache snapshots as Nano Stores with immediate subscriber cleanup. Use the official React integration for all React store reads; the Preact adapter continues using the official Preact integration.

  Move app-query filtering and result flags, reactive view-query coordination, managed/controlled slot resolution, instance checks, client URL and remote-prop construction, component aliases and client configuration, server/slot types, and primitive/theme CSS generation into client-core. Framework adapters subscribe to shared stores and provide their own rendering and lifecycle handling. Remove the unused React context memo hook. Add a framework-independent app client connection entry point so client-core and the sandbox host do not load Preact through the app client entry point.

## 0.1.0-beta.23

No changes in this release.

## 0.1.0-beta.22

### Minor Changes

- 268df1e: Require Preact 11 for app builds and newly scaffolded apps. Keep provider disposal and pending-call cancellation synchronous during unmount with layout-effect cleanup.

### Patch Changes

- c29880d: Replace TanStack Store with Nanostores for client fetch caches, preview sessions, view registration, and remote UI node state. Preserve change-only subscriptions, stable snapshots, and batched preview updates. Exposed local `state` stores now use the Nanostores atom API (`get`, `set`, and `listen`).

  Migrate app query, mutation, and action state to Nanostores with its Preact adapter. Preserve shared query subscriptions, selective updates, and protection against stale call results.

## 0.1.0-beta.21

### Patch Changes

- 1c52fe8: Add minimal package READMEs with readable names and short descriptions.

## 0.1.0-beta.20

### Minor Changes

- a2ed82b: Declare multi-instance host slots with `multiple: true` (omitted or false means single-instance). Client-bound `Slot` requires `instanceKey` for multi-instance slots and rejects it for single-instance slots; ready `Slot.Controlled` similarly requires or rejects `instance`.

  Breaking change: rename `createView` to `defineView`, use `defineView({ slot, view, component, ... })` and regenerate app bindings. Multi-instance slots require `instances: { dataSchema, resolve }`; single-instance slots reject it. View registration is restricted to the slot selected in `defineView`. The CLI scaffolds a resolver when the selected host slot supports multiple instances.

## 0.1.0-beta.19

### Minor Changes

- fa05f02: Add colocated `createView` instance resolvers with a validated data schema and automatic, typed access to registered server queries. The app build uses Oxc to extract resolvers and their dependencies into generated server actions through `_patchsmith.instances.resolve`, addressed by slot and view path, keeping their implementations out of browser bundles. Hosts discover instance support through `instances: true` in deployment and preview view manifests.
- fa05f02: Render dynamic view instances with `Slot instanceKey` or an explicit `Slot.Controlled instance`. Pass the selected instance through the sandbox and expose its validated data through the typed `view.useInstance()` hook. Handle pending requests, resolver errors, and missing keys, and reset view component state when the selected key changes.
- fa05f02: Add client-bound useViews with scopes, appIds, and slot filters. App builds and deployments include view manifests, including preview builds. useApps and useViews share one authenticated app request and filter locally; useApps also accepts appIds. Apps without a view manifest must be redeployed to appear in useViews.

### Patch Changes

- fa05f02: Add client-bound `useSlotInstances({ app, slot })` to fetch instances through the authenticated app action endpoint using the matching view and registered ancestor context. Expose loading, errors, and refetch; clear stale data when context or deployment changes. Preserve disabled view paths in manifests so host matching respects blocked fallback, while keeping them out of `useViews` discovery.
- fa05f02: Minify app server bundles with Oxc and allow unused core exports to be tree-shaken, keeping host routing, platform clients, and AI dependencies out of app backends that do not use them.

## 0.1.0-beta.18

### Patch Changes

- fc9538d: Allow the agent command to search existing apps or create a new app when appId is omitted, then save the chosen app ID in the Patchsmith config for future launches.

## 0.1.0-beta.17

### Patch Changes

- 364d5cd: Document PatchsmithConfig options and their defaults in editor tooltips, and generate new app configs with only the host URL so the backend is enabled explicitly.

## 0.1.0-beta.16

### Minor Changes

- b5c6afc: Consolidate the app SDK in @patchsmith/app and expose app client APIs through patchsmith/client and server APIs through patchsmith/server. Provide SQLite schema builders, synchronous Zod-validated queries/mutations, asynchronous external actions, atomic mutation receipts and typed browser references. Use oRPC v2 HTTP for direct sandbox calls and WebSockets for server-driven query snapshots; the bridge supplies scoped platform JWTs and renews authentication. Execute queries, mutations and actions in one private Cloudflare facet, with an ALS-backed fetch guard and local action query/mutation calls and scoped capabilities for HTTPS egress. Keep synchronous database transactions atomic. Actions do not retry automatically or hold database transactions across external work. Track table dependencies and rerun only active affected queries after commit.

  Upload client and private server bundles with committed Drizzle migrations to separate blob prefixes and load published code into isolated Dynamic Worker SQLite facets through apps/apps-worker. Keep stable installation databases across deployments, trusted Effect v4 coordination, and client-only app compatibility. Store migration sources in migrations/ and copy them to .patchsmith/migrations/. Generate migrations explicitly through patchsmith db generate using Drizzle Kit and the existing Patchsmith config, without a separate Drizzle config; builds check the current schema against the latest saved snapshot without rewriting history. Apply pending migrations atomically to each installation before database calls.

  Retire the legacy app-storage SDK, app-platform package, storage CLI commands and bridged database calls. Keep the Apache-2.0 oRPC contract in @patchsmith/app/protocol and execution in the private BUSL-1.1 apps-worker worker. Share private app JWT signing/verification through @patchsmith/api-utils/app-auth, and expose host authorization through backend.resolveInstallation and /backend/session. Effect stays in server auth and trusted runtime code, outside browser entry points.

  Support client.entry and server.entry in patchsmith.config.ts, defaulting to src/client.ts and src/server.ts. Build, deployment type checks, browser/server isolation and API type imports follow the configured entries.

  Share duplicate reactive queries with TanStack Store and retry transient mutation failures with stable receipt IDs. Inline dynamic server imports into one upload, typecheck both app entries, preserve session error codes through the iframe bridge, and mount opaque-origin sandboxes without waiting for backend authentication. Cache published deployment metadata in Cloudflare KV, update it through an authenticated platform-to-worker endpoint, and populate cache misses through the platform API. Existing clients reconnect to the latest server without remounting; deployments must maintain client compatibility.

- efdac76: Breaking change: remove the `loading` and `error` component options from `createView`. Apps must remove these options and provide only `component`. App views now render nothing while host context is loading or in an error state. Internal view states, readiness composition, and ready context access remain unchanged.

## 0.1.0-beta.15

### Patch Changes

- @patchsmith/core@0.1.0-beta.15

## 0.1.0-beta.14

### Patch Changes

- Updated dependencies [e06e450]
  - @patchsmith/core@0.1.0-beta.14

## 0.1.0-beta.13

### Patch Changes

- Updated dependencies [061adb2]
  - @patchsmith/core@0.1.0-beta.13

## 0.1.0-beta.12

### Patch Changes

- @patchsmith/core@0.1.0-beta.12

## 0.1.0-beta.11

### Patch Changes

- @patchsmith/core@0.1.0-beta.11

## 0.1.0-beta.10

### Patch Changes

- Updated dependencies [a0d3233]
  - @patchsmith/core@0.1.0-beta.10

## 0.1.0-beta.9

### Minor Changes

- ced9f2f: Add slot-specific app view selection and layered host views. Host contracts now declare `views` and `slots`; app clients register `slots[name][path]`. Each slot selects one matching view and composes context only from that view and its ancestors. Unsupported matches render nothing, and `false` entries stop fallback.

  React integrations now import `Root`, `AppView`, `useApps`, and `useView` directly. Pass the client to `Root`, add a slot to every app view, publish only each view's own context, and regenerate app bindings. Registries are isolated per root.

  Each slot declares a `views` list typed against the global view definitions. Generated app bindings and explicit host mounts enforce the slot-to-view relationship, and runtime matching only considers supported view paths while retaining inherited ancestor context.

  Publish host view state with `useView(path, { context })` or `useView(path, { status })`.

  The iframe runtime is bundled from TypeScript and accepts only default-exported `defineClient()` clients. Demo clients use that same contract. View ancestry is shared between React, the sandbox, and generated bindings. `Root` supplies one app-discovery state: when `apps` is provided, `useApps()` reads it and skips network discovery.

### Patch Changes

- Updated dependencies [ced9f2f]
  - @patchsmith/core@0.1.0-beta.9

## 0.1.0-beta.8

### Minor Changes

- 9e46a8b: Run app clients directly inside the opaque-origin iframe sandbox while preserving the validated host messaging boundary. Remove the worker runtime and Worker DOM exports, bundle Preact into app clients, preserve typed component props, and use weak callback target references.

### Patch Changes

- @patchsmith/core@0.1.0-beta.8

## 0.1.0-beta.7

### Patch Changes

- 2e7b3a4: Add optional light and dark app logos to the deployment pipeline, including validated SVG, PNG, and WebP uploads, hosted logo URLs, and a 1 MiB combined client asset limit.
- Updated dependencies [2e7b3a4]
  - @patchsmith/core@0.1.0-beta.7

## 0.1.0-beta.6

### Patch Changes

- @patchsmith/core@0.1.0-beta.6

## 0.1.0-beta.5

### Patch Changes

- Updated dependencies [695cdad]
  - @patchsmith/core@0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- 324b281: Resolve public packages to compiled distribution files in both development and production, without custom source export conditions.

  Remove stale source aliases and declaration maps that reference unpublished source files. Generate apps with a single patchsmith dependency and its app subpath exports.

- Updated dependencies [324b281]
  - @patchsmith/core@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- a02ebee: Include development export targets in published packages so Vite consumers do not need custom resolution conditions. Expose app authoring from `patchsmith/app` and `patchsmith/app/config`.
- Updated dependencies [a02ebee]
  - @patchsmith/core@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies [586cc14]
  - @patchsmith/core@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Updated dependencies [c0bdd68]
  - @patchsmith/core@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 4230689: Publish the initial Patchsmith beta packages.

### Patch Changes

- Updated dependencies [4230689]
  - @patchsmith/core@0.1.0-beta.0
