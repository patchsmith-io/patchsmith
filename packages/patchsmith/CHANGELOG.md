# patchsmith

## 0.1.0-beta.71

### Patch Changes

- 9b669cb: Add `openai/gpt-6.1-sol-fast` as a supported `agent.model` option for CLI and MCP app-building runs. Sol Fast uses low reasoning effort, and omitting the setting keeps regular Sol as the default.
- Updated dependencies [9b669cb]
  - @patchsmith/core@0.1.0-beta.71
  - @patchsmith/ai-sdk@0.1.0-beta.71
  - @patchsmith/cli@0.1.0-beta.71
  - @patchsmith/react@0.1.0-beta.71
  - @patchsmith/app@0.1.0-beta.71
  - @patchsmith/app-db@0.1.0-beta.71
  - @patchsmith/vite@0.1.0-beta.71

## 0.1.0-beta.70

### Patch Changes

- 1d21d1b: Add the optional `agent.model` server setting for CLI and MCP app-building runs. Choose GPT-6.1 Sol, Claude Sonnet 5.5, Claude Opus 5.5, GPT-6 Astra, or DeepSeek V4.1 Flash. Omitting the setting keeps GPT-6.1 Sol as the default. Unsupported model IDs are rejected. The public DeepSeek option resolves to the pinned `deepseek/deepseek-v4.1-flash-1017` Gateway snapshot.
- Updated dependencies [1d21d1b]
  - @patchsmith/core@0.1.0-beta.70
  - @patchsmith/ai-sdk@0.1.0-beta.70
  - @patchsmith/cli@0.1.0-beta.70
  - @patchsmith/react@0.1.0-beta.70
  - @patchsmith/app@0.1.0-beta.70
  - @patchsmith/app-db@0.1.0-beta.70
  - @patchsmith/vite@0.1.0-beta.70

## 0.1.0-beta.69

### Minor Changes

- 2ac11bc: Default new apps to root-level source and support an optional `src/` source tree with `patchsmith init --src-dir`. Views, functions, hooks, database paths, generated bindings, and watch builds use the same detected source root. Keep app source directories together; mixed root and `src/` layouts fail.

  Move the shared frontend shell from `root.tsx` to `slots/root.tsx` (or from `src/root.tsx` to `src/slots/root.tsx`). This is a breaking change: move existing shells to the new location and run `patchsmith generate`. Configuration, environment files, assets, and explicit migration paths remain relative to the project root. Update package import aliases and TypeScript includes if moving an existing app out of `src/`.

### Patch Changes

- Updated dependencies [ee0a7c5]
- Updated dependencies [2ac11bc]
- Updated dependencies [709922d]
  - @patchsmith/vite@0.1.0-beta.69
  - @patchsmith/cli@0.1.0-beta.69
  - @patchsmith/app@0.1.0-beta.69
  - @patchsmith/core@0.1.0-beta.69
  - @patchsmith/react@0.1.0-beta.69
  - @patchsmith/ai-sdk@0.1.0-beta.69
  - @patchsmith/app-db@0.1.0-beta.69

## 0.1.0-beta.68

### Minor Changes

- a023f8b: Publish files from an app's `assets/` directory with SHA-256 URLs that remain stable across deployments. Resolve files with `assetUrl()` from `patchsmith/client` or Vite `?url` imports. Deployments track their asset references and reuse existing uploads. Each deployment supports up to 256 static assets, including logos. Static files share the 10 MiB deployment budget with client code and server code before and after compression, including reused assets. Upgrade the platform database and backend, then the host SDK, before deploying apps with assets.

  Breaking: logos now reference files inside `assets/`, using paths such as `logos: { light: "logo-light.svg", dark: "logo-dark.svg" }`. Move logo files into `assets/` and remove the directory prefix from config. Logos use the same hashed URLs, deployment references, uploads, verification, and size accounting as other assets; a file used by both variants counts once. The deployment API accepts logo paths instead of separate file metadata and no longer returns dedicated logo uploads. Old logo URLs and deployment logo file references are removed; redeploy apps after upgrading.

### Patch Changes

- Updated dependencies [a023f8b]
  - @patchsmith/app@0.1.0-beta.68
  - @patchsmith/vite@0.1.0-beta.68
  - @patchsmith/cli@0.1.0-beta.68
  - @patchsmith/core@0.1.0-beta.68
  - @patchsmith/react@0.1.0-beta.68
  - @patchsmith/ai-sdk@0.1.0-beta.68
  - @patchsmith/app-db@0.1.0-beta.68

## 0.1.0-beta.67

### Patch Changes

- Updated dependencies [6cbe48f]
  - @patchsmith/cli@0.1.0-beta.67
  - @patchsmith/vite@0.1.0-beta.67
  - @patchsmith/ai-sdk@0.1.0-beta.67
  - @patchsmith/app@0.1.0-beta.67
  - @patchsmith/app-db@0.1.0-beta.67
  - @patchsmith/core@0.1.0-beta.67
  - @patchsmith/react@0.1.0-beta.67

## 0.1.0-beta.66

### Minor Changes

- 7ab8c01: Add `instances.cache: "static"` to evaluate instance resolvers during the build, validate their JSON-compatible output, and publish the snapshot with the deployment. The platform resolves static entries without an app runtime session or Cloudflare resolver call. Omitted cache policies and `cache: "none"` retain runtime resolution; client response caching is unchanged.

  Static resolvers take no request arguments and are excluded from deployed bundles. Deploy platform and host support before publishing apps that use static instances.

### Patch Changes

- Updated dependencies [7ab8c01]
  - @patchsmith/app@0.1.0-beta.66
  - @patchsmith/vite@0.1.0-beta.66
  - @patchsmith/core@0.1.0-beta.66
  - @patchsmith/cli@0.1.0-beta.66
  - @patchsmith/react@0.1.0-beta.66
  - @patchsmith/ai-sdk@0.1.0-beta.66
  - @patchsmith/app-db@0.1.0-beta.66

## 0.1.0-beta.65

### Minor Changes

- 416cd4c: Align built-in primitive scales with Tailwind CSS v4. Radius now uses `xs` through `4xl` with matching values, and `full` produces pill-shaped corners. Breakpoints use Tailwind's rem values. Spacing and fixed dimensions share numeric tokens based on a `0.25rem` unit, including `width="12"` and `height="12"` for `3rem`, plus `px` and `auto` sizing.

  Export `primitiveDefaults` and `defaultBreakpoints` alongside `primitives` from the Zod, Valibot, and ArkType entry points. Spread groups such as `primitiveDefaults.radius`, `primitiveDefaults.space`, and `primitiveDefaults.size` to extend or override the built-in scales in a host theme.

  This is a breaking change with no compatibility aliases. Replace built-in spacing names with numeric strings: `none` → `0`, `2xs` → `0.5`, `xs` → `1`, `sm` → `2`, `md` → `4`, `lg` → `6`, `xl` → `8`, `2xl` → `12`, and `3xl` → `18`. To preserve radius values, use `2xs` → `xs`, `xs` → `sm`, `sm` → `md`, `md` → `lg`, `lg` → `xl`, `xl` → `2xl`, `2xl` → `3xl`, and `3xl` → `4xl`. Regenerate extension bindings after updating host contracts. Custom host token groups continue to replace defaults, and enum names such as `breakWord` remain camel case.

- 92fd903: Add host-defined hooks with typed app handlers discovered from `src/hooks/**/*.hook.ts`. Hosts can discover supporting installations and invoke hooks with validated inputs, outputs, scopes, and hook-specific sessions. Hooks can only be invoked by the host, not through nested action calls. Both hook methods accept `scopes` and `subjectId` directly in their options. App authors use `defineHook`; hook registration stays in the builder-only internal server entry point. Handlers can call registered app queries, mutations, actions, and host server tools. Actions can also call other declared actions with the same identity and cancellation lifetime.

  Synchronous schema serialization treats asynchronous validators as required in generated hook and view bindings.

  Hook names are stored on deployments and exposed through installation metadata, so hosts can discover support without calling app runtimes. Existing deployments and older uploaders default to no hooks; rebuild and republish to advertise hook support.

  All rebuilt server bundles require a runtime supporting `nested-actions`; hook-enabled builds also require `hooks`. Older runtimes reject these bundles, including apps without hooks. Deploy the database migration first, then the updated platform and app runtime before publishing the updated SDK or rebuilding apps. Scheduling and durable retries remain controlled by the host.

### Patch Changes

- Updated dependencies [416cd4c]
- Updated dependencies [92fd903]
  - @patchsmith/core@0.1.0-beta.65
  - @patchsmith/app@0.1.0-beta.65
  - @patchsmith/vite@0.1.0-beta.65
  - @patchsmith/cli@0.1.0-beta.65
  - @patchsmith/ai-sdk@0.1.0-beta.65
  - @patchsmith/react@0.1.0-beta.65
  - @patchsmith/app-db@0.1.0-beta.65

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
  - @patchsmith/cli@0.1.0-beta.64
  - @patchsmith/react@0.1.0-beta.64
  - @patchsmith/ai-sdk@0.1.0-beta.64
  - @patchsmith/app@0.1.0-beta.64
  - @patchsmith/app-db@0.1.0-beta.64
  - @patchsmith/vite@0.1.0-beta.64

## 0.1.0-beta.63

### Patch Changes

- Updated dependencies [29d4061]
  - @patchsmith/app@0.1.0-beta.63
  - @patchsmith/cli@0.1.0-beta.63
  - @patchsmith/core@0.1.0-beta.63
  - @patchsmith/react@0.1.0-beta.63
  - @patchsmith/vite@0.1.0-beta.63
  - @patchsmith/ai-sdk@0.1.0-beta.63
  - @patchsmith/app-db@0.1.0-beta.63

## 0.1.0-beta.62

### Patch Changes

- Updated dependencies [a0ed266]
  - @patchsmith/vite@0.1.0-beta.62
  - @patchsmith/cli@0.1.0-beta.62
  - @patchsmith/ai-sdk@0.1.0-beta.62
  - @patchsmith/app@0.1.0-beta.62
  - @patchsmith/app-db@0.1.0-beta.62
  - @patchsmith/core@0.1.0-beta.62
  - @patchsmith/react@0.1.0-beta.62

## 0.1.0-beta.61

### Patch Changes

- Updated dependencies [3c23da7]
- Updated dependencies [dfca420]
  - @patchsmith/vite@0.1.0-beta.61
  - @patchsmith/cli@0.1.0-beta.61
  - @patchsmith/app@0.1.0-beta.61
  - @patchsmith/core@0.1.0-beta.61
  - @patchsmith/react@0.1.0-beta.61
  - @patchsmith/ai-sdk@0.1.0-beta.61
  - @patchsmith/app-db@0.1.0-beta.61

## 0.1.0-beta.60

### Patch Changes

- Updated dependencies [a325be8]
  - @patchsmith/ai-sdk@0.1.0-beta.60
  - @patchsmith/app@0.1.0-beta.60
  - @patchsmith/app-db@0.1.0-beta.60
  - @patchsmith/cli@0.1.0-beta.60
  - @patchsmith/core@0.1.0-beta.60
  - @patchsmith/react@0.1.0-beta.60
  - @patchsmith/vite@0.1.0-beta.60

## 0.1.0-beta.59

### Minor Changes

- c96def0: Register app backend routers automatically from `src/functions/**/*.fn.ts`, replacing the app's `server.ts` entry and `server.entry` configuration. Dots and directories create equivalent namespaces, nested router objects remain supported, and shared namespaces merge. Duplicate functions and function/namespace conflicts throw when the server bundle loads, with their API path and source files. Builds bundle backend code without executing it. Watch builds refresh registrations and generated type-only API bindings as modules change.

  Reject `name` and `then` in every function and namespace segment because those names conflict with client reference properties. The manual `defineServer` composition API is removed; backend registration is owned by file discovery.

### Patch Changes

- Updated dependencies [07731b1]
- Updated dependencies [7a11341]
- Updated dependencies [c96def0]
  - @patchsmith/core@0.1.0-beta.59
  - @patchsmith/react@0.1.0-beta.59
  - @patchsmith/app@0.1.0-beta.59
  - @patchsmith/vite@0.1.0-beta.59
  - @patchsmith/cli@0.1.0-beta.59
  - @patchsmith/ai-sdk@0.1.0-beta.59
  - @patchsmith/app-db@0.1.0-beta.59

## 0.1.0-beta.58

### Patch Changes

- Updated dependencies [bb541bb]
  - @patchsmith/core@0.1.0-beta.58
  - @patchsmith/react@0.1.0-beta.58
  - @patchsmith/ai-sdk@0.1.0-beta.58
  - @patchsmith/cli@0.1.0-beta.58
  - @patchsmith/app@0.1.0-beta.58
  - @patchsmith/app-db@0.1.0-beta.58
  - @patchsmith/vite@0.1.0-beta.58

## 0.1.0-beta.57

### Patch Changes

- Updated dependencies [a963f46]
  - @patchsmith/core@0.1.0-beta.57
  - @patchsmith/ai-sdk@0.1.0-beta.57
  - @patchsmith/cli@0.1.0-beta.57
  - @patchsmith/react@0.1.0-beta.57
  - @patchsmith/app@0.1.0-beta.57
  - @patchsmith/app-db@0.1.0-beta.57
  - @patchsmith/vite@0.1.0-beta.57

## 0.1.0-beta.56

### Patch Changes

- Updated dependencies [74a7a6b]
  - @patchsmith/core@0.1.0-beta.56
  - @patchsmith/react@0.1.0-beta.56
  - @patchsmith/ai-sdk@0.1.0-beta.56
  - @patchsmith/cli@0.1.0-beta.56
  - @patchsmith/app@0.1.0-beta.56
  - @patchsmith/app-db@0.1.0-beta.56
  - @patchsmith/vite@0.1.0-beta.56

## 0.1.0-beta.55

### Minor Changes

- 7f5d15b: Add experimental opt-in canvas surfaces to the low-level iframe sandbox. Hosts register named canvases; apps render with OffscreenCanvas and transfer complete ImageBitmap frames over a dedicated, backpressured channel. The host validates frame dimensions, limits presentation rate, and can revoke surfaces without granting app code access to host DOM.

  Expose experimental_canvas() contract declarations, experimental_canvasRenderer for React hosts, and experimental_useCanvasSurface() for apps, with automatic mounting, resize, dependency redraws, and cleanup. Prefix all canvas public APIs and types with experimental_, including the low-level experimental_requestCanvas() and experimental_registerCanvas() APIs.

  Add create/resize/update/draw/dispose lifecycles with separate creation and update dependencies with cancellation, bounded recovery, invalidation, and optional preserved drawing buffers. Hosts can opt into bounded pointer events and focused, allowlisted keyboard input; apps receive local synthetic canvas events without host DOM references or privileged host operations.

  Add optional app-requested frame rates and timestamp/deltaTime draw contexts. Returning false from a draw callback skips bitmap creation and presentation; continuous skipped frames yield and pending scheduling waits cancel on teardown. Existing void-returning callbacks retain their behavior.

  Permit JavaScript string evaluation and WebAssembly compilation with unsafe-eval inside the opaque-origin iframe. Host DOM isolation, host capability validation, and the worker ban remain enforced.

### Patch Changes

- Updated dependencies [2b3e206]
- Updated dependencies [7f5d15b]
  - @patchsmith/app@0.1.0-beta.55
  - @patchsmith/cli@0.1.0-beta.55
  - @patchsmith/core@0.1.0-beta.55
  - @patchsmith/react@0.1.0-beta.55
  - @patchsmith/vite@0.1.0-beta.55
  - @patchsmith/ai-sdk@0.1.0-beta.55
  - @patchsmith/app-db@0.1.0-beta.55

## 0.1.0-beta.54

### Patch Changes

- d26ee48: Add `createServer({ agent: { instructions } })` for host-provided design conventions, product context, and app-building tips. Apply this guidance alongside the app builder's built-in instructions for MCP tools (including `patchsmith/ai-sdk`) and host-relayed CLI chat, including follow-up turns.
- Updated dependencies [d26ee48]
  - @patchsmith/core@0.1.0-beta.54
  - @patchsmith/ai-sdk@0.1.0-beta.54
  - @patchsmith/cli@0.1.0-beta.54
  - @patchsmith/react@0.1.0-beta.54
  - @patchsmith/app@0.1.0-beta.54
  - @patchsmith/app-db@0.1.0-beta.54
  - @patchsmith/vite@0.1.0-beta.54

## 0.1.0-beta.53

### Minor Changes

- e96dce2: Rename TailorKit to Patchsmith. Install `patchsmith` and `@patchsmith/*` packages, replace `TailorKit`/`tailorkit` identifiers with `Patchsmith`/`patchsmith`, and use the `patchsmith` CLI. Rename `tailorkit.config.ts` to `patchsmith.config.ts`, regenerate app bindings with `patchsmith generate`, and update imports to `#patchsmith` and `src/patchsmith.gen.ts`.

  Move platform URLs to `https://patchsmith.io` and host integration routes to `/api/patchsmith`. Rename `TAILORKIT_*` environment variables to `PATCHSMITH_*`; app output and local credential directories now use `.patchsmith`. Sign in again after upgrading. Hosted app assets and RPC URLs continue to use `tailorkit.app`.

- 1912070: Build packages with Vite+ instead of tsup while preserving public entry points and declaration paths.

  Drop Node.js 20 support and target Node.js 22 for all public packages, including the CLI and sandbox library. Use Node.js 22 or newer. Public package manifests and generated apps declare `engines.node: ">=22"`. Internal builds and workspace manifests require Node.js 24.

### Patch Changes

- f58b745: Add `createTools(patchsmith, { scopes, subjectId })` from `patchsmith/ai-sdk` to execute fixed definitions of the app agent's MCP tools with the AI SDK. Use Valibot for tool schemas and validation. Return destructurable `listApps`, `createApp`, and `editApp` tools while retaining snake_case MCP names internally. Stream MCP activity as preliminary tool results, preserve final structured results, and forward cancellation without replaying app changes.
- d799743: Update package repository links to `patchsmith-io/patchsmith`.
- Updated dependencies [f58b745]
- Updated dependencies [d799743]
- Updated dependencies [e96dce2]
- Updated dependencies [1912070]
  - @patchsmith/ai-sdk@0.1.0-beta.53
  - @patchsmith/app@0.1.0-beta.53
  - @patchsmith/app-db@0.1.0-beta.53
  - @patchsmith/cli@0.1.0-beta.53
  - @patchsmith/core@0.1.0-beta.53
  - @patchsmith/react@0.1.0-beta.53
  - @patchsmith/vite@0.1.0-beta.53

## 0.1.0-beta.52

### Patch Changes

- Updated dependencies [1fa87fe]
  - @patchsmith/app@0.1.0-beta.52
  - @patchsmith/core@0.1.0-beta.52
  - @patchsmith/cli@0.1.0-beta.52
  - @patchsmith/react@0.1.0-beta.52
  - @patchsmith/vite@0.1.0-beta.52
  - @patchsmith/app-db@0.1.0-beta.52

## 0.1.0-beta.51

### Patch Changes

- Updated dependencies [8cbc3d5]
- Updated dependencies [38e1ced]
  - @patchsmith/core@0.1.0-beta.51
  - @patchsmith/cli@0.1.0-beta.51
  - @patchsmith/app@0.1.0-beta.51
  - @patchsmith/react@0.1.0-beta.51
  - @patchsmith/vite@0.1.0-beta.51
  - @patchsmith/app-db@0.1.0-beta.51

## 0.1.0-beta.50

### Minor Changes

- 71fc3a7: Return component callback results across the sandbox bridge instead of dropping them. Callback definitions use only input and output schemas. App callbacks accept direct or promised results, and every host callback returns a promise, including callbacks without an output schema. Callback failures, sandbox destruction, and a 30-second timeout reject pending results.

### Patch Changes

- Updated dependencies [71fc3a7]
- Updated dependencies [78329a9]
  - @patchsmith/core@0.1.0-beta.50
  - @patchsmith/app@0.1.0-beta.50
  - @patchsmith/react@0.1.0-beta.50
  - @patchsmith/cli@0.1.0-beta.50
  - @patchsmith/vite@0.1.0-beta.50
  - @patchsmith/app-db@0.1.0-beta.50

## 0.1.0-beta.49

### Patch Changes

- Updated dependencies [354c1fc]
- Updated dependencies [127b09e]
  - @patchsmith/vite@0.1.0-beta.49
  - @patchsmith/cli@0.1.0-beta.49
  - @patchsmith/app@0.1.0-beta.49
  - @patchsmith/app-db@0.1.0-beta.49
  - @patchsmith/core@0.1.0-beta.49
  - @patchsmith/react@0.1.0-beta.49

## 0.1.0-beta.48

### Minor Changes

- 6a5c17a: Add `createFunctions({ database })` to bind database types and relations once for all query and mutation handlers. Add `defineRouter` for explicit function module exports composed in `defineServer`.

  Remove per-function `.database(...)` builders and the `database` option on standalone query/mutation definitions. Configure `createFunctions({ database })` once in the shared database module and import its `fn` in function modules.

  New apps scaffold the shared `fn`, default router exports, and a namespaced greeting at `api.greeting.getGreeting`. Export each function module with `export default defineRouter({ ... })` and import its default router in the server entry point.

### Patch Changes

- Updated dependencies [434323a]
- Updated dependencies [6a5c17a]
  - @patchsmith/cli@0.1.0-beta.48
  - @patchsmith/app@0.1.0-beta.48
  - @patchsmith/react@0.1.0-beta.48
  - @patchsmith/vite@0.1.0-beta.48
  - @patchsmith/app-db@0.1.0-beta.48
  - @patchsmith/core@0.1.0-beta.48

## 0.1.0-beta.47

### Patch Changes

- Updated dependencies [7bb1392]
  - @patchsmith/cli@0.1.0-beta.47
  - @patchsmith/app@0.1.0-beta.47
  - @patchsmith/app-db@0.1.0-beta.47
  - @patchsmith/core@0.1.0-beta.47
  - @patchsmith/react@0.1.0-beta.47
  - @patchsmith/vite@0.1.0-beta.47

## 0.1.0-beta.46

### Minor Changes

- 20947c7: Move the app database API into the new `@patchsmith/app-db` package, exposed through `patchsmith/db`. Import `defineDatabase`, table and column builders, query helpers, and database types from `patchsmith/db` instead of `patchsmith/server`.

  Use Patchsmith's `defineRelations` from `patchsmith/db` instead of importing it directly from `drizzle-orm`. New apps scaffold these imports automatically. Existing relation callbacks keep the same typed one/many navigation syntax.

### Patch Changes

- Updated dependencies [20947c7]
  - @patchsmith/app@0.1.0-beta.46
  - @patchsmith/app-db@0.1.0-beta.46
  - @patchsmith/cli@0.1.0-beta.46
  - @patchsmith/vite@0.1.0-beta.46
  - @patchsmith/react@0.1.0-beta.46
  - @patchsmith/core@0.1.0-beta.46

## 0.1.0-beta.45

### Minor Changes

- cc1631f: Require `name` and `slug` in `PatchsmithConfig` and validate both when loading app configuration. Add a nonblank display name and a slug containing 3–32 lowercase letters or digits separated by single hyphens to existing `patchsmith.config.ts` files. Deployment uses the configured slug when creating an app; existing linked apps keep their permanent slug. New app scaffolds include both fields using the package name, appending `-app` when the derived slug is shorter than three characters.

### Patch Changes

- Updated dependencies [cc1631f]
  - @patchsmith/vite@0.1.0-beta.45
  - @patchsmith/cli@0.1.0-beta.45
  - @patchsmith/app@0.1.0-beta.45
  - @patchsmith/core@0.1.0-beta.45
  - @patchsmith/react@0.1.0-beta.45

## 0.1.0-beta.44

### Patch Changes

- Restore the 0.x beta release line after the accidental 1.0.0-beta.44 release. This release includes the app slug and validation changes from that release; use 0.1.0-beta.44 instead of 1.0.0-beta.44.
- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.
- Updated dependencies [89d328f]
- Updated dependencies
- Updated dependencies [1fb0155]
  - @patchsmith/core@0.1.0-beta.44
  - @patchsmith/cli@0.1.0-beta.44
  - @patchsmith/app@0.1.0-beta.44
  - @patchsmith/react@0.1.0-beta.44
  - @patchsmith/vite@0.1.0-beta.44

## 1.0.0-beta.44

### Patch Changes

- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.
- Updated dependencies [89d328f]
- Updated dependencies [1fb0155]
  - @patchsmith/core@1.0.0-beta.44
  - @patchsmith/cli@1.0.0-beta.44
  - @patchsmith/app@1.0.0-beta.44
  - @patchsmith/vite@1.0.0-beta.44
  - @patchsmith/react@1.0.0-beta.44

## 0.1.0-beta.43

### Patch Changes

- Updated dependencies [6a68ba5]
  - @patchsmith/core@0.1.0-beta.43
  - @patchsmith/cli@0.1.0-beta.43
  - @patchsmith/react@0.1.0-beta.43
  - @patchsmith/app@0.1.0-beta.43
  - @patchsmith/vite@0.1.0-beta.43

## 0.1.0-beta.42

### Patch Changes

- Updated dependencies [c54e0b1]
  - @patchsmith/cli@0.1.0-beta.42
  - @patchsmith/core@0.1.0-beta.42
  - @patchsmith/react@0.1.0-beta.42
  - @patchsmith/vite@0.1.0-beta.42
  - @patchsmith/app@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- Updated dependencies [d4798f0]
  - @patchsmith/react@0.1.0-beta.41
  - @patchsmith/app@0.1.0-beta.41
  - @patchsmith/cli@0.1.0-beta.41
  - @patchsmith/core@0.1.0-beta.41
  - @patchsmith/vite@0.1.0-beta.41

## 0.1.0-beta.40

### Minor Changes

- 677501e: Add optional `name` and `description` fields to `PatchsmithConfig`. Deployment uses them for new apps and synchronizes configured fields on existing apps. Omitted fields preserve existing values; new apps fall back to the package or directory name and have no description. Set `description: null` to clear it.

### Patch Changes

- Updated dependencies [677501e]
- Updated dependencies [b636758]
  - @patchsmith/vite@0.1.0-beta.40
  - @patchsmith/cli@0.1.0-beta.40
  - @patchsmith/core@0.1.0-beta.40
  - @patchsmith/react@0.1.0-beta.40
  - @patchsmith/app@0.1.0-beta.40

## 0.1.0-beta.39

### Minor Changes

- ad770d2: Add `patchsmith.experimental.installApp({ appId, scope: { name, value } })` to the host server SDK. Install an app's current published deployment into a declared scope in the same project, with an independent installation identity and runtime data. Validate scope inputs against the host contract, keep project credentials server-side, and return the installed app with its views and existing asset URLs. Installations stay pinned when the source app is redeployed.

### Patch Changes

- Updated dependencies [ad770d2]
  - @patchsmith/core@0.1.0-beta.39
  - @patchsmith/cli@0.1.0-beta.39
  - @patchsmith/react@0.1.0-beta.39
  - @patchsmith/app@0.1.0-beta.39
  - @patchsmith/vite@0.1.0-beta.39

## 0.1.0-beta.38

### Patch Changes

- Updated dependencies [469d8c2]
  - @patchsmith/core@0.1.0-beta.38
  - @patchsmith/cli@0.1.0-beta.38
  - @patchsmith/react@0.1.0-beta.38
  - @patchsmith/app@0.1.0-beta.38
  - @patchsmith/vite@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- Updated dependencies [1f6b983]
- Updated dependencies [f2da040]
- Updated dependencies [0d72562]
  - @patchsmith/cli@0.1.0-beta.37
  - @patchsmith/vite@0.1.0-beta.37
  - @patchsmith/core@0.1.0-beta.37
  - @patchsmith/app@0.1.0-beta.37
  - @patchsmith/react@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- Updated dependencies [c0ce502]
  - @patchsmith/cli@0.1.0-beta.36
  - @patchsmith/core@0.1.0-beta.36
  - @patchsmith/react@0.1.0-beta.36
  - @patchsmith/app@0.1.0-beta.36
  - @patchsmith/vite@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- Advance the beta release to retry publishing after npm rejected the previously staged version.
- @patchsmith/app@0.1.0-beta.35
  - @patchsmith/cli@0.1.0-beta.35
  - @patchsmith/core@0.1.0-beta.35
  - @patchsmith/react@0.1.0-beta.35
  - @patchsmith/vite@0.1.0-beta.35

## 0.1.0-beta.34

### Patch Changes

- Updated dependencies [82aa45f]
  - @patchsmith/cli@0.1.0-beta.34
  - @patchsmith/core@0.1.0-beta.34
  - @patchsmith/react@0.1.0-beta.34
  - @patchsmith/app@0.1.0-beta.34
  - @patchsmith/vite@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- Updated dependencies [a215860]
  - @patchsmith/core@0.1.0-beta.33
  - @patchsmith/cli@0.1.0-beta.33
  - @patchsmith/react@0.1.0-beta.33
  - @patchsmith/app@0.1.0-beta.33
  - @patchsmith/vite@0.1.0-beta.33

## 0.1.0-beta.32

### Patch Changes

- Updated dependencies [1929607]
  - @patchsmith/cli@0.1.0-beta.32
  - @patchsmith/core@0.1.0-beta.32
  - @patchsmith/react@0.1.0-beta.32
  - @patchsmith/app@0.1.0-beta.32
  - @patchsmith/vite@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- 4d2f904: Align source code with Ultracite’s default Oxlint and Oxfmt presets while preserving public APIs and runtime lifecycle behavior.
- Updated dependencies [4d2f904]
  - @patchsmith/app@0.1.0-beta.31
  - @patchsmith/core@0.1.0-beta.31
  - @patchsmith/react@0.1.0-beta.31
  - @patchsmith/cli@0.1.0-beta.31
  - @patchsmith/vite@0.1.0-beta.31

## 0.1.0-beta.30

### Minor Changes

- 29f3e30: Move the complete build pipeline and configuration loading into `@patchsmith/vite`. Build Patchsmith apps with the public `patchsmith()` plugin from `patchsmith/vite`. Init now offers Vite+ (recommended, with linting, formatting and testing) or Vite (build only), with one `vite.config.ts` for app tooling. Deploy builds using the app's Vite configuration and installation.

  Remove `patchsmith build`, `buildApp()`, the init lint/format flags, and build settings in `patchsmith.config.ts`. Set `build.outDir` in `vite.config.ts` instead.

### Patch Changes

- f8dce5d: Rename the app function builder export from `tk` to `fn` and update generated apps to use it from `patchsmith/server`.
- Updated dependencies [a79bf54]
- Updated dependencies [f8dce5d]
- Updated dependencies [29f3e30]
  - @patchsmith/react@0.1.0-beta.30
  - @patchsmith/app@0.1.0-beta.30
  - @patchsmith/vite@0.1.0-beta.30
  - @patchsmith/cli@0.1.0-beta.30
  - @patchsmith/core@0.1.0-beta.30

## 0.1.0-beta.29

### Minor Changes

- 3567f94: Expose direct platform MCP access through `server.mcp.transport({ scopes, subjectId? })`, which returns a URL and headers for any HTTP MCP client. Provide list, create, and edit tools using MCP 2026-07-28 with request-scoped SSE progress, with create/edit launching app agents.

### Patch Changes

- Updated dependencies [108aaa9]
- Updated dependencies [3567f94]
  - @patchsmith/cli@0.1.0-beta.29
  - @patchsmith/core@0.1.0-beta.29
  - @patchsmith/react@0.1.0-beta.29
  - @patchsmith/app@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- Updated dependencies [a0ffa4f]
  - @patchsmith/cli@0.1.0-beta.28
  - @patchsmith/core@0.1.0-beta.28
  - @patchsmith/react@0.1.0-beta.28
  - @patchsmith/app@0.1.0-beta.28

## 0.1.0-beta.27

### Minor Changes

- 21761f2: Require an absolute public HTTP(S) `baseUrl` when creating a server. Relative paths and omitted URLs are rejected, and backend sessions and server tool verification always use the configured public origin.

  Move authentication exclusively to `.handler(request, { authenticate })` and remove the server's `assetsBaseUrl` option. Update host integrations to pass authentication on every handler call; client-side asset URL fallbacks remain available through `createClient`.

- 664a460: Allow `useViewContext` errors to be booleans, strings, or `Error` instances. Only `false`, `null`, and `undefined` mean no error; all strings, including an empty string, mark the view as failed. Errors continue to take precedence over loading and suppress context publication.
- 4685874: Remove the React provider's `subjectId` prop and subject-based cache partitioning and remounting. Providers share their client cache, and backend sessions are cached per app until renewal or an explicit refresh. Remove the session provider's subject cache key and the endpoint client's `setSubject` method; authenticated subject identity continues to come from the server.

  Expose `client.clearCache()` to clear shared app data and backend sessions after host authentication changes.

### Patch Changes

- Updated dependencies [be8bce2]
- Updated dependencies [21761f2]
- Updated dependencies [664a460]
- Updated dependencies [4685874]
  - @patchsmith/cli@0.1.0-beta.27
  - @patchsmith/core@0.1.0-beta.27
  - @patchsmith/react@0.1.0-beta.27
  - @patchsmith/app@0.1.0-beta.27

## 0.1.0-beta.26

### Minor Changes

- 3fa95bc: Define shared browser-safe contracts with `defineContract` and `action().input().output()`. Use `createServer` from `patchsmith/server` to implement actions and `createClient` from `patchsmith/react` to infer component, view, slot, and scope types from the same contract.

  Host clients validate view context through the contract's original Standard Schema validators and publish the parsed output. Remove JSON Schema reconstruction and host `/meta` requests; resolve slots locally from the contract and accept an explicit client `assetsBaseUrl` for deployment URL fallbacks. Keep server metadata for app type generation, including scope schemas.

  Migrate existing server configuration into `defineContract`, move handlers and secrets to `createServer`, and replace the server type generic on React clients with a `contract` option.

  Contract actions without an input schema infer `undefined`; actions without an output schema infer `void`. Server implementations use the same contract return types, including `Promise<void>` for asynchronous handlers.

  Pass Valibot's `toJsonSchema` directly as the server `schemaSerializer`. Converters receive JSON Schema 2020-12 options, with `typeMode: "input"` for action inputs and `typeMode: "output"` for action results and other metadata; existing single-argument serializers remain supported.

### Patch Changes

- Updated dependencies [3fa95bc]
  - @patchsmith/core@0.1.0-beta.26
  - @patchsmith/react@0.1.0-beta.26
  - @patchsmith/cli@0.1.0-beta.26
  - @patchsmith/app@0.1.0-beta.26

## 0.1.0-beta.25

### Minor Changes

- 441a5a9: Rename `Slot` to `RenderSlot` (including client-bound `RenderSlot.Controlled`) and replace its `name` prop with `slot`. Rename the public types to `RenderSlotProps`, `ControlledRenderSlotProps`, `RuntimeRenderSlotProps`, `RenderSlotContext`, and `RenderSlotComponent`.

  Remove the standalone `Root` provider and its DOM/render props. Return a client-bound `Provider` from `createPatchsmithClient`, accepting only `children` and `apps`, with the client supplied internally. Export it as `Provider: PatchsmithProvider` alongside the hooks and `RenderSlot`, and wrap host components in `<PatchsmithProvider>`. Export `PatchsmithProviderProps` for the bound provider.

### Patch Changes

- Updated dependencies [441a5a9]
- Updated dependencies [e87dc2c]
  - @patchsmith/react@0.1.0-beta.25
  - @patchsmith/app@0.1.0-beta.25
  - @patchsmith/cli@0.1.0-beta.25
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
  - @patchsmith/cli@0.1.0-beta.24
  - @patchsmith/react@0.1.0-beta.24
  - @patchsmith/core@0.1.0-beta.24

## 0.1.0-beta.23

### Patch Changes

- Updated dependencies [754f2d3]
  - @patchsmith/react@0.1.0-beta.23
  - @patchsmith/app@0.1.0-beta.23
  - @patchsmith/cli@0.1.0-beta.23
  - @patchsmith/core@0.1.0-beta.23

## 0.1.0-beta.22

### Patch Changes

- Updated dependencies [c29880d]
- Updated dependencies [589ffae]
- Updated dependencies [268df1e]
- Updated dependencies [382f569]
  - @patchsmith/app@0.1.0-beta.22
  - @patchsmith/react@0.1.0-beta.22
  - @patchsmith/cli@0.1.0-beta.22
  - @patchsmith/core@0.1.0-beta.22

## 0.1.0-beta.21

### Patch Changes

- 1c52fe8: Add minimal package READMEs with readable names and short descriptions.
- Updated dependencies [1c52fe8]
  - @patchsmith/app@0.1.0-beta.21
  - @patchsmith/cli@0.1.0-beta.21
  - @patchsmith/core@0.1.0-beta.21
  - @patchsmith/react@0.1.0-beta.21

## 0.1.0-beta.20

### Minor Changes

- a2ed82b: Declare multi-instance host slots with `multiple: true` (omitted or false means single-instance). Client-bound `Slot` requires `instanceKey` for multi-instance slots and rejects it for single-instance slots; ready `Slot.Controlled` similarly requires or rejects `instance`.

  Breaking change: rename `createView` to `defineView`, use `defineView({ slot, view, component, ... })` and regenerate app bindings. Multi-instance slots require `instances: { dataSchema, resolve }`; single-instance slots reject it. View registration is restricted to the slot selected in `defineView`. The CLI scaffolds a resolver when the selected host slot supports multiple instances.

### Patch Changes

- Updated dependencies [11b46f8]
- Updated dependencies [a2ed82b]
- Updated dependencies [fc09d5b]
- Updated dependencies [e2de939]
  - @patchsmith/react@0.1.0-beta.20
  - @patchsmith/core@0.1.0-beta.20
  - @patchsmith/app@0.1.0-beta.20
  - @patchsmith/cli@0.1.0-beta.20

## 0.1.0-beta.19

### Minor Changes

- fa05f02: Breaking change: rename the client-bound `useView` hook to `useRegisterView` and its exported `UseView` type to `UseRegisterView`. Update client destructuring, re-exports, imports, and calls to use the new names. The hook's arguments and registration lifecycle are unchanged.
- fa05f02: Add colocated `createView` instance resolvers with a validated data schema and automatic, typed access to registered server queries. The app build uses Oxc to extract resolvers and their dependencies into generated server actions through `_patchsmith.instances.resolve`, addressed by slot and view path, keeping their implementations out of browser bundles. Hosts discover instance support through `instances: true` in deployment and preview view manifests.
- fa05f02: Breaking change: replace `AppView` and `AppViewProps` with client-bound `Slot` and `Slot.Controlled`. Use `<Slot app={app} name="panel" />` for registered view matching. For explicit rendering, `Slot.Controlled` requires a view, status, and complete combined context when ready, and renders the exact view without reading the registry or falling back to ancestors. The old `fallback` and `createIframe` props are no longer exposed.
- fa05f02: Add client-bound `useSlotInstances({ app, slot })` to fetch instances through the authenticated app action endpoint using the matching view and registered ancestor context. Expose loading, errors, and refetch; clear stale data when context or deployment changes. Preserve disabled view paths in manifests so host matching respects blocked fallback, while keeping them out of `useViews` discovery.
- fa05f02: Render dynamic view instances with `Slot instanceKey` or an explicit `Slot.Controlled instance`. Pass the selected instance through the sandbox and expose its validated data through the typed `view.useInstance()` hook. Handle pending requests, resolver errors, and missing keys, and reset view component state when the selected key changes.
- fa05f02: Add client-bound useViews with scopes, appIds, and slot filters. App builds and deployments include view manifests, including preview builds. useApps and useViews share one authenticated app request and filter locally; useApps also accepts appIds. Apps without a view manifest must be redeployed to appear in useViews.

### Patch Changes

- fa05f02: Minify app server bundles with Oxc and allow unused core exports to be tree-shaken, keeping host routing, platform clients, and AI dependencies out of app backends that do not use them.
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
  - @patchsmith/react@0.1.0-beta.19
  - @patchsmith/app@0.1.0-beta.19
  - @patchsmith/cli@0.1.0-beta.19
  - @patchsmith/core@0.1.0-beta.19

## 0.1.0-beta.18

### Minor Changes

- 731e066: Rename host `contexts` declarations to `views` to match slot view references. Replace the `contexts` configuration key and schema property with `views`; each path still maps directly to its data schema. View selection, context composition, and the serialized schema format are unchanged.

### Patch Changes

- Updated dependencies [fc9538d]
- Updated dependencies [6f969e3]
- Updated dependencies [731e066]
  - @patchsmith/cli@0.1.0-beta.18
  - @patchsmith/app@0.1.0-beta.18
  - @patchsmith/core@0.1.0-beta.18
  - @patchsmith/react@0.1.0-beta.18

## 0.1.0-beta.17

### Patch Changes

- Updated dependencies [ba00155]
- Updated dependencies [364d5cd]
- Updated dependencies [72d38cd]
- Updated dependencies [8d1b465]
- Updated dependencies [aad1587]
- Updated dependencies [d586115]
- Updated dependencies [6569f26]
- Updated dependencies [9384481]
  - @patchsmith/core@0.1.0-beta.17
  - @patchsmith/app@0.1.0-beta.17
  - @patchsmith/cli@0.1.0-beta.17
  - @patchsmith/react@0.1.0-beta.17

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
  - @patchsmith/app@0.1.0-beta.16
  - @patchsmith/cli@0.1.0-beta.16
  - @patchsmith/react@0.1.0-beta.16

## 0.1.0-beta.15

### Patch Changes

- Updated dependencies [d3a873e]
  - @patchsmith/react@0.1.0-beta.15
  - @patchsmith/app@0.1.0-beta.15
  - @patchsmith/cli@0.1.0-beta.15
  - @patchsmith/core@0.1.0-beta.15

## 0.1.0-beta.14

### Minor Changes

- 491f715: Rename host context declarations from `views` to `contexts`. Each context path now maps directly to its Zod, Valibot, or ArkType schema.

### Patch Changes

- Updated dependencies [491f715]
- Updated dependencies [e06e450]
- Updated dependencies [9a8ecab]
  - @patchsmith/react@0.1.0-beta.14
  - @patchsmith/cli@0.1.0-beta.14
  - @patchsmith/core@0.1.0-beta.14
  - @patchsmith/app@0.1.0-beta.14

## 0.1.0-beta.13

### Patch Changes

- Updated dependencies [061adb2]
  - @patchsmith/cli@0.1.0-beta.13
  - @patchsmith/core@0.1.0-beta.13
  - @patchsmith/app@0.1.0-beta.13
  - @patchsmith/react@0.1.0-beta.13

## 0.1.0-beta.12

### Patch Changes

- 59ea06d: Fix the preview command when a host returns its successful session payload directly.
- @patchsmith/app@0.1.0-beta.12
  - @patchsmith/cli@0.1.0-beta.12
  - @patchsmith/core@0.1.0-beta.12
  - @patchsmith/react@0.1.0-beta.12

## 0.1.0-beta.11

### Patch Changes

- Updated dependencies [54eb091]
  - @patchsmith/cli@0.1.0-beta.11
  - @patchsmith/core@0.1.0-beta.11
  - @patchsmith/app@0.1.0-beta.11
  - @patchsmith/react@0.1.0-beta.11

## 0.1.0-beta.10

### Patch Changes

- Updated dependencies [a0d3233]
  - @patchsmith/cli@0.1.0-beta.10
  - @patchsmith/core@0.1.0-beta.10
  - @patchsmith/app@0.1.0-beta.10
  - @patchsmith/react@0.1.0-beta.10

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
  - @patchsmith/react@0.1.0-beta.9
  - @patchsmith/cli@0.1.0-beta.9

## 0.1.0-beta.8

### Patch Changes

- Updated dependencies [9e46a8b]
  - @patchsmith/app@0.1.0-beta.8
  - @patchsmith/react@0.1.0-beta.8
  - @patchsmith/cli@0.1.0-beta.8
  - @patchsmith/core@0.1.0-beta.8

## 0.1.0-beta.7

### Patch Changes

- Updated dependencies [2e7b3a4]
  - @patchsmith/app@0.1.0-beta.7
  - @patchsmith/cli@0.1.0-beta.7
  - @patchsmith/core@0.1.0-beta.7
  - @patchsmith/react@0.1.0-beta.7

## 0.1.0-beta.6

### Patch Changes

- @patchsmith/react@0.1.0-beta.6
  - @patchsmith/app@0.1.0-beta.6
  - @patchsmith/cli@0.1.0-beta.6
  - @patchsmith/core@0.1.0-beta.6

## 0.1.0-beta.5

### Patch Changes

- Updated dependencies [695cdad]
  - @patchsmith/core@0.1.0-beta.5
  - @patchsmith/app@0.1.0-beta.5
  - @patchsmith/cli@0.1.0-beta.5
  - @patchsmith/react@0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- 324b281: Resolve public packages to compiled distribution files in both development and production, without custom source export conditions.

  Remove stale source aliases and declaration maps that reference unpublished source files. Generate apps with a single patchsmith dependency and its app subpath exports.

- Updated dependencies [324b281]
  - @patchsmith/cli@0.1.0-beta.4
  - @patchsmith/app@0.1.0-beta.4
  - @patchsmith/core@0.1.0-beta.4
  - @patchsmith/react@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- a02ebee: Include development export targets in published packages so Vite consumers do not need custom resolution conditions. Expose app authoring from `patchsmith/app` and `patchsmith/app/config`.
- Updated dependencies [a02ebee]
  - @patchsmith/app@0.1.0-beta.3
  - @patchsmith/core@0.1.0-beta.3
  - @patchsmith/react@0.1.0-beta.3
  - @patchsmith/cli@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies [586cc14]
  - @patchsmith/core@0.1.0-beta.2
  - @patchsmith/cli@0.1.0-beta.2
  - @patchsmith/react@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Updated dependencies [c0bdd68]
  - @patchsmith/core@0.1.0-beta.1
  - @patchsmith/cli@0.1.0-beta.1
  - @patchsmith/react@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 4230689: Publish the initial Patchsmith beta packages.

### Patch Changes

- Updated dependencies [4230689]
  - @patchsmith/cli@0.1.0-beta.0
  - @patchsmith/core@0.1.0-beta.0
  - @patchsmith/react@0.1.0-beta.0
