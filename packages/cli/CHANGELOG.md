# @patchsmith/cli

## 0.1.0-beta.68

### Minor Changes

- a023f8b: Publish files from an app's `assets/` directory with SHA-256 URLs that remain stable across deployments. Resolve files with `assetUrl()` from `patchsmith/client` or Vite `?url` imports. Deployments track their asset references and reuse existing uploads. Each deployment supports up to 256 static assets, including logos. Static files share the 10 MiB deployment budget with client code and server code before and after compression, including reused assets. Upgrade the platform database and backend, then the host SDK, before deploying apps with assets.

  Breaking: logos now reference files inside `assets/`, using paths such as `logos: { light: "logo-light.svg", dark: "logo-dark.svg" }`. Move logo files into `assets/` and remove the directory prefix from config. Logos use the same hashed URLs, deployment references, uploads, verification, and size accounting as other assets; a file used by both variants counts once. The deployment API accepts logo paths instead of separate file metadata and no longer returns dedicated logo uploads. Old logo URLs and deployment logo file references are removed; redeploy apps after upgrading.

### Patch Changes

- Updated dependencies [a023f8b]
  - @patchsmith/vite@0.1.0-beta.68
  - @patchsmith/core@0.1.0-beta.68
  - @patchsmith/client-platform@0.1.0-beta.68

## 0.1.0-beta.67

### Patch Changes

- 6cbe48f: Replace the separate 3 MiB client and server limits with a 10 MiB combined deployment budget covering client code, server code, and both logo variants. The uploaded total and the total before compression must each fit the budget. Logos retain their 256 KiB individual limit; externally hosted runtime downloads are not counted.
- Updated dependencies [6cbe48f]
  - @patchsmith/vite@0.1.0-beta.67
  - @patchsmith/client-platform@0.1.0-beta.67
  - @patchsmith/core@0.1.0-beta.67

## 0.1.0-beta.66

### Patch Changes

- Updated dependencies [7ab8c01]
  - @patchsmith/vite@0.1.0-beta.66
  - @patchsmith/core@0.1.0-beta.66
  - @patchsmith/client-platform@0.1.0-beta.66

## 0.1.0-beta.65

### Minor Changes

- 92fd903: Add host-defined hooks with typed app handlers discovered from `src/hooks/**/*.hook.ts`. Hosts can discover supporting installations and invoke hooks with validated inputs, outputs, scopes, and hook-specific sessions. Hooks can only be invoked by the host, not through nested action calls. Both hook methods accept `scopes` and `subjectId` directly in their options. App authors use `defineHook`; hook registration stays in the builder-only internal server entry point. Handlers can call registered app queries, mutations, actions, and host server tools. Actions can also call other declared actions with the same identity and cancellation lifetime.

  Synchronous schema serialization treats asynchronous validators as required in generated hook and view bindings.

  Hook names are stored on deployments and exposed through installation metadata, so hosts can discover support without calling app runtimes. Existing deployments and older uploaders default to no hooks; rebuild and republish to advertise hook support.

  All rebuilt server bundles require a runtime supporting `nested-actions`; hook-enabled builds also require `hooks`. Older runtimes reject these bundles, including apps without hooks. Deploy the database migration first, then the updated platform and app runtime before publishing the updated SDK or rebuilding apps. Scheduling and durable retries remain controlled by the host.

### Patch Changes

- Updated dependencies [416cd4c]
- Updated dependencies [92fd903]
  - @patchsmith/core@0.1.0-beta.65
  - @patchsmith/vite@0.1.0-beta.65
  - @patchsmith/client-platform@0.1.0-beta.65

## 0.1.0-beta.64

### Minor Changes

- cb4001c: Include a Lucide-backed Icon in the Zod, Valibot and ArkType primitives and matching React primitives. Keep the standalone Icon({ library: "lucide" }) helpers available for overrides and custom component names. Load validated icon geometry on demand from a versioned catalogue, with request deduplication, caching, stable dimensions and decorative accessibility defaults. Hosts can configure a self-hosted catalogue URL or fetch implementation. The hosted catalogue deploys as an independent Cloudflare Static Assets project.

  Icon props are limited to a required name and optional size. Runtime schemas and generated bindings accept safe string names so hosts, apps, and platforms can run different compatible SDK versions without rejecting newer icons. Export optional `LucideIconName`, `IconName<"lucide">`, and `IconProps<"lucide">` types for app-local name checking, including from the `patchsmith` root entry point. Generated component types also preserve required fields from their schemas.

  Serve icons from `/lucide/v1/<name>.json`, where v1 is the catalogue compatibility version rather than the upstream package version. Generate and commit an additive catalogue snapshot that preserves existing geometry, removed aliases, and license notices across upstream updates and clean deployments. Deploy new assets before apps use new names; missing icons remain empty and retry on later mounts.

### Patch Changes

- Updated dependencies [cb4001c]
- Updated dependencies [39bb8e4]
- Updated dependencies [ed31e0e]
  - @patchsmith/core@0.1.0-beta.64
  - @patchsmith/client-platform@0.1.0-beta.64
  - @patchsmith/vite@0.1.0-beta.64

## 0.1.0-beta.63

### Patch Changes

- @patchsmith/core@0.1.0-beta.63
  - @patchsmith/vite@0.1.0-beta.63
  - @patchsmith/client-platform@0.1.0-beta.63

## 0.1.0-beta.62

### Minor Changes

- a0ed266: Require `.router.ts` for automatically registered backend router modules in `src/functions/`. The CLI scaffolds `greeting.router.ts`, and generated guidance uses the new suffix. Both `.router.ts` and legacy `.fn.ts` modules remain blocked from browser bundles.

  This is a breaking change: rename existing `.fn.ts` modules to `.router.ts`, update their imports, and run `patchsmith generate` to refresh bindings. Only `src/functions/**/*.router.ts` files register backend functions; `.fn.ts` files are no longer discovered. The `functions/` directory and API namespaces stay the same.

### Patch Changes

- Updated dependencies [a0ed266]
  - @patchsmith/vite@0.1.0-beta.62
  - @patchsmith/client-platform@0.1.0-beta.62
  - @patchsmith/core@0.1.0-beta.62

## 0.1.0-beta.61

### Minor Changes

- 3c23da7: Always build and deploy a private backend for every app, including apps with no functions. Function discovery, generated API bindings, view instance resolvers, and database migration generation now work without `server: {}` in `patchsmith.config.ts`.

  The optional `server` field continues to configure settings such as a custom migrations path. Apps that previously omitted it now include a backend automatically; existing empty `server: {}` settings can be removed.

### Patch Changes

- Updated dependencies [3c23da7]
- Updated dependencies [dfca420]
  - @patchsmith/vite@0.1.0-beta.61
  - @patchsmith/core@0.1.0-beta.61
  - @patchsmith/client-platform@0.1.0-beta.61

## 0.1.0-beta.60

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.60
  - @patchsmith/core@0.1.0-beta.60
  - @patchsmith/vite@0.1.0-beta.60

## 0.1.0-beta.59

### Minor Changes

- c96def0: Register app backend routers automatically from `src/functions/**/*.fn.ts`, replacing the app's `server.ts` entry and `server.entry` configuration. Dots and directories create equivalent namespaces, nested router objects remain supported, and shared namespaces merge. Duplicate functions and function/namespace conflicts throw when the server bundle loads, with their API path and source files. Builds bundle backend code without executing it. Watch builds refresh registrations and generated type-only API bindings as modules change.

  Reject `name` and `then` in every function and namespace segment because those names conflict with client reference properties. The manual `defineServer` composition API is removed; backend registration is owned by file discovery.

### Patch Changes

- Updated dependencies [07731b1]
- Updated dependencies [c96def0]
  - @patchsmith/core@0.1.0-beta.59
  - @patchsmith/client-platform@0.1.0-beta.59
  - @patchsmith/vite@0.1.0-beta.59

## 0.1.0-beta.58

### Patch Changes

- Updated dependencies [bb541bb]
  - @patchsmith/core@0.1.0-beta.58
  - @patchsmith/client-platform@0.1.0-beta.58
  - @patchsmith/vite@0.1.0-beta.58

## 0.1.0-beta.57

### Patch Changes

- Updated dependencies [a963f46]
  - @patchsmith/core@0.1.0-beta.57
  - @patchsmith/client-platform@0.1.0-beta.57
  - @patchsmith/vite@0.1.0-beta.57

## 0.1.0-beta.56

### Patch Changes

- Updated dependencies [74a7a6b]
  - @patchsmith/core@0.1.0-beta.56
  - @patchsmith/client-platform@0.1.0-beta.56
  - @patchsmith/vite@0.1.0-beta.56

## 0.1.0-beta.55

### Patch Changes

- 2b3e206: Prevent redundant canvas ready notifications, apply frame-rate changes promptly, and release initializing surfaces when cancelled. Keep host presentation progressing while the document is hidden and correct generated usage guidance for components without children.
- Updated dependencies [7f5d15b]
  - @patchsmith/core@0.1.0-beta.55
  - @patchsmith/vite@0.1.0-beta.55
  - @patchsmith/client-platform@0.1.0-beta.55

## 0.1.0-beta.54

### Patch Changes

- Updated dependencies [d26ee48]
  - @patchsmith/core@0.1.0-beta.54
  - @patchsmith/client-platform@0.1.0-beta.54
  - @patchsmith/vite@0.1.0-beta.54

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
  - @patchsmith/client-platform@0.1.0-beta.53
  - @patchsmith/core@0.1.0-beta.53
  - @patchsmith/vite@0.1.0-beta.53

## 0.1.0-beta.52

### Minor Changes

- 1fa87fe: Remove legacy session and CLI credential shapes. App sessions now require complete identity metadata, including `identity.subjectId` and `identity.toolUrl`; remove the duplicate top-level subject from host responses and the duplicate top-level tool URL from platform responses. The host forwards the platform session without synthesizing a subject. Share the session validator with the iframe protocol so complete authenticated sessions reach sandboxed apps.

  Custom session providers must return `{ expiresAt, identity, token, url }` with a complete identity. Stored CLI credentials must contain a named scope; delete obsolete entries from `~/.patchsmith/auth.json` and log in again to replace flat-scope or scopeless credentials.

### Patch Changes

- Updated dependencies [1fa87fe]
  - @patchsmith/core@0.1.0-beta.52
  - @patchsmith/client-platform@0.1.0-beta.52
  - @patchsmith/vite@0.1.0-beta.52

## 0.1.0-beta.51

### Minor Changes

- 8cbc3d5: Add optional `description` metadata to component definitions. Descriptions survive host contract serialization and schema parsing, appear in generated capability skill component references, and become documentation comments on generated component bindings. Use them to explain behavior such as controlled values, event timing, and disabled-state semantics. Existing slot descriptions remain available in generated references and binding comments.

### Patch Changes

- Updated dependencies [8cbc3d5]
- Updated dependencies [38e1ced]
  - @patchsmith/core@0.1.0-beta.51
  - @patchsmith/client-platform@0.1.0-beta.51
  - @patchsmith/vite@0.1.0-beta.51

## 0.1.0-beta.50

### Minor Changes

- 71fc3a7: Return component callback results across the sandbox bridge instead of dropping them. Callback definitions use only input and output schemas. App callbacks accept direct or promised results, and every host callback returns a promise, including callbacks without an output schema. Callback failures, sandbox destruction, and a 30-second timeout reject pending results.

### Patch Changes

- 78329a9: Add a generic `#*` source import alias to new app scaffolds alongside `#patchsmith`, so frontend and backend modules share one import convention.
- Updated dependencies [71fc3a7]
  - @patchsmith/core@0.1.0-beta.50
  - @patchsmith/vite@0.1.0-beta.50
  - @patchsmith/client-platform@0.1.0-beta.50

## 0.1.0-beta.49

### Patch Changes

- Updated dependencies [354c1fc]
- Updated dependencies [127b09e]
  - @patchsmith/vite@0.1.0-beta.49
  - @patchsmith/client-platform@0.1.0-beta.49
  - @patchsmith/core@0.1.0-beta.49

## 0.1.0-beta.48

### Minor Changes

- 6a5c17a: Add `createFunctions({ database })` to bind database types and relations once for all query and mutation handlers. Add `defineRouter` for explicit function module exports composed in `defineServer`.

  Remove per-function `.database(...)` builders and the `database` option on standalone query/mutation definitions. Configure `createFunctions({ database })` once in the shared database module and import its `fn` in function modules.

  New apps scaffold the shared `fn`, default router exports, and a namespaced greeting at `api.greeting.getGreeting`. Export each function module with `export default defineRouter({ ... })` and import its default router in the server entry point.

### Patch Changes

- 434323a: Add `patchsmith init --bare` to create configuration, tooling, host bindings and the client root without example views, functions, database files or logos. The default scaffold is unchanged.
- @patchsmith/vite@0.1.0-beta.48
  - @patchsmith/client-platform@0.1.0-beta.48
  - @patchsmith/core@0.1.0-beta.48

## 0.1.0-beta.47

### Patch Changes

- 7bb1392: Generate a project skill at `.agents/skills/patchsmith-capabilities/SKILL.md` with a compact index and focused Markdown references in its `references/` directory for props, callbacks, slots, context, styling, and tools. Coding agents can discover the host contract from exported app source. Keep one `patchsmith.gen.ts` for bindings and `#patchsmith` imports; references link to declarations in that file when exact types are needed. Regeneration removes obsolete generated references and preserves user-authored skills.

  New pnpm projects explicitly allow esbuild's required installation script for Drizzle Kit. Keep the three-day minimum release age for third-party dependencies and exempt only `patchsmith` and `@patchsmith/*` through `minimumReleaseAgeExclude` so new Patchsmith releases can be installed immediately.

  Include schema-specific component, callback, responsive styling, tool-call, and view-registration examples in generated references, and mark required props explicitly.

  Use Valibot by default in new app dependencies, scaffold functions and repeated views, generated examples, and agent recipes. Function and instance schemas accept Standard Schema v1-compatible validators; existing apps can retain their chosen validator.

  Keep app-building guidance focused on the simplest working solution, with direct component/state examples and platform requirements separated from optional patterns.

- @patchsmith/client-platform@0.1.0-beta.47
  - @patchsmith/core@0.1.0-beta.47
  - @patchsmith/vite@0.1.0-beta.47

## 0.1.0-beta.46

### Patch Changes

- 20947c7: Move the app database API into the new `@patchsmith/app-db` package, exposed through `patchsmith/db`. Import `defineDatabase`, table and column builders, query helpers, and database types from `patchsmith/db` instead of `patchsmith/server`.

  Use Patchsmith's `defineRelations` from `patchsmith/db` instead of importing it directly from `drizzle-orm`. New apps scaffold these imports automatically. Existing relation callbacks keep the same typed one/many navigation syntax.

- Updated dependencies [20947c7]
  - @patchsmith/vite@0.1.0-beta.46
  - @patchsmith/client-platform@0.1.0-beta.46
  - @patchsmith/core@0.1.0-beta.46

## 0.1.0-beta.45

### Minor Changes

- cc1631f: Require `name` and `slug` in `PatchsmithConfig` and validate both when loading app configuration. Add a nonblank display name and a slug containing 3–32 lowercase letters or digits separated by single hyphens to existing `patchsmith.config.ts` files. Deployment uses the configured slug when creating an app; existing linked apps keep their permanent slug. New app scaffolds include both fields using the package name, appending `-app` when the derived slug is shorter than three characters.

### Patch Changes

- Updated dependencies [cc1631f]
  - @patchsmith/vite@0.1.0-beta.45
  - @patchsmith/client-platform@0.1.0-beta.45
  - @patchsmith/core@0.1.0-beta.45

## 0.1.0-beta.44

### Patch Changes

- 89d328f: Add immutable, project-scoped app slugs of 1–32 characters and expose them in app responses. Apps and installations can choose a slug at creation; omitted slugs receive a stable generated username.

  Platform app operations now require an explicit `app: { id }`, `app: { shortId }`, or `app: { slug }` selector instead of guessing an identifier namespace. App operations use POST endpoints with the selector in the body. Deployment creation/listing and agent chat use the same selector. Update the platform client, host, and CLI together with the backend.

- Restore the 0.x beta release line after the accidental 1.0.0-beta.44 release. This release includes the app slug and validation changes from that release; use 0.1.0-beta.44 instead of 1.0.0-beta.44.
- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.
- Updated dependencies [89d328f]
- Updated dependencies
- Updated dependencies [1fb0155]
  - @patchsmith/client-platform@0.1.0-beta.44
  - @patchsmith/core@0.1.0-beta.44
  - @patchsmith/vite@0.1.0-beta.44

## 1.0.0-beta.44

### Patch Changes

- 89d328f: Add immutable, project-scoped app slugs of 1–32 characters and expose them in app responses. Apps and installations can choose a slug at creation; omitted slugs receive a stable generated username.

  Platform app operations now require an explicit `app: { id }`, `app: { shortId }`, or `app: { slug }` selector instead of guessing an identifier namespace. App operations use POST endpoints with the selector in the body. Deployment creation/listing and agent chat use the same selector. Update the platform client, host, and CLI together with the backend.

- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.
- Updated dependencies [89d328f]
- Updated dependencies [1fb0155]
  - @patchsmith/client-platform@1.0.0-beta.44
  - @patchsmith/core@1.0.0-beta.44
  - @patchsmith/vite@1.0.0-beta.44

## 0.1.0-beta.43

### Patch Changes

- 6a68ba5: Rename publicId fields to shortId and use permanent 12-character DNS-safe identifiers. Address assets and app runtime calls through project short-ID subdomains, and bind runtime tokens to project and app short IDs.
- Updated dependencies [6a68ba5]
  - @patchsmith/client-platform@0.1.0-beta.43
  - @patchsmith/core@0.1.0-beta.43
  - @patchsmith/vite@0.1.0-beta.43

## 0.1.0-beta.42

### Minor Changes

- c54e0b1: Remove Patchsmith app previews, including the `patchsmith preview` command, host preview consent and configuration, platform preview APIs and schemas, client preview metadata and stores, live revision subscriptions, and sandbox inline-source loading. Use deployed app builds for host integrations.

### Patch Changes

- Updated dependencies [c54e0b1]
  - @patchsmith/client-platform@0.1.0-beta.42
  - @patchsmith/core@0.1.0-beta.42
  - @patchsmith/vite@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.41
  - @patchsmith/core@0.1.0-beta.41
  - @patchsmith/vite@0.1.0-beta.41

## 0.1.0-beta.40

### Minor Changes

- 677501e: Add optional `name` and `description` fields to `PatchsmithConfig`. Deployment uses them for new apps and synchronizes configured fields on existing apps. Omitted fields preserve existing values; new apps fall back to the package or directory name and have no description. Set `description: null` to clear it.
- b636758: Add a Pressable primitive with inline, box, flex, and grid layouts, token-based style props that combine breakpoint and interaction state values, and an onPress callback. The host renders a native button with keyboard activation and disabled behavior; interaction styling stays in the host.

  Replace the `base` style fallback with `default` across primitives. Style props continue to accept token strings and now support conditional objects with host-defined breakpoint names and `:hover`, `:active`, `:focus-visible`, and `:disabled` states. State values can contain breakpoint overrides. Breakpoint names `default` and all names starting with `:` are rejected by TypeScript and at runtime.

  Generate breakpoint and interaction types from serialized component fields, and preserve each property's authored breakpoint order. Breakpoint values require media-query widths; null fallback breakpoints and the generator's legacy `fieldKeys` schema fallback are no longer supported.

  Serialize repeated JSON Schema subtrees once in local `$defs` and reuse them through `$ref`, reducing schema payload size. Type generation resolves local references independently within component fields, callbacks, views, and tools, with explicit errors for unresolved, external, or circular references.

### Patch Changes

- Updated dependencies [677501e]
- Updated dependencies [b636758]
  - @patchsmith/vite@0.1.0-beta.40
  - @patchsmith/core@0.1.0-beta.40
  - @patchsmith/client-platform@0.1.0-beta.40

## 0.1.0-beta.39

### Patch Changes

- Updated dependencies [ad770d2]
  - @patchsmith/core@0.1.0-beta.39
  - @patchsmith/client-platform@0.1.0-beta.39
  - @patchsmith/vite@0.1.0-beta.39

## 0.1.0-beta.38

### Minor Changes

- 469d8c2: Add optional slot descriptions for layout and sizing guidance. Preserve descriptions in serialized host contracts and include them in generated slot documentation for app authors and agents.

### Patch Changes

- Updated dependencies [469d8c2]
  - @patchsmith/core@0.1.0-beta.38
  - @patchsmith/client-platform@0.1.0-beta.38
  - @patchsmith/vite@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- 1f6b983: Include the compiler command and TypeScript diagnostics when deployment stops after a failed type check, including non-interactive agent deployments.
- Updated dependencies [f2da040]
- Updated dependencies [0d72562]
  - @patchsmith/vite@0.1.0-beta.37
  - @patchsmith/core@0.1.0-beta.37
  - @patchsmith/client-platform@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- c0ce502: Restrict the agent command to apps created by AI, validate explicit app IDs, and mark apps created through the authenticated agent creation flow as AI-created. Reject caller-supplied provenance on general app creation.
- Updated dependencies [c0ce502]
  - @patchsmith/core@0.1.0-beta.36
  - @patchsmith/client-platform@0.1.0-beta.36
  - @patchsmith/vite@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.35
  - @patchsmith/core@0.1.0-beta.35
  - @patchsmith/vite@0.1.0-beta.35

## 0.1.0-beta.34

### Minor Changes

- 82aa45f: Reconnect interrupted agent streams to the existing workflow from the last received chunk, and settle a disconnected turn before sending a follow-up. Relay signed run identities and cleanup completion through the host API.

  Agent chat requires explicit turn or resume requests. Combine thread and run identity in `data-run`, and require `data-run-complete` after workspace cleanup. Remove the separate `data-thread` event and finish-only success handling.

  The app agent checkpoints SDK state directly instead of collecting duplicate model messages. MCP returns the assembled assistant `message` from the output stream instead of a `messages` array.

### Patch Changes

- Updated dependencies [82aa45f]
  - @patchsmith/core@0.1.0-beta.34
  - @patchsmith/client-platform@0.1.0-beta.34
  - @patchsmith/vite@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- Updated dependencies [a215860]
  - @patchsmith/core@0.1.0-beta.33
  - @patchsmith/client-platform@0.1.0-beta.33
  - @patchsmith/vite@0.1.0-beta.33

## 0.1.0-beta.32

### Minor Changes

- 1929607: Start a new agent conversation for each CLI invocation by default. Follow-up messages reuse its thread, and `patchsmith agent --thread <id>` explicitly resumes a previous conversation. Add optional `threadId` to the chat protocol and return thread metadata in the stream.

### Patch Changes

- Updated dependencies [1929607]
  - @patchsmith/client-platform@0.1.0-beta.32
  - @patchsmith/core@0.1.0-beta.32
  - @patchsmith/vite@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- 4d2f904: Align source code with Ultracite’s default Oxlint and Oxfmt presets while preserving public APIs and runtime lifecycle behavior.
- Updated dependencies [4d2f904]
  - @patchsmith/client-platform@0.1.0-beta.31
  - @patchsmith/core@0.1.0-beta.31
  - @patchsmith/vite@0.1.0-beta.31

## 0.1.0-beta.30

### Minor Changes

- 29f3e30: Move the complete build pipeline and configuration loading into `@patchsmith/vite`. Build Patchsmith apps with the public `patchsmith()` plugin from `patchsmith/vite`. Init now offers Vite+ (recommended, with linting, formatting and testing) or Vite (build only), with one `vite.config.ts` for app tooling. Deploy builds using the app's Vite configuration and installation.

  Remove `patchsmith build`, `buildApp()`, the init lint/format flags, and build settings in `patchsmith.config.ts`. Set `build.outDir` in `vite.config.ts` instead.

### Patch Changes

- Updated dependencies [29f3e30]
  - @patchsmith/vite@0.1.0-beta.30
  - @patchsmith/client-platform@0.1.0-beta.30
  - @patchsmith/core@0.1.0-beta.30

## 0.1.0-beta.29

### Patch Changes

- 108aaa9: Let the app agent publish through existing platform endpoints using a one-hour JWT as an alternative to CLI sessions across authenticated commands, using the same project/scope permissions and existing platform endpoints. Preserve normal session-token login, storage, and host routing. Require secure platform URLs, distinguish service failures from auth rejection, and add headless deployment and explicit app selection.
- Updated dependencies [3567f94]
  - @patchsmith/core@0.1.0-beta.29
  - @patchsmith/app@0.1.0-beta.29
  - @patchsmith/client-platform@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- a0ffa4f: Send the host URL and a fresh schema snapshot with each CLI agent turn so the remote agent can scaffold and generate bindings against an undeployed local host. Add `--schema <path>` to init and generate for generation from a serialized JSON schema file. Agent workflows require a host URL and accept an optional schema; host-only runs continue fetching the schema normally.
- Updated dependencies [a0ffa4f]
  - @patchsmith/client-platform@0.1.0-beta.28
  - @patchsmith/core@0.1.0-beta.28
  - @patchsmith/app@0.1.0-beta.28

## 0.1.0-beta.27

### Patch Changes

- be8bce2: Require an explicit --host URL for the agent command instead of reading or writing patchsmith.config.ts. Keep --app optional for selecting an existing remote app, remove --cwd from the agent command, and support --host for login, logout, and whoami.
- Updated dependencies [21761f2]
- Updated dependencies [4685874]
  - @patchsmith/core@0.1.0-beta.27
  - @patchsmith/app@0.1.0-beta.27
  - @patchsmith/client-platform@0.1.0-beta.27

## 0.1.0-beta.26

### Patch Changes

- Updated dependencies [3fa95bc]
  - @patchsmith/core@0.1.0-beta.26
  - @patchsmith/app@0.1.0-beta.26
  - @patchsmith/client-platform@0.1.0-beta.26

## 0.1.0-beta.25

### Patch Changes

- Updated dependencies [441a5a9]
  - @patchsmith/app@0.1.0-beta.25
  - @patchsmith/client-platform@0.1.0-beta.25
  - @patchsmith/core@0.1.0-beta.25

## 0.1.0-beta.24

### Minor Changes

- 057cfde: Scaffold app databases in `src/db` with schema, relations and a `defineDatabase` export. Generate migrations in `src/db/migrations`, support typed synchronous Drizzle relational queries in database handlers.

  Discover app views from `src/slots/<slot-name>/*.view.tsx`, with dotted filenames mapping to nested routes and optional explicit view paths. Add `defineRoute({ shellComponent })` roots and nested slot layouts with a `Route` outlet, preserving shared layout state during navigation. Init generates a root shell with `ClientProvider`.

  Remove manual `defineClient` registration, `client.entry` configuration, and fallback discovery of `src/schema.ts` and root migrations. Apps use the file-based client and `src/db` database layout exclusively.

  Update sandbox diagnostics to describe the generated app client instead of the removed manual client API.

### Patch Changes

- Updated dependencies [057cfde]
- Updated dependencies [4985d4e]
  - @patchsmith/app@0.1.0-beta.24
  - @patchsmith/core@0.1.0-beta.24
  - @patchsmith/client-platform@0.1.0-beta.24

## 0.1.0-beta.23

### Patch Changes

- @patchsmith/app@0.1.0-beta.23
  - @patchsmith/client-platform@0.1.0-beta.23
  - @patchsmith/core@0.1.0-beta.23

## 0.1.0-beta.22

### Minor Changes

- 268df1e: Require Preact 11 for app builds and newly scaffolded apps. Keep provider disposal and pending-call cancellation synchronous during unmount with layout-effect cleanup.

### Patch Changes

- Updated dependencies [c29880d]
- Updated dependencies [268df1e]
  - @patchsmith/app@0.1.0-beta.22
  - @patchsmith/client-platform@0.1.0-beta.22
  - @patchsmith/core@0.1.0-beta.22

## 0.1.0-beta.21

### Patch Changes

- 1c52fe8: Add minimal package READMEs with readable names and short descriptions.
- Updated dependencies [1c52fe8]
  - @patchsmith/app@0.1.0-beta.21
  - @patchsmith/client-platform@0.1.0-beta.21
  - @patchsmith/core@0.1.0-beta.21

## 0.1.0-beta.20

### Minor Changes

- a2ed82b: Declare multi-instance host slots with `multiple: true` (omitted or false means single-instance). Client-bound `Slot` requires `instanceKey` for multi-instance slots and rejects it for single-instance slots; ready `Slot.Controlled` similarly requires or rejects `instance`.

  Breaking change: rename `createView` to `defineView`, use `defineView({ slot, view, component, ... })` and regenerate app bindings. Multi-instance slots require `instances: { dataSchema, resolve }`; single-instance slots reject it. View registration is restricted to the slot selected in `defineView`. The CLI scaffolds a resolver when the selected host slot supports multiple instances.

### Patch Changes

- fc09d5b: Gzip client and server deployment bundles before uploading to reduce transfer and R2 storage. Record compressed byte checksums and sizes, and support gzip deployment metadata while retaining compatibility with uncompressed deployments.

  Raise the maximum client and server bundle size to 3 MiB for uploads and decoded runtime/delivery bytes.

- Updated dependencies [a2ed82b]
- Updated dependencies [fc09d5b]
  - @patchsmith/core@0.1.0-beta.20
  - @patchsmith/app@0.1.0-beta.20
  - @patchsmith/client-platform@0.1.0-beta.20

## 0.1.0-beta.19

### Minor Changes

- fa05f02: Add colocated `createView` instance resolvers with a validated data schema and automatic, typed access to registered server queries. The app build uses Oxc to extract resolvers and their dependencies into generated server actions through `_patchsmith.instances.resolve`, addressed by slot and view path, keeping their implementations out of browser bundles. Hosts discover instance support through `instances: true` in deployment and preview view manifests.
- fa05f02: Add client-bound useViews with scopes, appIds, and slot filters. App builds and deployments include view manifests, including preview builds. useApps and useViews share one authenticated app request and filter locally; useApps also accepts appIds. Apps without a view manifest must be redeployed to appear in useViews.

### Patch Changes

- fa05f02: Add client-bound `useSlotInstances({ app, slot })` to fetch instances through the authenticated app action endpoint using the matching view and registered ancestor context. Expose loading, errors, and refetch; clear stale data when context or deployment changes. Preserve disabled view paths in manifests so host matching respects blocked fallback, while keeping them out of `useViews` discovery.
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
  - @patchsmith/app@0.1.0-beta.19
  - @patchsmith/core@0.1.0-beta.19
  - @patchsmith/client-platform@0.1.0-beta.19

## 0.1.0-beta.18

### Patch Changes

- fc9538d: Allow the agent command to search existing apps or create a new app when appId is omitted, then save the chosen app ID in the Patchsmith config for future launches.
- 6f969e3: Add `tailor agent` (also available as `patchsmith agent`), an AI SDK terminal chat interface for the platform app agent. Relay messages through authenticated host oRPC routes and the generated OpenAPI client. Keep conversation history in CLI memory while remote code persists on the app's exclusively mounted Sandbox Drive.
- Updated dependencies [fc9538d]
- Updated dependencies [6f969e3]
- Updated dependencies [731e066]
  - @patchsmith/app@0.1.0-beta.18
  - @patchsmith/core@0.1.0-beta.18
  - @patchsmith/client-platform@0.1.0-beta.18

## 0.1.0-beta.17

### Patch Changes

- 364d5cd: Document PatchsmithConfig options and their defaults in editor tooltips, and generate new app configs with only the host URL so the backend is enabled explicitly.
- 72d38cd: Start the login approval flow automatically when deploying without valid credentials, then continue the deployment in the same command after approval.
- 8d1b465: Include Patchsmith light and dark logo SVGs in apps created by the init command and configure both logo paths so new apps have branding ready for preview and deployment.
- aad1587: Generate host bindings during init and scaffold the first supported view alphabetically in a matching slot. Use Box when available, otherwise a fragment, and avoid assuming host context fields or components.
- d586115: Preserve nullable types, discriminated unions, records, and tuples in generated view contexts, component props, callbacks, and actions. Accept the JSON Schema keywords emitted for integers, records, and tuples.
- 6569f26: Enable skipLibCheck in generated app TypeScript configs so dependency declaration errors do not block deployment while application code remains type checked.
- 9384481: Persist appId in the default-exported top-level config object, including typed declarations and the satisfies PatchsmithConfig format generated by init, without modifying nested variables with the same name.
- Updated dependencies [ba00155]
- Updated dependencies [364d5cd]
- Updated dependencies [d586115]
  - @patchsmith/core@0.1.0-beta.17
  - @patchsmith/client-platform@0.1.0-beta.17
  - @patchsmith/app@0.1.0-beta.17

## 0.1.0-beta.16

### Minor Changes

- b5c6afc: Consolidate the app SDK in @patchsmith/app and expose app client APIs through patchsmith/client and server APIs through patchsmith/server. Provide SQLite schema builders, synchronous Zod-validated queries/mutations, asynchronous external actions, atomic mutation receipts and typed browser references. Use oRPC v2 HTTP for direct sandbox calls and WebSockets for server-driven query snapshots; the bridge supplies scoped platform JWTs and renews authentication. Execute queries, mutations and actions in one private Cloudflare facet, with an ALS-backed fetch guard and local action query/mutation calls and scoped capabilities for HTTPS egress. Keep synchronous database transactions atomic. Actions do not retry automatically or hold database transactions across external work. Track table dependencies and rerun only active affected queries after commit.

  Upload client and private server bundles with committed Drizzle migrations to separate blob prefixes and load published code into isolated Dynamic Worker SQLite facets through apps/apps-worker. Keep stable installation databases across deployments, trusted Effect v4 coordination, and client-only app compatibility. Store migration sources in migrations/ and copy them to .patchsmith/migrations/. Generate migrations explicitly through patchsmith db generate using Drizzle Kit and the existing Patchsmith config, without a separate Drizzle config; builds check the current schema against the latest saved snapshot without rewriting history. Apply pending migrations atomically to each installation before database calls.

  Retire the legacy app-storage SDK, app-platform package, storage CLI commands and bridged database calls. Keep the Apache-2.0 oRPC contract in @patchsmith/app/protocol and execution in the private BUSL-1.1 apps-worker worker. Share private app JWT signing/verification through @patchsmith/api-utils/app-auth, and expose host authorization through backend.resolveInstallation and /backend/session. Effect stays in server auth and trusted runtime code, outside browser entry points.

  Support client.entry and server.entry in patchsmith.config.ts, defaulting to src/client.ts and src/server.ts. Build, deployment type checks, browser/server isolation and API type imports follow the configured entries.

  Share duplicate reactive queries with TanStack Store and retry transient mutation failures with stable receipt IDs. Inline dynamic server imports into one upload, typecheck both app entries, preserve session error codes through the iframe bridge, and mount opaque-origin sandboxes without waiting for backend authentication. Cache published deployment metadata in Cloudflare KV, update it through an authenticated platform-to-worker endpoint, and populate cache misses through the platform API. Existing clients reconnect to the latest server without remounting; deployments must maintain client compatibility.

### Patch Changes

- Updated dependencies [14980bc]
- Updated dependencies [b5c6afc]
- Updated dependencies [efdac76]
  - @patchsmith/core@0.1.0-beta.16
  - @patchsmith/client-platform@0.1.0-beta.16
  - @patchsmith/app@0.1.0-beta.16

## 0.1.0-beta.15

### Patch Changes

- @patchsmith/app@0.1.0-beta.15
  - @patchsmith/client-platform@0.1.0-beta.15
  - @patchsmith/core@0.1.0-beta.15

## 0.1.0-beta.14

### Patch Changes

- e06e450: Upload complete preview builds to KV in bounded oRPC chunks, accept previews through a host consent page, and stream verified revisions to sandboxed app views.
- 9a8ecab: Avoid logging expected request-stream aborts while the preview tunnel reconnects.
- Updated dependencies [e06e450]
  - @patchsmith/core@0.1.0-beta.14
  - @patchsmith/client-platform@0.1.0-beta.14
  - @patchsmith/app@0.1.0-beta.14

## 0.1.0-beta.13

### Patch Changes

- 061adb2: Serve preview assets directly through the authenticated tunnel without starting a local HTTP server, and end preview sessions when the CLI exits or cannot establish its tunnel.
- Updated dependencies [061adb2]
  - @patchsmith/client-platform@0.1.0-beta.13
  - @patchsmith/core@0.1.0-beta.13
  - @patchsmith/app@0.1.0-beta.13

## 0.1.0-beta.12

### Patch Changes

- @patchsmith/app@0.1.0-beta.12
  - @patchsmith/client-platform@0.1.0-beta.12
  - @patchsmith/core@0.1.0-beta.12

## 0.1.0-beta.11

### Patch Changes

- 54eb091: Use a typed oRPC WebSocket client for local preview tunnels and generate the platform HTTP client from the OpenAPI schema.
- Updated dependencies [54eb091]
  - @patchsmith/client-platform@0.1.0-beta.11
  - @patchsmith/core@0.1.0-beta.11
  - @patchsmith/app@0.1.0-beta.11

## 0.1.0-beta.10

### Patch Changes

- a0d3233: Add authenticated local preview tunnels with bounded asset delivery and secure host-side asset proxying.
- Updated dependencies [a0d3233]
  - @patchsmith/core@0.1.0-beta.10
  - @patchsmith/app@0.1.0-beta.10

## 0.1.0-beta.9

### Minor Changes

- ced9f2f: Add slot-specific app view selection and layered host views. Host contracts now declare `views` and `slots`; app clients register `slots[name][path]`. Each slot selects one matching view and composes context only from that view and its ancestors. Unsupported matches render nothing, and `false` entries stop fallback.

  React integrations now import `Root`, `AppView`, `useApps`, and `useView` directly. Pass the client to `Root`, add a slot to every app view, publish only each view's own context, and regenerate app bindings. Registries are isolated per root.

  Each slot declares a `views` list typed against the global view definitions. Generated app bindings and explicit host mounts enforce the slot-to-view relationship, and runtime matching only considers supported view paths while retaining inherited ancestor context.

  Publish host view state with `useView(path, { context })` or `useView(path, { status })`.

  The iframe runtime is bundled from TypeScript and accepts only default-exported `defineClient()` clients. Demo clients use that same contract. View ancestry is shared between React, the sandbox, and generated bindings. `Root` supplies one app-discovery state: when `apps` is provided, `useApps()` reads it and skips network discovery.

### Patch Changes

- Updated dependencies [ced9f2f]
  - @patchsmith/app@0.1.0-beta.9
  - @patchsmith/core@0.1.0-beta.9

## 0.1.0-beta.8

### Patch Changes

- Updated dependencies [9e46a8b]
  - @patchsmith/app@0.1.0-beta.8
  - @patchsmith/core@0.1.0-beta.8

## 0.1.0-beta.7

### Patch Changes

- 2e7b3a4: Add optional light and dark app logos to the deployment pipeline, including validated SVG, PNG, and WebP uploads, hosted logo URLs, and a 1 MiB combined client asset limit.
- Updated dependencies [2e7b3a4]
  - @patchsmith/app@0.1.0-beta.7
  - @patchsmith/core@0.1.0-beta.7

## 0.1.0-beta.6

### Patch Changes

- @patchsmith/app@0.1.0-beta.6
  - @patchsmith/core@0.1.0-beta.6

## 0.1.0-beta.5

### Patch Changes

- Updated dependencies [695cdad]
  - @patchsmith/core@0.1.0-beta.5
  - @patchsmith/app@0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- 324b281: Resolve public packages to compiled distribution files in both development and production, without custom source export conditions.

  Remove stale source aliases and declaration maps that reference unpublished source files. Generate apps with a single patchsmith dependency and its app subpath exports.

- Updated dependencies [324b281]
  - @patchsmith/app@0.1.0-beta.4
  - @patchsmith/core@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- Updated dependencies [a02ebee]
  - @patchsmith/app@0.1.0-beta.3
  - @patchsmith/core@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies [586cc14]
  - @patchsmith/core@0.1.0-beta.2
  - @patchsmith/app@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Updated dependencies [c0bdd68]
  - @patchsmith/core@0.1.0-beta.1
  - @patchsmith/app@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 4230689: Publish the initial Patchsmith beta packages.

### Patch Changes

- Updated dependencies [4230689]
  - @patchsmith/app@0.1.0-beta.0
  - @patchsmith/core@0.1.0-beta.0
