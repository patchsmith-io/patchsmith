# @patchsmith/client-platform

## 0.1.0-beta.72

No changes in this release.

## 0.1.0-beta.71

### Patch Changes

- 9b669cb: Add `openai/gpt-6.1-sol-fast` as a supported `agent.model` option for CLI and MCP app-building runs. Sol Fast uses low reasoning effort, and omitting the setting keeps regular Sol as the default.

## 0.1.0-beta.70

### Patch Changes

- 1d21d1b: Add the optional `agent.model` server setting for CLI and MCP app-building runs. Choose GPT-6.1 Sol, Claude Sonnet 5.5, Claude Opus 5.5, GPT-6 Astra, or DeepSeek V4.1 Flash. Omitting the setting keeps GPT-6.1 Sol as the default. Unsupported model IDs are rejected. The public DeepSeek option resolves to the pinned `deepseek/deepseek-v4.1-flash-1017` Gateway snapshot.

## 0.1.0-beta.69

### Patch Changes

- 6cdca73: Expose deployment publication validation (400) and verification infrastructure (503) errors. Correct invalid uploads before publishing again; retry publication of the same deployment after a temporary infrastructure failure.
- 5a6c00b: Add typed `409 CONFLICT` responses for overlapping deployment publication requests. Repeated requests for a published deployment return its stored result without repeating rollout or warm-up.

## 0.1.0-beta.68

### Minor Changes

- a023f8b: Publish files from an app's `assets/` directory with SHA-256 URLs that remain stable across deployments. Resolve files with `assetUrl()` from `patchsmith/client` or Vite `?url` imports. Deployments track their asset references and reuse existing uploads. Each deployment supports up to 256 static assets, including logos. Static files share the 10 MiB deployment budget with client code and server code before and after compression, including reused assets. Upgrade the platform database and backend, then the host SDK, before deploying apps with assets.

  Breaking: logos now reference files inside `assets/`, using paths such as `logos: { light: "logo-light.svg", dark: "logo-dark.svg" }`. Move logo files into `assets/` and remove the directory prefix from config. Logos use the same hashed URLs, deployment references, uploads, verification, and size accounting as other assets; a file used by both variants counts once. The deployment API accepts logo paths instead of separate file metadata and no longer returns dedicated logo uploads. Old logo URLs and deployment logo file references are removed; redeploy apps after upgrading.

## 0.1.0-beta.67

No changes in this release.

## 0.1.0-beta.66

### Patch Changes

- 7ab8c01: Add `instances.cache: "static"` to evaluate instance resolvers during the build, validate their JSON-compatible output, and publish the snapshot with the deployment. The platform resolves static entries without an app runtime session or Cloudflare resolver call. Omitted cache policies and `cache: "none"` retain runtime resolution; client response caching is unchanged.

  Static resolvers take no request arguments and are excluded from deployed bundles. Deploy platform and host support before publishing apps that use static instances.

## 0.1.0-beta.65

### Patch Changes

- 92fd903: Add host-defined hooks with typed app handlers discovered from `src/hooks/**/*.hook.ts`. Hosts can discover supporting installations and invoke hooks with validated inputs, outputs, scopes, and hook-specific sessions. Hooks can only be invoked by the host, not through nested action calls. Both hook methods accept `scopes` and `subjectId` directly in their options. App authors use `defineHook`; hook registration stays in the builder-only internal server entry point. Handlers can call registered app queries, mutations, actions, and host server tools. Actions can also call other declared actions with the same identity and cancellation lifetime.

  Synchronous schema serialization treats asynchronous validators as required in generated hook and view bindings.

  Hook names are stored on deployments and exposed through installation metadata, so hosts can discover support without calling app runtimes. Existing deployments and older uploaders default to no hooks; rebuild and republish to advertise hook support.

  All rebuilt server bundles require a runtime supporting `nested-actions`; hook-enabled builds also require `hooks`. Older runtimes reject these bundles, including apps without hooks. Deploy the database migration first, then the updated platform and app runtime before publishing the updated SDK or rebuilding apps. Scheduling and durable retries remain controlled by the host.

## 0.1.0-beta.64

No changes in this release.

## 0.1.0-beta.63

No changes in this release.

## 0.1.0-beta.62

No changes in this release.

## 0.1.0-beta.61

No changes in this release.

## 0.1.0-beta.60

No changes in this release.

## 0.1.0-beta.59

### Minor Changes

- 07731b1: Resolve view instances through one platform request. The host authenticates the viewer and validates view context; the platform discovers scoped installations, issues private runtime sessions, and calls app resolvers concurrently near the runtime. Preserve ancestor selection, context readiness, cancellation, and credential isolation. Breaking: replace `/apps/runtime/discover` with `/apps/runtime/resolve` and remove the old client operation. Deploy the platform with `/apps/runtime/resolve` first, then upgrade host SDKs. New SDKs do not fall back to `/apps/runtime/discover`; their multiple-slot view requests fail until the new endpoint is available. Existing deployments are unsupported during this coordinated upgrade.

  Limit the instance-resolution phase, including session creation and response reading, to one second across all apps. Cancel outstanding calls at the deadline and return completed, validated app results in discovery order. Return a sanitized 504 only when no app completed. Use Effect for resolution orchestration, interruption, and resource cleanup.

  Require a warnings array on every ready response, with structured per-app timeout warnings alongside partial results and expose them through view queries and `useViews().warnings`. Complete responses expose an empty warning list in the SDK.

## 0.1.0-beta.58

No changes in this release.

## 0.1.0-beta.57

### Patch Changes

- a963f46: Reduce `/views` latency by fetching authorized apps and their runtime sessions in one platform request, then resolving instances concurrently without per-app authorization round trips. Runtime credentials remain on the host. Deploy the platform's runtime discovery endpoint before upgrading the SDK.

## 0.1.0-beta.56

No changes in this release.

## 0.1.0-beta.55

No changes in this release.

## 0.1.0-beta.54

### Patch Changes

- d26ee48: Add `createServer({ agent: { instructions } })` for host-provided design conventions, product context, and app-building tips. Apply this guidance alongside the app builder's built-in instructions for MCP tools (including `patchsmith/ai-sdk`) and host-relayed CLI chat, including follow-up turns.

## 0.1.0-beta.53

### Minor Changes

- e96dce2: Rename TailorKit to Patchsmith. Install `patchsmith` and `@patchsmith/*` packages, replace `TailorKit`/`tailorkit` identifiers with `Patchsmith`/`patchsmith`, and use the `patchsmith` CLI. Rename `tailorkit.config.ts` to `patchsmith.config.ts`, regenerate app bindings with `patchsmith generate`, and update imports to `#patchsmith` and `src/patchsmith.gen.ts`.

  Move platform URLs to `https://patchsmith.io` and host integration routes to `/api/patchsmith`. Rename `TAILORKIT_*` environment variables to `PATCHSMITH_*`; app output and local credential directories now use `.patchsmith`. Sign in again after upgrading. Hosted app assets and RPC URLs continue to use `tailorkit.app`.

- 1912070: Build packages with Vite+ instead of tsup while preserving public entry points and declaration paths.

  Drop Node.js 20 support and target Node.js 22 for all public packages, including the CLI and sandbox library. Use Node.js 22 or newer. Public package manifests and generated apps declare `engines.node: ">=22"`. Internal builds and workspace manifests require Node.js 24.

### Patch Changes

- d799743: Update package repository links to `patchsmith-io/patchsmith`.

## 0.1.0-beta.52

### Minor Changes

- 1fa87fe: Remove legacy session and CLI credential shapes. App sessions now require complete identity metadata, including `identity.subjectId` and `identity.toolUrl`; remove the duplicate top-level subject from host responses and the duplicate top-level tool URL from platform responses. The host forwards the platform session without synthesizing a subject. Share the session validator with the iframe protocol so complete authenticated sessions reach sandboxed apps.

  Custom session providers must return `{ expiresAt, identity, token, url }` with a complete identity. Stored CLI credentials must contain a named scope; delete obsolete entries from `~/.patchsmith/auth.json` and log in again to replace flat-scope or scopeless credentials.

## 0.1.0-beta.51

### Minor Changes

- 38e1ced: Require a nonempty `subjectId` in authenticated host contexts, MCP transports, backend sessions, and signed app/tool credentials. App functions and host tools can now rely on `identity.subjectId` being a string.

  Update every host `authenticate()` callback and `server.mcp.transport()` call to supply the authenticated user's stable ID, or a stable service-principal ID for automation. Values must contain 1–256 characters. Return `null` for unauthenticated callers; client-provided IDs and installation-ID fallbacks do not establish a principal.

  Upgrade host integrations before enforcing the new platform/runtime contracts. Existing sessions and signed credentials without a subject are rejected and must be reissued after the host is updated.

## 0.1.0-beta.50

No changes in this release.

## 0.1.0-beta.49

No changes in this release.

## 0.1.0-beta.48

No changes in this release.

## 0.1.0-beta.47

No changes in this release.

## 0.1.0-beta.46

No changes in this release.

## 0.1.0-beta.45

No changes in this release.

## 0.1.0-beta.44

### Minor Changes

- 89d328f: Add immutable, project-scoped app slugs of 1–32 characters and expose them in app responses. Apps and installations can choose a slug at creation; omitted slugs receive a stable generated username.

  Platform app operations now require an explicit `app: { id }`, `app: { shortId }`, or `app: { slug }` selector instead of guessing an identifier namespace. App operations use POST endpoints with the selector in the body. Deployment creation/listing and agent chat use the same selector. Update the platform client, host, and CLI together with the backend.

### Patch Changes

- Restore the 0.x beta release line after the accidental 1.0.0-beta.44 release. This release includes the app slug and validation changes from that release; use 0.1.0-beta.44 instead of 1.0.0-beta.44.
- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.

## 1.0.0-beta.44

### Major Changes

- 89d328f: Add immutable, project-scoped app slugs of 1–32 characters and expose them in app responses. Apps and installations can choose a slug at creation; omitted slugs receive a stable generated username.

  Platform app operations now require an explicit `app: { id }`, `app: { shortId }`, or `app: { slug }` selector instead of guessing an identifier namespace. App operations use POST endpoints with the selector in the body. Deployment creation/listing and agent chat use the same selector. Update the platform client, host, and CLI together with the backend.

### Patch Changes

- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.

## 0.1.0-beta.43

### Minor Changes

- 6a68ba5: Rename publicId fields to shortId and use permanent 12-character DNS-safe identifiers. Address assets and app runtime calls through project short-ID subdomains, and bind runtime tokens to project and app short IDs.

## 0.1.0-beta.42

### Minor Changes

- c54e0b1: Remove Patchsmith app previews, including the `patchsmith preview` command, host preview consent and configuration, platform preview APIs and schemas, client preview metadata and stores, live revision subscriptions, and sandbox inline-source loading. Use deployed app builds for host integrations.

## 0.1.0-beta.41

No changes in this release.

## 0.1.0-beta.40

No changes in this release.

## 0.1.0-beta.39

### Minor Changes

- ad770d2: Add `patchsmith.experimental.installApp({ appId, scope: { name, value } })` to the host server SDK. Install an app's current published deployment into a declared scope in the same project, with an independent installation identity and runtime data. Validate scope inputs against the host contract, keep project credentials server-side, and return the installed app with its views and existing asset URLs. Installations stay pinned when the source app is redeployed.

## 0.1.0-beta.38

No changes in this release.

## 0.1.0-beta.37

No changes in this release.

## 0.1.0-beta.36

### Patch Changes

- c0ce502: Restrict the agent command to apps created by AI, validate explicit app IDs, and mark apps created through the authenticated agent creation flow as AI-created. Reject caller-supplied provenance on general app creation.

## 0.1.0-beta.35

No changes in this release.

## 0.1.0-beta.34

### Minor Changes

- 82aa45f: Reconnect interrupted agent streams to the existing workflow from the last received chunk, and settle a disconnected turn before sending a follow-up. Relay signed run identities and cleanup completion through the host API.

  Agent chat requires explicit turn or resume requests. Combine thread and run identity in `data-run`, and require `data-run-complete` after workspace cleanup. Remove the separate `data-thread` event and finish-only success handling.

  The app agent checkpoints SDK state directly instead of collecting duplicate model messages. MCP returns the assembled assistant `message` from the output stream instead of a `messages` array.

## 0.1.0-beta.33

No changes in this release.

## 0.1.0-beta.32

### Minor Changes

- 1929607: Start a new agent conversation for each CLI invocation by default. Follow-up messages reuse its thread, and `patchsmith agent --thread <id>` explicitly resumes a previous conversation. Add optional `threadId` to the chat protocol and return thread metadata in the stream.

## 0.1.0-beta.31

### Patch Changes

- 4d2f904: Align source code with Ultracite’s default Oxlint and Oxfmt presets while preserving public APIs and runtime lifecycle behavior.

## 0.1.0-beta.30

No changes in this release.

## 0.1.0-beta.29

No changes in this release.

## 0.1.0-beta.28

### Patch Changes

- a0ffa4f: Send the host URL and a fresh schema snapshot with each CLI agent turn so the remote agent can scaffold and generate bindings against an undeployed local host. Add `--schema <path>` to init and generate for generation from a serialized JSON schema file. Agent workflows require a host URL and accept an optional schema; host-only runs continue fetching the schema normally.

## 0.1.0-beta.27

No changes in this release.

## 0.1.0-beta.26

No changes in this release.

## 0.1.0-beta.25

No changes in this release.

## 0.1.0-beta.24

No changes in this release.

## 0.1.0-beta.23

No changes in this release.

## 0.1.0-beta.22

No changes in this release.

## 0.1.0-beta.21

### Patch Changes

- 1c52fe8: Add minimal package READMEs with readable names and short descriptions.

## 0.1.0-beta.20

### Patch Changes

- fc09d5b: Gzip client and server deployment bundles before uploading to reduce transfer and R2 storage. Record compressed byte checksums and sizes, and support gzip deployment metadata while retaining compatibility with uncompressed deployments.

  Raise the maximum client and server bundle size to 3 MiB for uploads and decoded runtime/delivery bytes.

## 0.1.0-beta.19

### Minor Changes

- fa05f02: Add client-bound useViews with scopes, appIds, and slot filters. App builds and deployments include view manifests, including preview builds. useApps and useViews share one authenticated app request and filter locally; useApps also accepts appIds. Apps without a view manifest must be redeployed to appear in useViews.

### Patch Changes

- fa05f02: Add client-bound `useSlotInstances({ app, slot })` to fetch instances through the authenticated app action endpoint using the matching view and registered ancestor context. Expose loading, errors, and refetch; clear stale data when context or deployment changes. Preserve disabled view paths in manifests so host matching respects blocked fallback, while keeping them out of `useViews` discovery.

## 0.1.0-beta.18

### Patch Changes

- 6f969e3: Add `tailor agent` (also available as `patchsmith agent`), an AI SDK terminal chat interface for the platform app agent. Relay messages through authenticated host oRPC routes and the generated OpenAPI client. Keep conversation history in CLI memory while remote code persists on the app's exclusively mounted Sandbox Drive.

## 0.1.0-beta.17

### Patch Changes

- ba00155: Remove backend.resolveInstallation configuration. Backend sessions use the existing host authenticate callback and verified scopes; the platform authorizes the app, resolves its installation and published deployment, and returns its runtime URL. Installation IDs now use the canonical app ID and token subjects represent the authorized installation scope. Data stored under previous host-selected installation IDs requires a separate migration.

## 0.1.0-beta.16

### Minor Changes

- 14980bc: Upgrade oRPC to 2.0.0-beta.40 with native v2 routing, clients, rate limiting, tracing, and WebSocket transport. Generate OpenAPI 3.2.0 specifications and the corresponding SDK.

  Breaking changes: rename the low-level action RPC from `actions.call` to `actions.execute` (HTTP path `/actions/execute`). The old action endpoint is removed. oRPC v1 clients cannot communicate with v2 servers; upgrade host servers, browser clients, and CLI clients together. REST error JSON no longer includes `status`; read the HTTP response status instead. No v1 protocol, action alias, or error-format compatibility shim is provided.

- b5c6afc: Consolidate the app SDK in @patchsmith/app and expose app client APIs through patchsmith/client and server APIs through patchsmith/server. Provide SQLite schema builders, synchronous Zod-validated queries/mutations, asynchronous external actions, atomic mutation receipts and typed browser references. Use oRPC v2 HTTP for direct sandbox calls and WebSockets for server-driven query snapshots; the bridge supplies scoped platform JWTs and renews authentication. Execute queries, mutations and actions in one private Cloudflare facet, with an ALS-backed fetch guard and local action query/mutation calls and scoped capabilities for HTTPS egress. Keep synchronous database transactions atomic. Actions do not retry automatically or hold database transactions across external work. Track table dependencies and rerun only active affected queries after commit.

  Upload client and private server bundles with committed Drizzle migrations to separate blob prefixes and load published code into isolated Dynamic Worker SQLite facets through apps/apps-worker. Keep stable installation databases across deployments, trusted Effect v4 coordination, and client-only app compatibility. Store migration sources in migrations/ and copy them to .patchsmith/migrations/. Generate migrations explicitly through patchsmith db generate using Drizzle Kit and the existing Patchsmith config, without a separate Drizzle config; builds check the current schema against the latest saved snapshot without rewriting history. Apply pending migrations atomically to each installation before database calls.

  Retire the legacy app-storage SDK, app-platform package, storage CLI commands and bridged database calls. Keep the Apache-2.0 oRPC contract in @patchsmith/app/protocol and execution in the private BUSL-1.1 apps-worker worker. Share private app JWT signing/verification through @patchsmith/api-utils/app-auth, and expose host authorization through backend.resolveInstallation and /backend/session. Effect stays in server auth and trusted runtime code, outside browser entry points.

  Support client.entry and server.entry in patchsmith.config.ts, defaulting to src/client.ts and src/server.ts. Build, deployment type checks, browser/server isolation and API type imports follow the configured entries.

  Share duplicate reactive queries with TanStack Store and retry transient mutation failures with stable receipt IDs. Inline dynamic server imports into one upload, typecheck both app entries, preserve session error codes through the iframe bridge, and mount opaque-origin sandboxes without waiting for backend authentication. Cache published deployment metadata in Cloudflare KV, update it through an authenticated platform-to-worker endpoint, and populate cache misses through the platform API. Existing clients reconnect to the latest server without remounting; deployments must maintain client compatibility.

## 0.1.0-beta.15

No changes in this release.

## 0.1.0-beta.14

### Patch Changes

- e06e450: Upload complete preview builds to KV in bounded oRPC chunks, accept previews through a host consent page, and stream verified revisions to sandboxed app views.

## 0.1.0-beta.13

### Patch Changes

- 061adb2: Serve preview assets directly through the authenticated tunnel without starting a local HTTP server, and end preview sessions when the CLI exits or cannot establish its tunnel.

## 0.1.0-beta.12

No changes in this release.

## 0.1.0-beta.11

### Patch Changes

- 54eb091: Use a typed oRPC WebSocket client for local preview tunnels and generate the platform HTTP client from the OpenAPI schema.

## 0.1.0-beta.10

### Patch Changes

- a0d3233: Add authenticated local preview tunnels with bounded asset delivery and secure host-side asset proxying.

## 0.1.0-beta.9

## 0.1.0-beta.8

## 0.1.0-beta.7

### Patch Changes

- 2e7b3a4: Add optional light and dark app logos to the deployment pipeline, including validated SVG, PNG, and WebP uploads, hosted logo URLs, and a 1 MiB combined client asset limit.

## 0.1.0-beta.6

## 0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- 324b281: Resolve public packages to compiled distribution files in both development and production, without custom source export conditions.

  Remove stale source aliases and declaration maps that reference unpublished source files. Generate apps with a single patchsmith dependency and its app subpath exports.

## 0.1.0-beta.3

### Patch Changes

- a02ebee: Include development export targets in published packages so Vite consumers do not need custom resolution conditions. Expose app authoring from `patchsmith/app` and `patchsmith/app/config`.

## 0.1.0-beta.2

### Patch Changes

- 586cc14: Expose platform-managed app bundle URLs on permanent tenant subdomains in registry responses. Hosted apps do not require an assetsBaseUrl override or direct access to the platform's storage provider.

## 0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 4230689: Publish the initial Patchsmith beta packages.
