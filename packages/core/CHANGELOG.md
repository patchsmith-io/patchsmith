# @patchsmith/core

## 0.1.0-beta.70

### Patch Changes

- 1d21d1b: Add the optional `agent.model` server setting for CLI and MCP app-building runs. Choose GPT-6.1 Sol, Claude Sonnet 5.5, Claude Opus 5.5, GPT-6 Astra, or DeepSeek V4.1 Flash. Omitting the setting keeps GPT-6.1 Sol as the default. Unsupported model IDs are rejected. The public DeepSeek option resolves to the pinned `deepseek/deepseek-v4.1-flash-1017` Gateway snapshot.
- Updated dependencies [1d21d1b]
  - @patchsmith/client-platform@0.1.0-beta.70
  - @patchsmith/app@0.1.0-beta.70

## 0.1.0-beta.69

### Patch Changes

- Updated dependencies [6cdca73]
- Updated dependencies [5a6c00b]
- Updated dependencies [2ac11bc]
  - @patchsmith/client-platform@0.1.0-beta.69
  - @patchsmith/app@0.1.0-beta.69

## 0.1.0-beta.68

### Minor Changes

- a023f8b: Publish files from an app's `assets/` directory with SHA-256 URLs that remain stable across deployments. Resolve files with `assetUrl()` from `patchsmith/client` or Vite `?url` imports. Deployments track their asset references and reuse existing uploads. Each deployment supports up to 256 static assets, including logos. Static files share the 10 MiB deployment budget with client code and server code before and after compression, including reused assets. Upgrade the platform database and backend, then the host SDK, before deploying apps with assets.

  Breaking: logos now reference files inside `assets/`, using paths such as `logos: { light: "logo-light.svg", dark: "logo-dark.svg" }`. Move logo files into `assets/` and remove the directory prefix from config. Logos use the same hashed URLs, deployment references, uploads, verification, and size accounting as other assets; a file used by both variants counts once. The deployment API accepts logo paths instead of separate file metadata and no longer returns dedicated logo uploads. Old logo URLs and deployment logo file references are removed; redeploy apps after upgrading.

### Patch Changes

- Updated dependencies [a023f8b]
  - @patchsmith/app@0.1.0-beta.68
  - @patchsmith/client-platform@0.1.0-beta.68

## 0.1.0-beta.67

### Patch Changes

- @patchsmith/app@0.1.0-beta.67
  - @patchsmith/client-platform@0.1.0-beta.67

## 0.1.0-beta.66

### Patch Changes

- 7ab8c01: Add `instances.cache: "static"` to evaluate instance resolvers during the build, validate their JSON-compatible output, and publish the snapshot with the deployment. The platform resolves static entries without an app runtime session or Cloudflare resolver call. Omitted cache policies and `cache: "none"` retain runtime resolution; client response caching is unchanged.

  Static resolvers take no request arguments and are excluded from deployed bundles. Deploy platform and host support before publishing apps that use static instances.

- Updated dependencies [7ab8c01]
  - @patchsmith/app@0.1.0-beta.66
  - @patchsmith/client-platform@0.1.0-beta.66

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

- Updated dependencies [92fd903]
  - @patchsmith/app@0.1.0-beta.65
  - @patchsmith/client-platform@0.1.0-beta.65

## 0.1.0-beta.64

### Minor Changes

- cb4001c: Include a Lucide-backed Icon in the Zod, Valibot and ArkType primitives and matching React primitives. Keep the standalone Icon({ library: "lucide" }) helpers available for overrides and custom component names. Load validated icon geometry on demand from a versioned catalogue, with request deduplication, caching, stable dimensions and decorative accessibility defaults. Hosts can configure a self-hosted catalogue URL or fetch implementation. The hosted catalogue deploys as an independent Cloudflare Static Assets project.

  Icon props are limited to a required name and optional size. Runtime schemas and generated bindings accept safe string names so hosts, apps, and platforms can run different compatible SDK versions without rejecting newer icons. Export optional `LucideIconName`, `IconName<"lucide">`, and `IconProps<"lucide">` types for app-local name checking, including from the `patchsmith` root entry point. Generated component types also preserve required fields from their schemas.

  Serve icons from `/lucide/v1/<name>.json`, where v1 is the catalogue compatibility version rather than the upstream package version. Generate and commit an additive catalogue snapshot that preserves existing geometry, removed aliases, and license notices across upstream updates and clean deployments. Deploy new assets before apps use new names; missing icons remain empty and retry on later mounts.

- ed31e0e: Add a default `full` radius token with a value of `100%`, allowing primitive components to use `radius="full"` without a custom theme token.

### Patch Changes

- 39bb8e4: Add an internal server option to route view resolution to a separate platform backend while keeping other platform requests on their existing base URL.
- @patchsmith/app@0.1.0-beta.64
  - @patchsmith/client-platform@0.1.0-beta.64

## 0.1.0-beta.63

### Patch Changes

- Updated dependencies [29d4061]
  - @patchsmith/app@0.1.0-beta.63
  - @patchsmith/client-platform@0.1.0-beta.63

## 0.1.0-beta.62

### Patch Changes

- @patchsmith/app@0.1.0-beta.62
  - @patchsmith/client-platform@0.1.0-beta.62

## 0.1.0-beta.61

### Patch Changes

- Updated dependencies [dfca420]
  - @patchsmith/app@0.1.0-beta.61
  - @patchsmith/client-platform@0.1.0-beta.61

## 0.1.0-beta.60

### Patch Changes

- @patchsmith/app@0.1.0-beta.60
  - @patchsmith/client-platform@0.1.0-beta.60

## 0.1.0-beta.59

### Minor Changes

- 07731b1: Resolve view instances through one platform request. The host authenticates the viewer and validates view context; the platform discovers scoped installations, issues private runtime sessions, and calls app resolvers concurrently near the runtime. Preserve ancestor selection, context readiness, cancellation, and credential isolation. Breaking: replace `/apps/runtime/discover` with `/apps/runtime/resolve` and remove the old client operation. Deploy the platform with `/apps/runtime/resolve` first, then upgrade host SDKs. New SDKs do not fall back to `/apps/runtime/discover`; their multiple-slot view requests fail until the new endpoint is available. Existing deployments are unsupported during this coordinated upgrade.

  Limit the instance-resolution phase, including session creation and response reading, to one second across all apps. Cancel outstanding calls at the deadline and return completed, validated app results in discovery order. Return a sanitized 504 only when no app completed. Use Effect for resolution orchestration, interruption, and resource cleanup.

  Require a warnings array on every ready response, with structured per-app timeout warnings alongside partial results and expose them through view queries and `useViews().warnings`. Complete responses expose an empty warning list in the SDK.

### Patch Changes

- Updated dependencies [07731b1]
- Updated dependencies [c96def0]
  - @patchsmith/client-platform@0.1.0-beta.59
  - @patchsmith/app@0.1.0-beta.59

## 0.1.0-beta.58

### Patch Changes

- bb541bb: Keep slot discovery stable when context changes below the slot's deepest supported view. Retain all relevant ancestor context, filters, and explicit refresh behavior while avoiding repeated instance resolution for unrelated child views.

  Expose aggregate Server-Timing durations for host authentication, platform discovery, and instance resolution on views responses, without including app identifiers or credentials.

  Register the host HTTP endpoints under server/routes as oRPC procedures and serve their existing URLs through the OpenAPI transport. Centralize request policy, scoped authentication, bounded backend-session JSON, timing headers and tool preflight handling. Preserve the CLI RPC protocol and HTML approval flow. Unsupported HTTP methods now fall through to the normal 404 response.

  Reject serialized tool requests larger than 1 MiB before JSON decoding or signature verification, including streamed request bodies.

- @patchsmith/app@0.1.0-beta.58
  - @patchsmith/client-platform@0.1.0-beta.58

## 0.1.0-beta.57

### Patch Changes

- a963f46: Reduce `/views` latency by fetching authorized apps and their runtime sessions in one platform request, then resolving instances concurrently without per-app authorization round trips. Runtime credentials remain on the host. Deploy the platform's runtime discovery endpoint before upgrading the SDK.
- Updated dependencies [a963f46]
  - @patchsmith/client-platform@0.1.0-beta.57
  - @patchsmith/app@0.1.0-beta.57

## 0.1.0-beta.56

### Minor Changes

- 74a7a6b: Resolve views through a single authenticated host request. The host discovers authorized installations, validates ancestor context and calls the existing compiled instance actions in parallel. View queries no longer request app runtime sessions or call instance actions from the browser.

  Breaking: deploy the host and client together to enable `POST /views`. Provider-supplied apps now seed only `useApps`; use `appIds` and `scopes` to filter host view discovery. The direct `slotInstances` transport and the previous `createSlotStore` options are removed. `createPatchsmithFetchClient().views(input)` supports server prefetching with a request-scoped authenticated fetch implementation.

### Patch Changes

- @patchsmith/app@0.1.0-beta.56
  - @patchsmith/client-platform@0.1.0-beta.56

## 0.1.0-beta.55

### Minor Changes

- 7f5d15b: Add experimental opt-in canvas surfaces to the low-level iframe sandbox. Hosts register named canvases; apps render with OffscreenCanvas and transfer complete ImageBitmap frames over a dedicated, backpressured channel. The host validates frame dimensions, limits presentation rate, and can revoke surfaces without granting app code access to host DOM.

  Expose experimental_canvas() contract declarations, experimental_canvasRenderer for React hosts, and experimental_useCanvasSurface() for apps, with automatic mounting, resize, dependency redraws, and cleanup. Prefix all canvas public APIs and types with experimental_, including the low-level experimental_requestCanvas() and experimental_registerCanvas() APIs.

  Add create/resize/update/draw/dispose lifecycles with separate creation and update dependencies with cancellation, bounded recovery, invalidation, and optional preserved drawing buffers. Hosts can opt into bounded pointer events and focused, allowlisted keyboard input; apps receive local synthetic canvas events without host DOM references or privileged host operations.

  Add optional app-requested frame rates and timestamp/deltaTime draw contexts. Returning false from a draw callback skips bitmap creation and presentation; continuous skipped frames yield and pending scheduling waits cancel on teardown. Existing void-returning callbacks retain their behavior.

  Permit JavaScript string evaluation and WebAssembly compilation with unsafe-eval inside the opaque-origin iframe. Host DOM isolation, host capability validation, and the worker ban remain enforced.

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.55

## 0.1.0-beta.54

### Patch Changes

- d26ee48: Add `createServer({ agent: { instructions } })` for host-provided design conventions, product context, and app-building tips. Apply this guidance alongside the app builder's built-in instructions for MCP tools (including `patchsmith/ai-sdk`) and host-relayed CLI chat, including follow-up turns.
- Updated dependencies [d26ee48]
  - @patchsmith/client-platform@0.1.0-beta.54

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

## 0.1.0-beta.52

### Minor Changes

- 1fa87fe: Remove legacy session and CLI credential shapes. App sessions now require complete identity metadata, including `identity.subjectId` and `identity.toolUrl`; remove the duplicate top-level subject from host responses and the duplicate top-level tool URL from platform responses. The host forwards the platform session without synthesizing a subject. Share the session validator with the iframe protocol so complete authenticated sessions reach sandboxed apps.

  Custom session providers must return `{ expiresAt, identity, token, url }` with a complete identity. Stored CLI credentials must contain a named scope; delete obsolete entries from `~/.patchsmith/auth.json` and log in again to replace flat-scope or scopeless credentials.

### Patch Changes

- Updated dependencies [1fa87fe]
  - @patchsmith/client-platform@0.1.0-beta.52

## 0.1.0-beta.51

### Minor Changes

- 8cbc3d5: Add optional `description` metadata to component definitions. Descriptions survive host contract serialization and schema parsing, appear in generated capability skill component references, and become documentation comments on generated component bindings. Use them to explain behavior such as controlled values, event timing, and disabled-state semantics. Existing slot descriptions remain available in generated references and binding comments.
- 38e1ced: Require a nonempty `subjectId` in authenticated host contexts, MCP transports, backend sessions, and signed app/tool credentials. App functions and host tools can now rely on `identity.subjectId` being a string.

  Update every host `authenticate()` callback and `server.mcp.transport()` call to supply the authenticated user's stable ID, or a stable service-principal ID for automation. Values must contain 1–256 characters. Return `null` for unauthenticated callers; client-provided IDs and installation-ID fallbacks do not establish a principal.

  Upgrade host integrations before enforcing the new platform/runtime contracts. Existing sessions and signed credentials without a subject are rejected and must be reissued after the host is updated.

### Patch Changes

- Updated dependencies [38e1ced]
  - @patchsmith/client-platform@0.1.0-beta.51

## 0.1.0-beta.50

### Minor Changes

- 71fc3a7: Return component callback results across the sandbox bridge instead of dropping them. Callback definitions use only input and output schemas. App callbacks accept direct or promised results, and every host callback returns a promise, including callbacks without an output schema. Callback failures, sandbox destruction, and a 30-second timeout reject pending results.

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.50

## 0.1.0-beta.49

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.49

## 0.1.0-beta.48

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.48

## 0.1.0-beta.47

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.47

## 0.1.0-beta.46

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.46

## 0.1.0-beta.45

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.45

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

## 1.0.0-beta.44

### Patch Changes

- 89d328f: Add immutable, project-scoped app slugs of 1–32 characters and expose them in app responses. Apps and installations can choose a slug at creation; omitted slugs receive a stable generated username.

  Platform app operations now require an explicit `app: { id }`, `app: { shortId }`, or `app: { slug }` selector instead of guessing an identifier namespace. App operations use POST endpoints with the selector in the body. Deployment creation/listing and agent chat use the same selector. Update the platform client, host, and CLI together with the backend.

- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.
- Updated dependencies [89d328f]
- Updated dependencies [1fb0155]
  - @patchsmith/client-platform@1.0.0-beta.44

## 0.1.0-beta.43

### Minor Changes

- 6a68ba5: Rename publicId fields to shortId and use permanent 12-character DNS-safe identifiers. Address assets and app runtime calls through project short-ID subdomains, and bind runtime tokens to project and app short IDs.

### Patch Changes

- Updated dependencies [6a68ba5]
  - @patchsmith/client-platform@0.1.0-beta.43

## 0.1.0-beta.42

### Minor Changes

- c54e0b1: Remove Patchsmith app previews, including the `patchsmith preview` command, host preview consent and configuration, platform preview APIs and schemas, client preview metadata and stores, live revision subscriptions, and sandbox inline-source loading. Use deployed app builds for host integrations.

### Patch Changes

- Updated dependencies [c54e0b1]
  - @patchsmith/client-platform@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.41

## 0.1.0-beta.40

### Minor Changes

- b636758: Add a Pressable primitive with inline, box, flex, and grid layouts, token-based style props that combine breakpoint and interaction state values, and an onPress callback. The host renders a native button with keyboard activation and disabled behavior; interaction styling stays in the host.

  Replace the `base` style fallback with `default` across primitives. Style props continue to accept token strings and now support conditional objects with host-defined breakpoint names and `:hover`, `:active`, `:focus-visible`, and `:disabled` states. State values can contain breakpoint overrides. Breakpoint names `default` and all names starting with `:` are rejected by TypeScript and at runtime.

  Generate breakpoint and interaction types from serialized component fields, and preserve each property's authored breakpoint order. Breakpoint values require media-query widths; null fallback breakpoints and the generator's legacy `fieldKeys` schema fallback are no longer supported.

  Serialize repeated JSON Schema subtrees once in local `$defs` and reuse them through `$ref`, reducing schema payload size. Type generation resolves local references independently within component fields, callbacks, views, and tools, with explicit errors for unresolved, external, or circular references.

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.40

## 0.1.0-beta.39

### Minor Changes

- ad770d2: Add `patchsmith.experimental.installApp({ appId, scope: { name, value } })` to the host server SDK. Install an app's current published deployment into a declared scope in the same project, with an independent installation identity and runtime data. Validate scope inputs against the host contract, keep project credentials server-side, and return the installed app with its views and existing asset URLs. Installations stay pinned when the source app is redeployed.

### Patch Changes

- Updated dependencies [ad770d2]
  - @patchsmith/client-platform@0.1.0-beta.39

## 0.1.0-beta.38

### Minor Changes

- 469d8c2: Add optional slot descriptions for layout and sizing guidance. Preserve descriptions in serialized host contracts and include them in generated slot documentation for app authors and agents.

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- 0d72562: Name empty contract tables and server function defaults with the exported EmptyDefinitionMap and EmptyFunctions types while preserving their key inference.
- @patchsmith/client-platform@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- c0ce502: Restrict the agent command to apps created by AI, validate explicit app IDs, and mark apps created through the authenticated agent creation flow as AI-created. Reject caller-supplied provenance on general app creation.
- Updated dependencies [c0ce502]
  - @patchsmith/client-platform@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.35

## 0.1.0-beta.34

### Minor Changes

- 82aa45f: Reconnect interrupted agent streams to the existing workflow from the last received chunk, and settle a disconnected turn before sending a follow-up. Relay signed run identities and cleanup completion through the host API.

  Agent chat requires explicit turn or resume requests. Combine thread and run identity in `data-run`, and require `data-run-complete` after workspace cleanup. Remove the separate `data-thread` event and finish-only success handling.

  The app agent checkpoints SDK state directly instead of collecting duplicate model messages. MCP returns the assembled assistant `message` from the output stream instead of a `messages` array.

### Patch Changes

- Updated dependencies [82aa45f]
  - @patchsmith/client-platform@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- a215860: Preserve platform authentication errors during CLI token verification so expired credentials trigger the CLI login approval flow instead of an internal server error.
- @patchsmith/client-platform@0.1.0-beta.33

## 0.1.0-beta.32

### Patch Changes

- Updated dependencies [1929607]
  - @patchsmith/client-platform@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- 4d2f904: Align source code with Ultracite’s default Oxlint and Oxfmt presets while preserving public APIs and runtime lifecycle behavior.
- Updated dependencies [4d2f904]
  - @patchsmith/client-platform@0.1.0-beta.31

## 0.1.0-beta.30

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.30

## 0.1.0-beta.29

### Minor Changes

- 3567f94: Expose direct platform MCP access through `server.mcp.transport({ scopes, subjectId? })`, which returns a URL and headers for any HTTP MCP client. Provide list, create, and edit tools using MCP 2026-07-28 with request-scoped SSE progress, with create/edit launching app agents.

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- a0ffa4f: Send the host URL and a fresh schema snapshot with each CLI agent turn so the remote agent can scaffold and generate bindings against an undeployed local host. Add `--schema <path>` to init and generate for generation from a serialized JSON schema file. Agent workflows require a host URL and accept an optional schema; host-only runs continue fetching the schema normally.
- Updated dependencies [a0ffa4f]
  - @patchsmith/client-platform@0.1.0-beta.28

## 0.1.0-beta.27

### Minor Changes

- 21761f2: Require an absolute public HTTP(S) `baseUrl` when creating a server. Relative paths and omitted URLs are rejected, and backend sessions and server tool verification always use the configured public origin.

  Move authentication exclusively to `.handler(request, { authenticate })` and remove the server's `assetsBaseUrl` option. Update host integrations to pass authentication on every handler call; client-side asset URL fallbacks remain available through `createClient`.

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.27

## 0.1.0-beta.26

### Minor Changes

- 3fa95bc: Define shared browser-safe contracts with `defineContract` and `action().input().output()`. Use `createServer` from `patchsmith/server` to implement actions and `createClient` from `patchsmith/react` to infer component, view, slot, and scope types from the same contract.

  Host clients validate view context through the contract's original Standard Schema validators and publish the parsed output. Remove JSON Schema reconstruction and host `/meta` requests; resolve slots locally from the contract and accept an explicit client `assetsBaseUrl` for deployment URL fallbacks. Keep server metadata for app type generation, including scope schemas.

  Migrate existing server configuration into `defineContract`, move handlers and secrets to `createServer`, and replace the server type generic on React clients with a `contract` option.

  Contract actions without an input schema infer `undefined`; actions without an output schema infer `void`. Server implementations use the same contract return types, including `Promise<void>` for asynchronous handlers.

  Pass Valibot's `toJsonSchema` directly as the server `schemaSerializer`. Converters receive JSON Schema 2020-12 options, with `typeMode: "input"` for action inputs and `typeMode: "output"` for action results and other metadata; existing single-argument serializers remain supported.

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.26

## 0.1.0-beta.25

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.25

## 0.1.0-beta.24

### Minor Changes

- 4985d4e: Replace `useViewContext`'s status union with `{ context, loading?, error? }` so query data, loading, and errors can be passed together. Keep the view path as the first argument and infer the complete context type from that path. Loading defaults to false, errors take precedence, and loading/error states omit context. Update host examples to use the new API.

  Log diagnostics for ready views with missing required context or context that does not match the server's serialized JSON Schema. Allow omitted optional context, skip loading/error states, and suppress repeated errors for unchanged inputs. Reuse the existing Zod dependency to build JSON Schema context validators.

  Move context registration, status handling, equivalent-value deduplication, metadata observation, and diagnostics into the Nanostores-backed `client-core` view context store. Export shared context types so framework adapters can reuse the behavior. React only registers and unregisters context through its lifecycle effects. Remove React forwarding modules for slot and scope helpers and import them directly from `client-core`. Share view-query options and refetch coordination in `client-core`, including awaiting queries after app-discovery retries.

  Generalize remote view state in `client-core` with Nanostores for runtime status, component registrations, and node selectors. Share iframe lifecycle, prop updates, and callback binding across adapters, keep remote views isolated, and react to component renderer updates without recreating the sandbox.

  Use Nano Stores Async for cached fetching and task tracking, and expose cache snapshots as Nano Stores with immediate subscriber cleanup. Use the official React integration for all React store reads; the Preact adapter continues using the official Preact integration.

  Move app-query filtering and result flags, reactive view-query coordination, managed/controlled slot resolution, instance checks, client URL and remote-prop construction, component aliases and client configuration, server/slot types, and primitive/theme CSS generation into client-core. Framework adapters subscribe to shared stores and provide their own rendering and lifecycle handling. Remove the unused React context memo hook. Add a framework-independent app client connection entry point so client-core and the sandbox host do not load Preact through the app client entry point.

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.24

## 0.1.0-beta.23

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.23

## 0.1.0-beta.22

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.22

## 0.1.0-beta.21

### Patch Changes

- 1c52fe8: Add minimal package READMEs with readable names and short descriptions.
- Updated dependencies [1c52fe8]
  - @patchsmith/client-platform@0.1.0-beta.21

## 0.1.0-beta.20

### Minor Changes

- a2ed82b: Declare multi-instance host slots with `multiple: true` (omitted or false means single-instance). Client-bound `Slot` requires `instanceKey` for multi-instance slots and rejects it for single-instance slots; ready `Slot.Controlled` similarly requires or rejects `instance`.

  Breaking change: rename `createView` to `defineView`, use `defineView({ slot, view, component, ... })` and regenerate app bindings. Multi-instance slots require `instances: { dataSchema, resolve }`; single-instance slots reject it. View registration is restricted to the slot selected in `defineView`. The CLI scaffolds a resolver when the selected host slot supports multiple instances.

### Patch Changes

- fc09d5b: Gzip client and server deployment bundles before uploading to reduce transfer and R2 storage. Record compressed byte checksums and sizes, and support gzip deployment metadata while retaining compatibility with uncompressed deployments.

  Raise the maximum client and server bundle size to 3 MiB for uploads and decoded runtime/delivery bytes.

- Updated dependencies [fc09d5b]
  - @patchsmith/client-platform@0.1.0-beta.20

## 0.1.0-beta.19

### Minor Changes

- fa05f02: Add client-bound `useSlotInstances({ app, slot })` to fetch instances through the authenticated app action endpoint using the matching view and registered ancestor context. Expose loading, errors, and refetch; clear stale data when context or deployment changes. Preserve disabled view paths in manifests so host matching respects blocked fallback, while keeping them out of `useViews` discovery.
- fa05f02: Add client-bound useViews with scopes, appIds, and slot filters. App builds and deployments include view manifests, including preview builds. useApps and useViews share one authenticated app request and filter locally; useApps also accepts appIds. Apps without a view manifest must be redeployed to appear in useViews.

### Patch Changes

- fa05f02: Minify app server bundles with Oxc and allow unused core exports to be tree-shaken, keeping host routing, platform clients, and AI dependencies out of app backends that do not use them.
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
  - @patchsmith/client-platform@0.1.0-beta.19

## 0.1.0-beta.18

### Minor Changes

- 731e066: Rename host `contexts` declarations to `views` to match slot view references. Replace the `contexts` configuration key and schema property with `views`; each path still maps directly to its data schema. View selection, context composition, and the serialized schema format are unchanged.

### Patch Changes

- fc9538d: Allow the agent command to search existing apps or create a new app when appId is omitted, then save the chosen app ID in the Patchsmith config for future launches.
- 6f969e3: Add `tailor agent` (also available as `patchsmith agent`), an AI SDK terminal chat interface for the platform app agent. Relay messages through authenticated host oRPC routes and the generated OpenAPI client. Keep conversation history in CLI memory while remote code persists on the app's exclusively mounted Sandbox Drive.
- Updated dependencies [6f969e3]
  - @patchsmith/client-platform@0.1.0-beta.18

## 0.1.0-beta.17

### Patch Changes

- ba00155: Remove backend.resolveInstallation configuration. Backend sessions use the existing host authenticate callback and verified scopes; the platform authorizes the app, resolves its installation and published deployment, and returns its runtime URL. Installation IDs now use the canonical app ID and token subjects represent the authorized installation scope. Data stored under previous host-selected installation IDs requires a separate migration.
- d586115: Preserve nullable types, discriminated unions, records, and tuples in generated view contexts, component props, callbacks, and actions. Accept the JSON Schema keywords emitted for integers, records, and tuples.
- Updated dependencies [ba00155]
  - @patchsmith/client-platform@0.1.0-beta.17

## 0.1.0-beta.16

### Minor Changes

- 14980bc: Upgrade oRPC to 2.0.0-beta.40 with native v2 routing, clients, rate limiting, tracing, and WebSocket transport. Generate OpenAPI 3.2.0 specifications and the corresponding SDK.

  Breaking changes: rename the low-level action RPC from `actions.call` to `actions.execute` (HTTP path `/actions/execute`). The old action endpoint is removed. oRPC v1 clients cannot communicate with v2 servers; upgrade host servers, browser clients, and CLI clients together. REST error JSON no longer includes `status`; read the HTTP response status instead. No v1 protocol, action alias, or error-format compatibility shim is provided.

- b5c6afc: Consolidate the app SDK in @patchsmith/app and expose app client APIs through patchsmith/client and server APIs through patchsmith/server. Provide SQLite schema builders, synchronous Zod-validated queries/mutations, asynchronous external actions, atomic mutation receipts and typed browser references. Use oRPC v2 HTTP for direct sandbox calls and WebSockets for server-driven query snapshots; the bridge supplies scoped platform JWTs and renews authentication. Execute queries, mutations and actions in one private Cloudflare facet, with an ALS-backed fetch guard and local action query/mutation calls and scoped capabilities for HTTPS egress. Keep synchronous database transactions atomic. Actions do not retry automatically or hold database transactions across external work. Track table dependencies and rerun only active affected queries after commit.

  Upload client and private server bundles with committed Drizzle migrations to separate blob prefixes and load published code into isolated Dynamic Worker SQLite facets through apps/apps-worker. Keep stable installation databases across deployments, trusted Effect v4 coordination, and client-only app compatibility. Store migration sources in migrations/ and copy them to .patchsmith/migrations/. Generate migrations explicitly through patchsmith db generate using Drizzle Kit and the existing Patchsmith config, without a separate Drizzle config; builds check the current schema against the latest saved snapshot without rewriting history. Apply pending migrations atomically to each installation before database calls.

  Retire the legacy app-storage SDK, app-platform package, storage CLI commands and bridged database calls. Keep the Apache-2.0 oRPC contract in @patchsmith/app/protocol and execution in the private BUSL-1.1 apps-worker worker. Share private app JWT signing/verification through @patchsmith/api-utils/app-auth, and expose host authorization through backend.resolveInstallation and /backend/session. Effect stays in server auth and trusted runtime code, outside browser entry points.

  Support client.entry and server.entry in patchsmith.config.ts, defaulting to src/client.ts and src/server.ts. Build, deployment type checks, browser/server isolation and API type imports follow the configured entries.

  Share duplicate reactive queries with TanStack Store and retry transient mutation failures with stable receipt IDs. Inline dynamic server imports into one upload, typecheck both app entries, preserve session error codes through the iframe bridge, and mount opaque-origin sandboxes without waiting for backend authentication. Cache published deployment metadata in Cloudflare KV, update it through an authenticated platform-to-worker endpoint, and populate cache misses through the platform API. Existing clients reconnect to the latest server without remounting; deployments must maintain client compatibility.

### Patch Changes

- Updated dependencies [14980bc]
- Updated dependencies [b5c6afc]
  - @patchsmith/client-platform@0.1.0-beta.16

## 0.1.0-beta.15

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.15

## 0.1.0-beta.14

### Patch Changes

- e06e450: Upload complete preview builds to KV in bounded oRPC chunks, accept previews through a host consent page, and stream verified revisions to sandboxed app views.
- Updated dependencies [e06e450]
  - @patchsmith/client-platform@0.1.0-beta.14

## 0.1.0-beta.13

### Patch Changes

- 061adb2: Serve preview assets directly through the authenticated tunnel without starting a local HTTP server, and end preview sessions when the CLI exits or cannot establish its tunnel.
- Updated dependencies [061adb2]
  - @patchsmith/client-platform@0.1.0-beta.13

## 0.1.0-beta.12

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.12

## 0.1.0-beta.11

### Patch Changes

- Updated dependencies [54eb091]
  - @patchsmith/client-platform@0.1.0-beta.11

## 0.1.0-beta.10

### Patch Changes

- a0d3233: Add authenticated local preview tunnels with bounded asset delivery and secure host-side asset proxying.
- Updated dependencies [a0d3233]
  - @patchsmith/client-platform@0.1.0-beta.10

## 0.1.0-beta.9

### Minor Changes

- ced9f2f: Add slot-specific app view selection and layered host views. Host contracts now declare `views` and `slots`; app clients register `slots[name][path]`. Each slot selects one matching view and composes context only from that view and its ancestors. Unsupported matches render nothing, and `false` entries stop fallback.

  React integrations now import `Root`, `AppView`, `useApps`, and `useView` directly. Pass the client to `Root`, add a slot to every app view, publish only each view's own context, and regenerate app bindings. Registries are isolated per root.

  Each slot declares a `views` list typed against the global view definitions. Generated app bindings and explicit host mounts enforce the slot-to-view relationship, and runtime matching only considers supported view paths while retaining inherited ancestor context.

  Publish host view state with `useView(path, { context })` or `useView(path, { status })`.

  The iframe runtime is bundled from TypeScript and accepts only default-exported `defineClient()` clients. Demo clients use that same contract. View ancestry is shared between React, the sandbox, and generated bindings. `Root` supplies one app-discovery state: when `apps` is provided, `useApps()` reads it and skips network discovery.

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.9

## 0.1.0-beta.8

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.8

## 0.1.0-beta.7

### Patch Changes

- 2e7b3a4: Add optional light and dark app logos to the deployment pipeline, including validated SVG, PNG, and WebP uploads, hosted logo URLs, and a 1 MiB combined client asset limit.
- Updated dependencies [2e7b3a4]
  - @patchsmith/client-platform@0.1.0-beta.7

## 0.1.0-beta.6

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.6

## 0.1.0-beta.5

### Patch Changes

- 695cdad: Redirect unauthenticated CLI approval visits through a host application's sign-in page.
- @patchsmith/client-platform@0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- 324b281: Resolve public packages to compiled distribution files in both development and production, without custom source export conditions.

  Remove stale source aliases and declaration maps that reference unpublished source files. Generate apps with a single patchsmith dependency and its app subpath exports.

- Updated dependencies [324b281]
  - @patchsmith/client-platform@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- a02ebee: Include development export targets in published packages so Vite consumers do not need custom resolution conditions. Expose app authoring from `patchsmith/app` and `patchsmith/app/config`.
- Updated dependencies [a02ebee]
  - @patchsmith/client-platform@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- 586cc14: Expose platform-managed app bundle URLs on permanent tenant subdomains in registry responses. Hosted apps do not require an assetsBaseUrl override or direct access to the platform's storage provider.
- Updated dependencies [586cc14]
  - @patchsmith/client-platform@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- c0bdd68: Test the trusted-publishing beta release flow.
- @patchsmith/client-platform@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 4230689: Publish the initial Patchsmith beta packages.

### Patch Changes

- Updated dependencies [4230689]
  - @patchsmith/client-platform@0.1.0-beta.0
