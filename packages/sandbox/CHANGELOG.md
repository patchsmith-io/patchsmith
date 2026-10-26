# @patchsmith/sandbox

## 0.1.0-beta.70

### Patch Changes

- Updated dependencies [1d21d1b]
  - @patchsmith/core@0.1.0-beta.70
  - @patchsmith/app@0.1.0-beta.70

## 0.1.0-beta.69

### Patch Changes

- Updated dependencies [2ac11bc]
  - @patchsmith/app@0.1.0-beta.69
  - @patchsmith/core@0.1.0-beta.69

## 0.1.0-beta.68

### Patch Changes

- a023f8b: Publish files from an app's `assets/` directory with SHA-256 URLs that remain stable across deployments. Resolve files with `assetUrl()` from `patchsmith/client` or Vite `?url` imports. Deployments track their asset references and reuse existing uploads. Each deployment supports up to 256 static assets, including logos. Static files share the 10 MiB deployment budget with client code and server code before and after compression, including reused assets. Upgrade the platform database and backend, then the host SDK, before deploying apps with assets.

  Breaking: logos now reference files inside `assets/`, using paths such as `logos: { light: "logo-light.svg", dark: "logo-dark.svg" }`. Move logo files into `assets/` and remove the directory prefix from config. Logos use the same hashed URLs, deployment references, uploads, verification, and size accounting as other assets; a file used by both variants counts once. The deployment API accepts logo paths instead of separate file metadata and no longer returns dedicated logo uploads. Old logo URLs and deployment logo file references are removed; redeploy apps after upgrading.

- Updated dependencies [a023f8b]
  - @patchsmith/app@0.1.0-beta.68
  - @patchsmith/core@0.1.0-beta.68

## 0.1.0-beta.67

### Patch Changes

- @patchsmith/app@0.1.0-beta.67
  - @patchsmith/core@0.1.0-beta.67

## 0.1.0-beta.66

### Patch Changes

- Updated dependencies [7ab8c01]
  - @patchsmith/app@0.1.0-beta.66
  - @patchsmith/core@0.1.0-beta.66

## 0.1.0-beta.65

### Patch Changes

- Updated dependencies [416cd4c]
- Updated dependencies [92fd903]
  - @patchsmith/core@0.1.0-beta.65
  - @patchsmith/app@0.1.0-beta.65

## 0.1.0-beta.64

### Patch Changes

- Updated dependencies [cb4001c]
- Updated dependencies [39bb8e4]
- Updated dependencies [ed31e0e]
  - @patchsmith/core@0.1.0-beta.64
  - @patchsmith/app@0.1.0-beta.64

## 0.1.0-beta.63

### Minor Changes

- 29d4061: Pace canvas draws on the host clock so Chrome's hidden-iframe timer throttling does not reduce requested frame rates to roughly one frame per second. Preserve cancellation, backpressure, and host frame-rate limits, including draws that skip bitmap presentation.

  The experimental canvas surface now requires `waitForFrame(milliseconds, signal)`, and capped or skipped draws use a new pacing exchange. Upgrade the host SDK before rebuilding installed apps with this release. Existing apps remain supported by the upgraded host. Custom surface implementations must provide the cancellable wait method.

### Patch Changes

- Updated dependencies [29d4061]
  - @patchsmith/app@0.1.0-beta.63
  - @patchsmith/core@0.1.0-beta.63

## 0.1.0-beta.62

### Patch Changes

- @patchsmith/app@0.1.0-beta.62
  - @patchsmith/core@0.1.0-beta.62

## 0.1.0-beta.61

### Patch Changes

- Updated dependencies [dfca420]
  - @patchsmith/app@0.1.0-beta.61
  - @patchsmith/core@0.1.0-beta.61

## 0.1.0-beta.60

### Patch Changes

- @patchsmith/app@0.1.0-beta.60
  - @patchsmith/core@0.1.0-beta.60

## 0.1.0-beta.59

### Patch Changes

- Updated dependencies [07731b1]
- Updated dependencies [c96def0]
  - @patchsmith/core@0.1.0-beta.59
  - @patchsmith/app@0.1.0-beta.59

## 0.1.0-beta.58

### Patch Changes

- Updated dependencies [bb541bb]
  - @patchsmith/core@0.1.0-beta.58
  - @patchsmith/app@0.1.0-beta.58

## 0.1.0-beta.57

### Patch Changes

- Updated dependencies [a963f46]
  - @patchsmith/core@0.1.0-beta.57
  - @patchsmith/app@0.1.0-beta.57

## 0.1.0-beta.56

### Patch Changes

- Updated dependencies [74a7a6b]
  - @patchsmith/core@0.1.0-beta.56
  - @patchsmith/app@0.1.0-beta.56

## 0.1.0-beta.55

### Minor Changes

- 7f5d15b: Add experimental opt-in canvas surfaces to the low-level iframe sandbox. Hosts register named canvases; apps render with OffscreenCanvas and transfer complete ImageBitmap frames over a dedicated, backpressured channel. The host validates frame dimensions, limits presentation rate, and can revoke surfaces without granting app code access to host DOM.

  Expose experimental_canvas() contract declarations, experimental_canvasRenderer for React hosts, and experimental_useCanvasSurface() for apps, with automatic mounting, resize, dependency redraws, and cleanup. Prefix all canvas public APIs and types with experimental_, including the low-level experimental_requestCanvas() and experimental_registerCanvas() APIs.

  Add create/resize/update/draw/dispose lifecycles with separate creation and update dependencies with cancellation, bounded recovery, invalidation, and optional preserved drawing buffers. Hosts can opt into bounded pointer events and focused, allowlisted keyboard input; apps receive local synthetic canvas events without host DOM references or privileged host operations.

  Add optional app-requested frame rates and timestamp/deltaTime draw contexts. Returning false from a draw callback skips bitmap creation and presentation; continuous skipped frames yield and pending scheduling waits cancel on teardown. Existing void-returning callbacks retain their behavior.

  Permit JavaScript string evaluation and WebAssembly compilation with unsafe-eval inside the opaque-origin iframe. Host DOM isolation, host capability validation, and the worker ban remain enforced.

### Patch Changes

- 2b3e206: Prevent redundant canvas ready notifications, apply frame-rate changes promptly, and release initializing surfaces when cancelled. Keep host presentation progressing while the document is hidden and correct generated usage guidance for components without children.
- Updated dependencies [2b3e206]
- Updated dependencies [7f5d15b]
  - @patchsmith/app@0.1.0-beta.55
  - @patchsmith/core@0.1.0-beta.55

## 0.1.0-beta.54

### Patch Changes

- Updated dependencies [d26ee48]
  - @patchsmith/core@0.1.0-beta.54
  - @patchsmith/app@0.1.0-beta.54

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
  - @patchsmith/app@0.1.0-beta.53
  - @patchsmith/core@0.1.0-beta.53

## 0.1.0-beta.52

### Minor Changes

- 1fa87fe: Remove legacy session and CLI credential shapes. App sessions now require complete identity metadata, including `identity.subjectId` and `identity.toolUrl`; remove the duplicate top-level subject from host responses and the duplicate top-level tool URL from platform responses. The host forwards the platform session without synthesizing a subject. Share the session validator with the iframe protocol so complete authenticated sessions reach sandboxed apps.

  Custom session providers must return `{ expiresAt, identity, token, url }` with a complete identity. Stored CLI credentials must contain a named scope; delete obsolete entries from `~/.patchsmith/auth.json` and log in again to replace flat-scope or scopeless credentials.

### Patch Changes

- Updated dependencies [1fa87fe]
  - @patchsmith/app@0.1.0-beta.52
  - @patchsmith/core@0.1.0-beta.52

## 0.1.0-beta.51

### Minor Changes

- 38e1ced: Require a nonempty `subjectId` in authenticated host contexts, MCP transports, backend sessions, and signed app/tool credentials. App functions and host tools can now rely on `identity.subjectId` being a string.

  Update every host `authenticate()` callback and `server.mcp.transport()` call to supply the authenticated user's stable ID, or a stable service-principal ID for automation. Values must contain 1–256 characters. Return `null` for unauthenticated callers; client-provided IDs and installation-ID fallbacks do not establish a principal.

  Upgrade host integrations before enforcing the new platform/runtime contracts. Existing sessions and signed credentials without a subject are rejected and must be reissued after the host is updated.

### Patch Changes

- Updated dependencies [8cbc3d5]
- Updated dependencies [38e1ced]
  - @patchsmith/core@0.1.0-beta.51
  - @patchsmith/app@0.1.0-beta.51

## 0.1.0-beta.50

### Minor Changes

- 71fc3a7: Return component callback results across the sandbox bridge instead of dropping them. Callback definitions use only input and output schemas. App callbacks accept direct or promised results, and every host callback returns a promise, including callbacks without an output schema. Callback failures, sandbox destruction, and a 30-second timeout reject pending results.

### Patch Changes

- Updated dependencies [71fc3a7]
  - @patchsmith/core@0.1.0-beta.50
  - @patchsmith/app@0.1.0-beta.50

## 0.1.0-beta.49

### Patch Changes

- @patchsmith/app@0.1.0-beta.49
  - @patchsmith/core@0.1.0-beta.49

## 0.1.0-beta.48

### Patch Changes

- Updated dependencies [6a5c17a]
  - @patchsmith/app@0.1.0-beta.48
  - @patchsmith/core@0.1.0-beta.48

## 0.1.0-beta.47

### Patch Changes

- @patchsmith/app@0.1.0-beta.47
  - @patchsmith/core@0.1.0-beta.47

## 0.1.0-beta.46

### Patch Changes

- Updated dependencies [20947c7]
  - @patchsmith/app@0.1.0-beta.46
  - @patchsmith/core@0.1.0-beta.46

## 0.1.0-beta.45

### Patch Changes

- @patchsmith/app@0.1.0-beta.45
  - @patchsmith/core@0.1.0-beta.45

## 0.1.0-beta.44

### Patch Changes

- Restore the 0.x beta release line after the accidental 1.0.0-beta.44 release. This release includes the app slug and validation changes from that release; use 0.1.0-beta.44 instead of 1.0.0-beta.44.
- Updated dependencies [89d328f]
- Updated dependencies
- Updated dependencies [1fb0155]
  - @patchsmith/core@0.1.0-beta.44
  - @patchsmith/app@0.1.0-beta.44

## 1.0.0-beta.44

### Patch Changes

- Updated dependencies [89d328f]
- Updated dependencies [1fb0155]
  - @patchsmith/core@1.0.0-beta.44
  - @patchsmith/app@1.0.0-beta.44

## 0.1.0-beta.43

### Patch Changes

- Updated dependencies [6a68ba5]
  - @patchsmith/core@0.1.0-beta.43
  - @patchsmith/app@0.1.0-beta.43

## 0.1.0-beta.42

### Minor Changes

- c54e0b1: Remove Patchsmith app previews, including the `patchsmith preview` command, host preview consent and configuration, platform preview APIs and schemas, client preview metadata and stores, live revision subscriptions, and sandbox inline-source loading. Use deployed app builds for host integrations.

### Patch Changes

- Updated dependencies [c54e0b1]
  - @patchsmith/core@0.1.0-beta.42
  - @patchsmith/app@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- @patchsmith/app@0.1.0-beta.41
  - @patchsmith/core@0.1.0-beta.41

## 0.1.0-beta.40

### Patch Changes

- Updated dependencies [b636758]
  - @patchsmith/core@0.1.0-beta.40
  - @patchsmith/app@0.1.0-beta.40

## 0.1.0-beta.39

### Patch Changes

- Updated dependencies [ad770d2]
  - @patchsmith/core@0.1.0-beta.39
  - @patchsmith/app@0.1.0-beta.39

## 0.1.0-beta.38

### Patch Changes

- Updated dependencies [469d8c2]
  - @patchsmith/core@0.1.0-beta.38
  - @patchsmith/app@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- Updated dependencies [0d72562]
  - @patchsmith/core@0.1.0-beta.37
  - @patchsmith/app@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- Updated dependencies [c0ce502]
  - @patchsmith/core@0.1.0-beta.36
  - @patchsmith/app@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- @patchsmith/app@0.1.0-beta.35
  - @patchsmith/core@0.1.0-beta.35

## 0.1.0-beta.34

### Patch Changes

- Updated dependencies [82aa45f]
  - @patchsmith/core@0.1.0-beta.34
  - @patchsmith/app@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- Updated dependencies [a215860]
  - @patchsmith/core@0.1.0-beta.33
  - @patchsmith/app@0.1.0-beta.33

## 0.1.0-beta.32

### Patch Changes

- @patchsmith/core@0.1.0-beta.32
  - @patchsmith/app@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- 4d2f904: Align source code with Ultracite’s default Oxlint and Oxfmt presets while preserving public APIs and runtime lifecycle behavior.
- Updated dependencies [4d2f904]
  - @patchsmith/app@0.1.0-beta.31
  - @patchsmith/core@0.1.0-beta.31

## 0.1.0-beta.30

### Patch Changes

- Updated dependencies [f8dce5d]
- Updated dependencies [29f3e30]
  - @patchsmith/app@0.1.0-beta.30
  - @patchsmith/core@0.1.0-beta.30

## 0.1.0-beta.29

### Patch Changes

- Updated dependencies [3567f94]
  - @patchsmith/core@0.1.0-beta.29
  - @patchsmith/app@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- Updated dependencies [a0ffa4f]
  - @patchsmith/core@0.1.0-beta.28
  - @patchsmith/app@0.1.0-beta.28

## 0.1.0-beta.27

### Patch Changes

- Updated dependencies [21761f2]
- Updated dependencies [4685874]
  - @patchsmith/core@0.1.0-beta.27
  - @patchsmith/app@0.1.0-beta.27

## 0.1.0-beta.26

### Minor Changes

- 274ead8: Replace Zod with Valibot for iframe message validation to reduce the sandbox browser bundle. Preserve strict message validation, recursive remote trees, and session limits. Exported protocol schemas are now Valibot schemas; use Valibot `parse` or `safeParse` instead of Zod schema methods.

### Patch Changes

- Updated dependencies [3fa95bc]
  - @patchsmith/core@0.1.0-beta.26
  - @patchsmith/app@0.1.0-beta.26

## 0.1.0-beta.25

### Patch Changes

- Updated dependencies [441a5a9]
  - @patchsmith/app@0.1.0-beta.25
  - @patchsmith/core@0.1.0-beta.25

## 0.1.0-beta.24

### Patch Changes

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

- Updated dependencies [057cfde]
- Updated dependencies [4985d4e]
  - @patchsmith/app@0.1.0-beta.24
  - @patchsmith/core@0.1.0-beta.24

## 0.1.0-beta.23

### Patch Changes

- @patchsmith/app@0.1.0-beta.23
  - @patchsmith/core@0.1.0-beta.23

## 0.1.0-beta.22

### Patch Changes

- Updated dependencies [c29880d]
- Updated dependencies [268df1e]
  - @patchsmith/app@0.1.0-beta.22
  - @patchsmith/core@0.1.0-beta.22

## 0.1.0-beta.21

### Patch Changes

- 1c52fe8: Add minimal package READMEs with readable names and short descriptions.
- Updated dependencies [1c52fe8]
  - @patchsmith/app@0.1.0-beta.21
  - @patchsmith/core@0.1.0-beta.21

## 0.1.0-beta.20

### Patch Changes

- Updated dependencies [a2ed82b]
- Updated dependencies [fc09d5b]
  - @patchsmith/core@0.1.0-beta.20
  - @patchsmith/app@0.1.0-beta.20

## 0.1.0-beta.19

### Minor Changes

- fa05f02: Breaking change: replace `AppView` and `AppViewProps` with client-bound `Slot` and `Slot.Controlled`. Use `<Slot app={app} name="panel" />` for registered view matching. For explicit rendering, `Slot.Controlled` requires a view, status, and complete combined context when ready, and renders the exact view without reading the registry or falling back to ancestors. The old `fallback` and `createIframe` props are no longer exposed.
- fa05f02: Render dynamic view instances with `Slot instanceKey` or an explicit `Slot.Controlled instance`. Pass the selected instance through the sandbox and expose its validated data through the typed `view.useInstance()` hook. Handle pending requests, resolver errors, and missing keys, and reset view component state when the selected key changes.

### Patch Changes

- fa05f02: Add client-bound `useSlotInstances({ app, slot })` to fetch instances through the authenticated app action endpoint using the matching view and registered ancestor context. Expose loading, errors, and refetch; clear stale data when context or deployment changes. Preserve disabled view paths in manifests so host matching respects blocked fallback, while keeping them out of `useViews` discovery.
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
  - @patchsmith/app@0.1.0-beta.19
  - @patchsmith/core@0.1.0-beta.19

## 0.1.0-beta.18

### Patch Changes

- Updated dependencies [fc9538d]
- Updated dependencies [6f969e3]
- Updated dependencies [731e066]
  - @patchsmith/app@0.1.0-beta.18
  - @patchsmith/core@0.1.0-beta.18

## 0.1.0-beta.17

### Patch Changes

- Updated dependencies [ba00155]
- Updated dependencies [364d5cd]
- Updated dependencies [d586115]
  - @patchsmith/core@0.1.0-beta.17
  - @patchsmith/app@0.1.0-beta.17

## 0.1.0-beta.16

### Minor Changes

- b5c6afc: Consolidate the app SDK in @patchsmith/app and expose app client APIs through patchsmith/client and server APIs through patchsmith/server. Provide SQLite schema builders, synchronous Zod-validated queries/mutations, asynchronous external actions, atomic mutation receipts and typed browser references. Use oRPC v2 HTTP for direct sandbox calls and WebSockets for server-driven query snapshots; the bridge supplies scoped platform JWTs and renews authentication. Execute queries, mutations and actions in one private Cloudflare facet, with an ALS-backed fetch guard and local action query/mutation calls and scoped capabilities for HTTPS egress. Keep synchronous database transactions atomic. Actions do not retry automatically or hold database transactions across external work. Track table dependencies and rerun only active affected queries after commit.

  Upload client and private server bundles with committed Drizzle migrations to separate blob prefixes and load published code into isolated Dynamic Worker SQLite facets through apps/apps-worker. Keep stable installation databases across deployments, trusted Effect v4 coordination, and client-only app compatibility. Store migration sources in migrations/ and copy them to .patchsmith/migrations/. Generate migrations explicitly through patchsmith db generate using Drizzle Kit and the existing Patchsmith config, without a separate Drizzle config; builds check the current schema against the latest saved snapshot without rewriting history. Apply pending migrations atomically to each installation before database calls.

  Retire the legacy app-storage SDK, app-platform package, storage CLI commands and bridged database calls. Keep the Apache-2.0 oRPC contract in @patchsmith/app/protocol and execution in the private BUSL-1.1 apps-worker worker. Share private app JWT signing/verification through @patchsmith/api-utils/app-auth, and expose host authorization through backend.resolveInstallation and /backend/session. Effect stays in server auth and trusted runtime code, outside browser entry points.

  Support client.entry and server.entry in patchsmith.config.ts, defaulting to src/client.ts and src/server.ts. Build, deployment type checks, browser/server isolation and API type imports follow the configured entries.

  Share duplicate reactive queries with TanStack Store and retry transient mutation failures with stable receipt IDs. Inline dynamic server imports into one upload, typecheck both app entries, preserve session error codes through the iframe bridge, and mount opaque-origin sandboxes without waiting for backend authentication. Cache published deployment metadata in Cloudflare KV, update it through an authenticated platform-to-worker endpoint, and populate cache misses through the platform API. Existing clients reconnect to the latest server without remounting; deployments must maintain client compatibility.

### Patch Changes

- 71ad08c: Allow sandboxed apps to make direct HTTPS requests and secure WebSocket connections while retaining opaque-origin isolation.
- Updated dependencies [14980bc]
- Updated dependencies [b5c6afc]
- Updated dependencies [efdac76]
  - @patchsmith/core@0.1.0-beta.16
  - @patchsmith/app@0.1.0-beta.16

## 0.1.0-beta.15

### Patch Changes

- @patchsmith/core@0.1.0-beta.15

## 0.1.0-beta.14

### Patch Changes

- e06e450: Upload complete preview builds to KV in bounded oRPC chunks, accept previews through a host consent page, and stream verified revisions to sandboxed app views.
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

## 0.1.0-beta.7

### Patch Changes

- d75e2fe: Fix Patchsmith sandbox workers served from package paths by Vite development servers so injected HMR imports resolve inside the isolated worker runtime.

## 0.1.0-beta.6

### Patch Changes

- a33af95: Send same-origin credentials when loading the sandbox runtime so protected preview deployments can serve the emitted worker asset.

## 0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- 324b281: Resolve public packages to compiled distribution files in both development and production, without custom source export conditions.

  Remove stale source aliases and declaration maps that reference unpublished source files. Generate apps with a single patchsmith dependency and its app subpath exports.

## 0.1.0-beta.3

### Patch Changes

- a02ebee: Include development export targets in published packages so Vite consumers do not need custom resolution conditions. Expose app authoring from `patchsmith/app` and `patchsmith/app/config`.

## 0.1.0-beta.2

## 0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 4230689: Publish the initial Patchsmith beta packages.
