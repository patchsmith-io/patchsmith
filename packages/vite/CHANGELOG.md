# @patchsmith/vite

## 0.1.0-beta.69

### Minor Changes

- 2ac11bc: Default new apps to root-level source and support an optional `src/` source tree with `patchsmith init --src-dir`. Views, functions, hooks, database paths, generated bindings, and watch builds use the same detected source root. Keep app source directories together; mixed root and `src/` layouts fail.

  Move the shared frontend shell from `root.tsx` to `slots/root.tsx` (or from `src/root.tsx` to `src/slots/root.tsx`). This is a breaking change: move existing shells to the new location and run `patchsmith generate`. Configuration, environment files, assets, and explicit migration paths remain relative to the project root. Update package import aliases and TypeScript includes if moving an existing app out of `src/`.

### Patch Changes

- ee0a7c5: Start each new app build with an empty output directory, and remove obsolete static assets during watch rebuilds. Rebuild the upload manifest from current app assets instead of validating a stale manifest during the server build. Apps upgraded from the previous logo format can deploy without manually deleting generated files. Reject output directories that overlap app sources, dependencies, migration sources, or app configuration (including their symlink targets), or traverse output-specific symlinks. Absolute custom output paths normalize inherited app-root and platform-prefix symlinks before cleanup.
- 709922d: Preserve configured resolver options without copying Vite's client defaults into backend and static-instance builds. This removes automatic Node built-in externalization warnings during deployment.
- Updated dependencies [2ac11bc]
  - @patchsmith/app@0.1.0-beta.69

## 0.1.0-beta.68

### Minor Changes

- a023f8b: Publish files from an app's `assets/` directory with SHA-256 URLs that remain stable across deployments. Resolve files with `assetUrl()` from `patchsmith/client` or Vite `?url` imports. Deployments track their asset references and reuse existing uploads. Each deployment supports up to 256 static assets, including logos. Static files share the 10 MiB deployment budget with client code and server code before and after compression, including reused assets. Upgrade the platform database and backend, then the host SDK, before deploying apps with assets.

  Breaking: logos now reference files inside `assets/`, using paths such as `logos: { light: "logo-light.svg", dark: "logo-dark.svg" }`. Move logo files into `assets/` and remove the directory prefix from config. Logos use the same hashed URLs, deployment references, uploads, verification, and size accounting as other assets; a file used by both variants counts once. The deployment API accepts logo paths instead of separate file metadata and no longer returns dedicated logo uploads. Old logo URLs and deployment logo file references are removed; redeploy apps after upgrading.

### Patch Changes

- Updated dependencies [a023f8b]
  - @patchsmith/app@0.1.0-beta.68

## 0.1.0-beta.67

### Patch Changes

- 6cbe48f: Replace the separate 3 MiB client and server limits with a 10 MiB combined deployment budget covering client code, server code, and both logo variants. The uploaded total and the total before compression must each fit the budget. Logos retain their 256 KiB individual limit; externally hosted runtime downloads are not counted.
- @patchsmith/app@0.1.0-beta.67

## 0.1.0-beta.66

### Minor Changes

- 7ab8c01: Add `instances.cache: "static"` to evaluate instance resolvers during the build, validate their JSON-compatible output, and publish the snapshot with the deployment. The platform resolves static entries without an app runtime session or Cloudflare resolver call. Omitted cache policies and `cache: "none"` retain runtime resolution; client response caching is unchanged.

  Static resolvers take no request arguments and are excluded from deployed bundles. Deploy platform and host support before publishing apps that use static instances.

### Patch Changes

- Updated dependencies [7ab8c01]
  - @patchsmith/app@0.1.0-beta.66

## 0.1.0-beta.65

### Minor Changes

- 92fd903: Add host-defined hooks with typed app handlers discovered from `src/hooks/**/*.hook.ts`. Hosts can discover supporting installations and invoke hooks with validated inputs, outputs, scopes, and hook-specific sessions. Hooks can only be invoked by the host, not through nested action calls. Both hook methods accept `scopes` and `subjectId` directly in their options. App authors use `defineHook`; hook registration stays in the builder-only internal server entry point. Handlers can call registered app queries, mutations, actions, and host server tools. Actions can also call other declared actions with the same identity and cancellation lifetime.

  Synchronous schema serialization treats asynchronous validators as required in generated hook and view bindings.

  Hook names are stored on deployments and exposed through installation metadata, so hosts can discover support without calling app runtimes. Existing deployments and older uploaders default to no hooks; rebuild and republish to advertise hook support.

  All rebuilt server bundles require a runtime supporting `nested-actions`; hook-enabled builds also require `hooks`. Older runtimes reject these bundles, including apps without hooks. Deploy the database migration first, then the updated platform and app runtime before publishing the updated SDK or rebuilding apps. Scheduling and durable retries remain controlled by the host.

### Patch Changes

- Updated dependencies [92fd903]
  - @patchsmith/app@0.1.0-beta.65

## 0.1.0-beta.64

### Patch Changes

- @patchsmith/app@0.1.0-beta.64

## 0.1.0-beta.63

### Patch Changes

- Updated dependencies [29d4061]
  - @patchsmith/app@0.1.0-beta.63

## 0.1.0-beta.62

### Minor Changes

- a0ed266: Require `.router.ts` for automatically registered backend router modules in `src/functions/`. The CLI scaffolds `greeting.router.ts`, and generated guidance uses the new suffix. Both `.router.ts` and legacy `.fn.ts` modules remain blocked from browser bundles.

  This is a breaking change: rename existing `.fn.ts` modules to `.router.ts`, update their imports, and run `patchsmith generate` to refresh bindings. Only `src/functions/**/*.router.ts` files register backend functions; `.fn.ts` files are no longer discovered. The `functions/` directory and API namespaces stay the same.

### Patch Changes

- @patchsmith/app@0.1.0-beta.62

## 0.1.0-beta.61

### Minor Changes

- 3c23da7: Always build and deploy a private backend for every app, including apps with no functions. Function discovery, generated API bindings, view instance resolvers, and database migration generation now work without `server: {}` in `patchsmith.config.ts`.

  The optional `server` field continues to configure settings such as a custom migrations path. Apps that previously omitted it now include a backend automatically; existing empty `server: {}` settings can be removed.

### Patch Changes

- dfca420: Add `.internal()` to app query, mutation, and action builders. Internal functions stay registered for backend execution and are omitted from the typed client API. The runtime rejects direct client calls and subscriptions, including mutation receipt replays, while declared action dependencies and view instance resolvers can call internal queries and mutations.

  Backend builds now require the `internal-functions` runtime capability. Deploy the updated apps worker before upgrading the SDK and builder; older workers reject new bundles rather than ignore internal visibility. Existing function definitions remain public by default. Actions continue to call queries and mutations only; this does not add action-to-action calls.

- Updated dependencies [dfca420]
  - @patchsmith/app@0.1.0-beta.61

## 0.1.0-beta.60

### Patch Changes

- @patchsmith/app@0.1.0-beta.60

## 0.1.0-beta.59

### Minor Changes

- c96def0: Register app backend routers automatically from `src/functions/**/*.fn.ts`, replacing the app's `server.ts` entry and `server.entry` configuration. Dots and directories create equivalent namespaces, nested router objects remain supported, and shared namespaces merge. Duplicate functions and function/namespace conflicts throw when the server bundle loads, with their API path and source files. Builds bundle backend code without executing it. Watch builds refresh registrations and generated type-only API bindings as modules change.

  Reject `name` and `then` in every function and namespace segment because those names conflict with client reference properties. The manual `defineServer` composition API is removed; backend registration is owned by file discovery.

### Patch Changes

- Updated dependencies [c96def0]
  - @patchsmith/app@0.1.0-beta.59

## 0.1.0-beta.58

### Patch Changes

- @patchsmith/app@0.1.0-beta.58

## 0.1.0-beta.57

### Patch Changes

- @patchsmith/app@0.1.0-beta.57

## 0.1.0-beta.56

### Patch Changes

- @patchsmith/app@0.1.0-beta.56

## 0.1.0-beta.55

### Patch Changes

- Updated dependencies [2b3e206]
- Updated dependencies [7f5d15b]
  - @patchsmith/app@0.1.0-beta.55

## 0.1.0-beta.54

### Patch Changes

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

## 0.1.0-beta.52

### Patch Changes

- Updated dependencies [1fa87fe]
  - @patchsmith/app@0.1.0-beta.52

## 0.1.0-beta.51

### Patch Changes

- Updated dependencies [38e1ced]
  - @patchsmith/app@0.1.0-beta.51

## 0.1.0-beta.50

### Patch Changes

- Updated dependencies [71fc3a7]
  - @patchsmith/app@0.1.0-beta.50

## 0.1.0-beta.49

### Patch Changes

- 354c1fc: Expose the config app-ID updater at `@patchsmith/vite/config/app-link` so the fx deploy tool can persist the existing app identity before verification and publication, using the same config editing logic as the CLI.
- 127b09e: Include the configured app ID in build upload manifests so host deployment tools can use the app identity from patchsmith.config.ts.
- @patchsmith/app@0.1.0-beta.49

## 0.1.0-beta.48

### Patch Changes

- Updated dependencies [6a5c17a]
  - @patchsmith/app@0.1.0-beta.48

## 0.1.0-beta.47

### Patch Changes

- @patchsmith/app@0.1.0-beta.47

## 0.1.0-beta.46

### Patch Changes

- 20947c7: Move the app database API into the new `@patchsmith/app-db` package, exposed through `patchsmith/db`. Import `defineDatabase`, table and column builders, query helpers, and database types from `patchsmith/db` instead of `patchsmith/server`.

  Use Patchsmith's `defineRelations` from `patchsmith/db` instead of importing it directly from `drizzle-orm`. New apps scaffold these imports automatically. Existing relation callbacks keep the same typed one/many navigation syntax.

- Updated dependencies [20947c7]
  - @patchsmith/app@0.1.0-beta.46

## 0.1.0-beta.45

### Minor Changes

- cc1631f: Require `name` and `slug` in `PatchsmithConfig` and validate both when loading app configuration. Add a nonblank display name and a slug containing 3–32 lowercase letters or digits separated by single hyphens to existing `patchsmith.config.ts` files. Deployment uses the configured slug when creating an app; existing linked apps keep their permanent slug. New app scaffolds include both fields using the package name, appending `-app` when the derived slug is shorter than three characters.

### Patch Changes

- @patchsmith/app@0.1.0-beta.45

## 0.1.0-beta.44

### Patch Changes

- Restore the 0.x beta release line after the accidental 1.0.0-beta.44 release. This release includes the app slug and validation changes from that release; use 0.1.0-beta.44 instead of 1.0.0-beta.44.
- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.
- Updated dependencies
- Updated dependencies [1fb0155]
  - @patchsmith/app@0.1.0-beta.44

## 1.0.0-beta.44

### Patch Changes

- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.
- Updated dependencies [1fb0155]
  - @patchsmith/app@1.0.0-beta.44

## 0.1.0-beta.43

### Patch Changes

- @patchsmith/app@0.1.0-beta.43

## 0.1.0-beta.42

### Patch Changes

- c54e0b1: Remove Patchsmith app previews, including the `patchsmith preview` command, host preview consent and configuration, platform preview APIs and schemas, client preview metadata and stores, live revision subscriptions, and sandbox inline-source loading. Use deployed app builds for host integrations.
- @patchsmith/app@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- @patchsmith/app@0.1.0-beta.41

## 0.1.0-beta.40

### Minor Changes

- 677501e: Add optional `name` and `description` fields to `PatchsmithConfig`. Deployment uses them for new apps and synchronizes configured fields on existing apps. Omitted fields preserve existing values; new apps fall back to the package or directory name and have no description. Set `description: null` to clear it.

### Patch Changes

- @patchsmith/app@0.1.0-beta.40

## 0.1.0-beta.39

### Patch Changes

- @patchsmith/app@0.1.0-beta.39

## 0.1.0-beta.38

### Patch Changes

- @patchsmith/app@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- f2da040: Export upload manifest validation separately from the Vite builder so server runtimes can validate deployment artifacts without loading the compiler or its native bindings.
- Updated dependencies [0d72562]
  - @patchsmith/app@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- @patchsmith/app@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- @patchsmith/app@0.1.0-beta.35

## 0.1.0-beta.34

### Patch Changes

- @patchsmith/app@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- @patchsmith/app@0.1.0-beta.33

## 0.1.0-beta.32

### Patch Changes

- @patchsmith/app@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- 4d2f904: Align source code with Ultracite’s default Oxlint and Oxfmt presets while preserving public APIs and runtime lifecycle behavior.
- Updated dependencies [4d2f904]
  - @patchsmith/app@0.1.0-beta.31

## 0.1.0-beta.30

### Minor Changes

- 29f3e30: Move the complete build pipeline and configuration loading into `@patchsmith/vite`. Build Patchsmith apps with the public `patchsmith()` plugin from `patchsmith/vite`. Init now offers Vite+ (recommended, with linting, formatting and testing) or Vite (build only), with one `vite.config.ts` for app tooling. Deploy builds using the app's Vite configuration and installation.

  Remove `patchsmith build`, `buildApp()`, the init lint/format flags, and build settings in `patchsmith.config.ts`. Set `build.outDir` in `vite.config.ts` instead.

### Patch Changes

- Updated dependencies [f8dce5d]
- Updated dependencies [29f3e30]
  - @patchsmith/app@0.1.0-beta.30
