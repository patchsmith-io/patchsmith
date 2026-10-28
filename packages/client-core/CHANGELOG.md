# @patchsmith/client-core

## 0.1.0-beta.72

### Patch Changes

- @patchsmith/app@0.1.0-beta.72
  - @patchsmith/core@0.1.0-beta.72
  - @patchsmith/sandbox@0.1.0-beta.72

## 0.1.0-beta.71

### Patch Changes

- Updated dependencies [9b669cb]
  - @patchsmith/core@0.1.0-beta.71
  - @patchsmith/sandbox@0.1.0-beta.71
  - @patchsmith/app@0.1.0-beta.71

## 0.1.0-beta.70

### Patch Changes

- Updated dependencies [1d21d1b]
  - @patchsmith/core@0.1.0-beta.70
  - @patchsmith/sandbox@0.1.0-beta.70
  - @patchsmith/app@0.1.0-beta.70

## 0.1.0-beta.69

### Patch Changes

- Updated dependencies [2ac11bc]
  - @patchsmith/app@0.1.0-beta.69
  - @patchsmith/core@0.1.0-beta.69
  - @patchsmith/sandbox@0.1.0-beta.69

## 0.1.0-beta.68

### Patch Changes

- Updated dependencies [a023f8b]
  - @patchsmith/app@0.1.0-beta.68
  - @patchsmith/core@0.1.0-beta.68
  - @patchsmith/sandbox@0.1.0-beta.68

## 0.1.0-beta.67

### Patch Changes

- @patchsmith/app@0.1.0-beta.67
  - @patchsmith/core@0.1.0-beta.67
  - @patchsmith/sandbox@0.1.0-beta.67

## 0.1.0-beta.66

### Patch Changes

- Updated dependencies [7ab8c01]
  - @patchsmith/app@0.1.0-beta.66
  - @patchsmith/core@0.1.0-beta.66
  - @patchsmith/sandbox@0.1.0-beta.66

## 0.1.0-beta.65

### Patch Changes

- Updated dependencies [416cd4c]
- Updated dependencies [92fd903]
  - @patchsmith/core@0.1.0-beta.65
  - @patchsmith/app@0.1.0-beta.65
  - @patchsmith/sandbox@0.1.0-beta.65

## 0.1.0-beta.64

### Patch Changes

- Updated dependencies [cb4001c]
- Updated dependencies [39bb8e4]
- Updated dependencies [ed31e0e]
  - @patchsmith/core@0.1.0-beta.64
  - @patchsmith/sandbox@0.1.0-beta.64
  - @patchsmith/app@0.1.0-beta.64

## 0.1.0-beta.63

### Patch Changes

- Updated dependencies [29d4061]
  - @patchsmith/app@0.1.0-beta.63
  - @patchsmith/sandbox@0.1.0-beta.63
  - @patchsmith/core@0.1.0-beta.63

## 0.1.0-beta.62

### Patch Changes

- @patchsmith/app@0.1.0-beta.62
  - @patchsmith/core@0.1.0-beta.62
  - @patchsmith/sandbox@0.1.0-beta.62

## 0.1.0-beta.61

### Patch Changes

- Updated dependencies [dfca420]
  - @patchsmith/app@0.1.0-beta.61
  - @patchsmith/core@0.1.0-beta.61
  - @patchsmith/sandbox@0.1.0-beta.61

## 0.1.0-beta.60

### Patch Changes

- @patchsmith/app@0.1.0-beta.60
  - @patchsmith/core@0.1.0-beta.60
  - @patchsmith/sandbox@0.1.0-beta.60

## 0.1.0-beta.59

### Minor Changes

- 07731b1: Resolve view instances through one platform request. The host authenticates the viewer and validates view context; the platform discovers scoped installations, issues private runtime sessions, and calls app resolvers concurrently near the runtime. Preserve ancestor selection, context readiness, cancellation, and credential isolation. Breaking: replace `/apps/runtime/discover` with `/apps/runtime/resolve` and remove the old client operation. Deploy the platform with `/apps/runtime/resolve` first, then upgrade host SDKs. New SDKs do not fall back to `/apps/runtime/discover`; their multiple-slot view requests fail until the new endpoint is available. Existing deployments are unsupported during this coordinated upgrade.

  Limit the instance-resolution phase, including session creation and response reading, to one second across all apps. Cancel outstanding calls at the deadline and return completed, validated app results in discovery order. Return a sanitized 504 only when no app completed. Use Effect for resolution orchestration, interruption, and resource cleanup.

  Require a warnings array on every ready response, with structured per-app timeout warnings alongside partial results and expose them through view queries and `useViews().warnings`. Complete responses expose an empty warning list in the SDK.

- 7a11341: Expose uncached, validated host requests through `createClient().api.apps()` and `createClient().api.views(input)`. Use these Promise-based methods with TanStack Query or another cache, with an optional `signal` field for cancellation. Both endpoints accept a single options object; standalone `createEndpointClient` callers should replace positional signal arguments with `apps({ signal })` and `views({ ...input, signal })`. Existing `useApps` and `useViews` hooks retain their nanostore cache.

### Patch Changes

- Updated dependencies [07731b1]
- Updated dependencies [c96def0]
  - @patchsmith/core@0.1.0-beta.59
  - @patchsmith/app@0.1.0-beta.59
  - @patchsmith/sandbox@0.1.0-beta.59

## 0.1.0-beta.58

### Patch Changes

- bb541bb: Keep slot discovery stable when context changes below the slot's deepest supported view. Retain all relevant ancestor context, filters, and explicit refresh behavior while avoiding repeated instance resolution for unrelated child views.

  Expose aggregate Server-Timing durations for host authentication, platform discovery, and instance resolution on views responses, without including app identifiers or credentials.

  Register the host HTTP endpoints under server/routes as oRPC procedures and serve their existing URLs through the OpenAPI transport. Centralize request policy, scoped authentication, bounded backend-session JSON, timing headers and tool preflight handling. Preserve the CLI RPC protocol and HTML approval flow. Unsupported HTTP methods now fall through to the normal 404 response.

  Reject serialized tool requests larger than 1 MiB before JSON decoding or signature verification, including streamed request bodies.

- Updated dependencies [bb541bb]
  - @patchsmith/core@0.1.0-beta.58
  - @patchsmith/sandbox@0.1.0-beta.58
  - @patchsmith/app@0.1.0-beta.58

## 0.1.0-beta.57

### Patch Changes

- Updated dependencies [a963f46]
  - @patchsmith/core@0.1.0-beta.57
  - @patchsmith/sandbox@0.1.0-beta.57
  - @patchsmith/app@0.1.0-beta.57

## 0.1.0-beta.56

### Minor Changes

- 74a7a6b: Resolve views through a single authenticated host request. The host discovers authorized installations, validates ancestor context and calls the existing compiled instance actions in parallel. View queries no longer request app runtime sessions or call instance actions from the browser.

  Breaking: deploy the host and client together to enable `POST /views`. Provider-supplied apps now seed only `useApps`; use `appIds` and `scopes` to filter host view discovery. The direct `slotInstances` transport and the previous `createSlotStore` options are removed. `createPatchsmithFetchClient().views(input)` supports server prefetching with a request-scoped authenticated fetch implementation.

### Patch Changes

- Updated dependencies [74a7a6b]
  - @patchsmith/core@0.1.0-beta.56
  - @patchsmith/sandbox@0.1.0-beta.56
  - @patchsmith/app@0.1.0-beta.56

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
  - @patchsmith/sandbox@0.1.0-beta.55
  - @patchsmith/core@0.1.0-beta.55

## 0.1.0-beta.54

### Patch Changes

- Updated dependencies [d26ee48]
  - @patchsmith/core@0.1.0-beta.54
  - @patchsmith/sandbox@0.1.0-beta.54
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
  - @patchsmith/sandbox@0.1.0-beta.53

## 0.1.0-beta.52

### Minor Changes

- 1fa87fe: Remove legacy session and CLI credential shapes. App sessions now require complete identity metadata, including `identity.subjectId` and `identity.toolUrl`; remove the duplicate top-level subject from host responses and the duplicate top-level tool URL from platform responses. The host forwards the platform session without synthesizing a subject. Share the session validator with the iframe protocol so complete authenticated sessions reach sandboxed apps.

  Custom session providers must return `{ expiresAt, identity, token, url }` with a complete identity. Stored CLI credentials must contain a named scope; delete obsolete entries from `~/.patchsmith/auth.json` and log in again to replace flat-scope or scopeless credentials.

### Patch Changes

- Updated dependencies [1fa87fe]
  - @patchsmith/app@0.1.0-beta.52
  - @patchsmith/core@0.1.0-beta.52
  - @patchsmith/sandbox@0.1.0-beta.52

## 0.1.0-beta.51

### Patch Changes

- Updated dependencies [8cbc3d5]
- Updated dependencies [38e1ced]
  - @patchsmith/core@0.1.0-beta.51
  - @patchsmith/app@0.1.0-beta.51
  - @patchsmith/sandbox@0.1.0-beta.51

## 0.1.0-beta.50

### Minor Changes

- 71fc3a7: Return component callback results across the sandbox bridge instead of dropping them. Callback definitions use only input and output schemas. App callbacks accept direct or promised results, and every host callback returns a promise, including callbacks without an output schema. Callback failures, sandbox destruction, and a 30-second timeout reject pending results.

### Patch Changes

- Updated dependencies [71fc3a7]
  - @patchsmith/core@0.1.0-beta.50
  - @patchsmith/app@0.1.0-beta.50
  - @patchsmith/sandbox@0.1.0-beta.50

## 0.1.0-beta.49

### Patch Changes

- @patchsmith/app@0.1.0-beta.49
  - @patchsmith/core@0.1.0-beta.49
  - @patchsmith/sandbox@0.1.0-beta.49

## 0.1.0-beta.48

### Patch Changes

- Updated dependencies [6a5c17a]
  - @patchsmith/app@0.1.0-beta.48
  - @patchsmith/sandbox@0.1.0-beta.48
  - @patchsmith/core@0.1.0-beta.48

## 0.1.0-beta.47

### Patch Changes

- @patchsmith/app@0.1.0-beta.47
  - @patchsmith/core@0.1.0-beta.47
  - @patchsmith/sandbox@0.1.0-beta.47

## 0.1.0-beta.46

### Patch Changes

- Updated dependencies [20947c7]
  - @patchsmith/app@0.1.0-beta.46
  - @patchsmith/sandbox@0.1.0-beta.46
  - @patchsmith/core@0.1.0-beta.46

## 0.1.0-beta.45

### Patch Changes

- @patchsmith/app@0.1.0-beta.45
  - @patchsmith/core@0.1.0-beta.45
  - @patchsmith/sandbox@0.1.0-beta.45

## 0.1.0-beta.44

### Patch Changes

- Restore the 0.x beta release line after the accidental 1.0.0-beta.44 release. This release includes the app slug and validation changes from that release; use 0.1.0-beta.44 instead of 1.0.0-beta.44.
- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.
- Updated dependencies [89d328f]
- Updated dependencies
- Updated dependencies [1fb0155]
  - @patchsmith/core@0.1.0-beta.44
  - @patchsmith/app@0.1.0-beta.44
  - @patchsmith/sandbox@0.1.0-beta.44

## 1.0.0-beta.44

### Patch Changes

- 1fb0155: Use Valibot for internal validation to reduce Patchsmith bundle sizes. Accept user-provided Standard Schema validators for app functions and view instance data, preserving input/output inference and Zod primitive exports.
- Updated dependencies [89d328f]
- Updated dependencies [1fb0155]
  - @patchsmith/core@1.0.0-beta.44
  - @patchsmith/app@1.0.0-beta.44
  - @patchsmith/sandbox@1.0.0-beta.44

## 0.1.0-beta.43

### Patch Changes

- Updated dependencies [6a68ba5]
  - @patchsmith/core@0.1.0-beta.43
  - @patchsmith/sandbox@0.1.0-beta.43
  - @patchsmith/app@0.1.0-beta.43

## 0.1.0-beta.42

### Minor Changes

- c54e0b1: Remove Patchsmith app previews, including the `patchsmith preview` command, host preview consent and configuration, platform preview APIs and schemas, client preview metadata and stores, live revision subscriptions, and sandbox inline-source loading. Use deployed app builds for host integrations.

### Patch Changes

- Updated dependencies [c54e0b1]
  - @patchsmith/core@0.1.0-beta.42
  - @patchsmith/sandbox@0.1.0-beta.42
  - @patchsmith/app@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- d4798f0: Render Pressable as an accessible div button that supports nested layout primitives, keyboard activation, focus indication, and disabled interaction styles. Keep interaction events in the host and send only the zero-argument onPress callback to the sandbox.
- @patchsmith/app@0.1.0-beta.41
  - @patchsmith/client-platform@0.1.0-beta.41
  - @patchsmith/core@0.1.0-beta.41
  - @patchsmith/sandbox@0.1.0-beta.41

## 0.1.0-beta.40

### Minor Changes

- b636758: Add a Pressable primitive with inline, box, flex, and grid layouts, token-based style props that combine breakpoint and interaction state values, and an onPress callback. The host renders a native button with keyboard activation and disabled behavior; interaction styling stays in the host.

  Replace the `base` style fallback with `default` across primitives. Style props continue to accept token strings and now support conditional objects with host-defined breakpoint names and `:hover`, `:active`, `:focus-visible`, and `:disabled` states. State values can contain breakpoint overrides. Breakpoint names `default` and all names starting with `:` are rejected by TypeScript and at runtime.

  Generate breakpoint and interaction types from serialized component fields, and preserve each property's authored breakpoint order. Breakpoint values require media-query widths; null fallback breakpoints and the generator's legacy `fieldKeys` schema fallback are no longer supported.

  Serialize repeated JSON Schema subtrees once in local `$defs` and reuse them through `$ref`, reducing schema payload size. Type generation resolves local references independently within component fields, callbacks, views, and tools, with explicit errors for unresolved, external, or circular references.

### Patch Changes

- Updated dependencies [b636758]
  - @patchsmith/core@0.1.0-beta.40
  - @patchsmith/sandbox@0.1.0-beta.40
  - @patchsmith/app@0.1.0-beta.40
  - @patchsmith/client-platform@0.1.0-beta.40

## 0.1.0-beta.39

### Patch Changes

- Updated dependencies [ad770d2]
  - @patchsmith/core@0.1.0-beta.39
  - @patchsmith/client-platform@0.1.0-beta.39
  - @patchsmith/sandbox@0.1.0-beta.39
  - @patchsmith/app@0.1.0-beta.39

## 0.1.0-beta.38

### Patch Changes

- Updated dependencies [469d8c2]
  - @patchsmith/core@0.1.0-beta.38
  - @patchsmith/sandbox@0.1.0-beta.38
  - @patchsmith/app@0.1.0-beta.38
  - @patchsmith/client-platform@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- Updated dependencies [0d72562]
  - @patchsmith/core@0.1.0-beta.37
  - @patchsmith/app@0.1.0-beta.37
  - @patchsmith/sandbox@0.1.0-beta.37
  - @patchsmith/client-platform@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- Updated dependencies [c0ce502]
  - @patchsmith/core@0.1.0-beta.36
  - @patchsmith/client-platform@0.1.0-beta.36
  - @patchsmith/sandbox@0.1.0-beta.36
  - @patchsmith/app@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- @patchsmith/app@0.1.0-beta.35
  - @patchsmith/client-platform@0.1.0-beta.35
  - @patchsmith/core@0.1.0-beta.35
  - @patchsmith/sandbox@0.1.0-beta.35

## 0.1.0-beta.34

### Patch Changes

- Updated dependencies [82aa45f]
  - @patchsmith/core@0.1.0-beta.34
  - @patchsmith/client-platform@0.1.0-beta.34
  - @patchsmith/sandbox@0.1.0-beta.34
  - @patchsmith/app@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- Updated dependencies [a215860]
  - @patchsmith/core@0.1.0-beta.33
  - @patchsmith/sandbox@0.1.0-beta.33
  - @patchsmith/app@0.1.0-beta.33
  - @patchsmith/client-platform@0.1.0-beta.33

## 0.1.0-beta.32

### Patch Changes

- Updated dependencies [1929607]
  - @patchsmith/client-platform@0.1.0-beta.32
  - @patchsmith/core@0.1.0-beta.32
  - @patchsmith/sandbox@0.1.0-beta.32
  - @patchsmith/app@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- 4d2f904: Align source code with Ultracite’s default Oxlint and Oxfmt presets while preserving public APIs and runtime lifecycle behavior.
- Updated dependencies [4d2f904]
  - @patchsmith/app@0.1.0-beta.31
  - @patchsmith/client-platform@0.1.0-beta.31
  - @patchsmith/core@0.1.0-beta.31
  - @patchsmith/sandbox@0.1.0-beta.31

## 0.1.0-beta.30

### Patch Changes

- a79bf54: Omit the `children` renderer argument for components that do not support children and when no children are rendered.
- Updated dependencies [f8dce5d]
- Updated dependencies [29f3e30]
  - @patchsmith/app@0.1.0-beta.30
  - @patchsmith/sandbox@0.1.0-beta.30
  - @patchsmith/client-platform@0.1.0-beta.30
  - @patchsmith/core@0.1.0-beta.30

## 0.1.0-beta.29

### Patch Changes

- Updated dependencies [3567f94]
  - @patchsmith/core@0.1.0-beta.29
  - @patchsmith/sandbox@0.1.0-beta.29
  - @patchsmith/app@0.1.0-beta.29
  - @patchsmith/client-platform@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- Updated dependencies [a0ffa4f]
  - @patchsmith/client-platform@0.1.0-beta.28
  - @patchsmith/core@0.1.0-beta.28
  - @patchsmith/sandbox@0.1.0-beta.28
  - @patchsmith/app@0.1.0-beta.28

## 0.1.0-beta.27

### Minor Changes

- 664a460: Allow `useViewContext` errors to be booleans, strings, or `Error` instances. Only `false`, `null`, and `undefined` mean no error; all strings, including an empty string, mark the view as failed. Errors continue to take precedence over loading and suppress context publication.
- 4685874: Remove the React provider's `subjectId` prop and subject-based cache partitioning and remounting. Providers share their client cache, and backend sessions are cached per app until renewal or an explicit refresh. Remove the session provider's subject cache key and the endpoint client's `setSubject` method; authenticated subject identity continues to come from the server.

  Expose `client.clearCache()` to clear shared app data and backend sessions after host authentication changes.

### Patch Changes

- Updated dependencies [21761f2]
- Updated dependencies [4685874]
  - @patchsmith/core@0.1.0-beta.27
  - @patchsmith/app@0.1.0-beta.27
  - @patchsmith/sandbox@0.1.0-beta.27
  - @patchsmith/client-platform@0.1.0-beta.27

## 0.1.0-beta.26

### Minor Changes

- 3fa95bc: Define shared browser-safe contracts with `defineContract` and `action().input().output()`. Use `createServer` from `patchsmith/server` to implement actions and `createClient` from `patchsmith/react` to infer component, view, slot, and scope types from the same contract.

  Host clients validate view context through the contract's original Standard Schema validators and publish the parsed output. Remove JSON Schema reconstruction and host `/meta` requests; resolve slots locally from the contract and accept an explicit client `assetsBaseUrl` for deployment URL fallbacks. Keep server metadata for app type generation, including scope schemas.

  Migrate existing server configuration into `defineContract`, move handlers and secrets to `createServer`, and replace the server type generic on React clients with a `contract` option.

  Contract actions without an input schema infer `undefined`; actions without an output schema infer `void`. Server implementations use the same contract return types, including `Promise<void>` for asynchronous handlers.

  Pass Valibot's `toJsonSchema` directly as the server `schemaSerializer`. Converters receive JSON Schema 2020-12 options, with `typeMode: "input"` for action inputs and `typeMode: "output"` for action results and other metadata; existing single-argument serializers remain supported.

### Patch Changes

- Updated dependencies [274ead8]
- Updated dependencies [3fa95bc]
  - @patchsmith/sandbox@0.1.0-beta.26
  - @patchsmith/core@0.1.0-beta.26
  - @patchsmith/app@0.1.0-beta.26
  - @patchsmith/client-platform@0.1.0-beta.26

## 0.1.0-beta.25

### Minor Changes

- 441a5a9: Rename `Slot` to `RenderSlot` (including client-bound `RenderSlot.Controlled`) and replace its `name` prop with `slot`. Rename the public types to `RenderSlotProps`, `ControlledRenderSlotProps`, `RuntimeRenderSlotProps`, `RenderSlotContext`, and `RenderSlotComponent`.

  Remove the standalone `Root` provider and its DOM/render props. Return a client-bound `Provider` from `createPatchsmithClient`, accepting only `children` and `apps`, with the client supplied internally. Export it as `Provider: PatchsmithProvider` alongside the hooks and `RenderSlot`, and wrap host components in `<PatchsmithProvider>`. Export `PatchsmithProviderProps` for the bound provider.

### Patch Changes

- Updated dependencies [441a5a9]
  - @patchsmith/app@0.1.0-beta.25
  - @patchsmith/sandbox@0.1.0-beta.25
  - @patchsmith/client-platform@0.1.0-beta.25
  - @patchsmith/core@0.1.0-beta.25

## 0.1.0-beta.24

### Minor Changes

- 4985d4e: Replace `useViewContext`'s status union with `{ context, loading?, error? }` so query data, loading, and errors can be passed together. Keep the view path as the first argument and infer the complete context type from that path. Loading defaults to false, errors take precedence, and loading/error states omit context. Update host examples to use the new API.

  Log diagnostics for ready views with missing required context or context that does not match the server's serialized JSON Schema. Allow omitted optional context, skip loading/error states, and suppress repeated errors for unchanged inputs. Reuse the existing Zod dependency to build JSON Schema context validators.

  Move context registration, status handling, equivalent-value deduplication, metadata observation, and diagnostics into the Nanostores-backed `client-core` view context store. Export shared context types so framework adapters can reuse the behavior. React only registers and unregisters context through its lifecycle effects. Remove React forwarding modules for slot and scope helpers and import them directly from `client-core`. Share view-query options and refetch coordination in `client-core`, including awaiting queries after app-discovery retries.

  Generalize remote view state in `client-core` with Nanostores for runtime status, component registrations, and node selectors. Share iframe lifecycle, prop updates, and callback binding across adapters, keep remote views isolated, and react to component renderer updates without recreating the sandbox.

  Use Nano Stores Async for cached fetching and task tracking, and expose cache snapshots as Nano Stores with immediate subscriber cleanup. Use the official React integration for all React store reads; the Preact adapter continues using the official Preact integration.

  Move app-query filtering and result flags, reactive view-query coordination, managed/controlled slot resolution, instance checks, client URL and remote-prop construction, component aliases and client configuration, server/slot types, and primitive/theme CSS generation into client-core. Framework adapters subscribe to shared stores and provide their own rendering and lifecycle handling. Remove the unused React context memo hook. Add a framework-independent app client connection entry point so client-core and the sandbox host do not load Preact through the app client entry point.

### Patch Changes

- Updated dependencies [057cfde]
- Updated dependencies [4985d4e]
  - @patchsmith/app@0.1.0-beta.24
  - @patchsmith/sandbox@0.1.0-beta.24
  - @patchsmith/core@0.1.0-beta.24
  - @patchsmith/client-platform@0.1.0-beta.24

## 0.1.0-beta.23

### Patch Changes

- @patchsmith/app@0.1.0-beta.23
  - @patchsmith/client-platform@0.1.0-beta.23
  - @patchsmith/core@0.1.0-beta.23
  - @patchsmith/sandbox@0.1.0-beta.23

## 0.1.0-beta.22

### Minor Changes

- 382f569: Replace `useSlotInstances` and `useViews` with `useSlot({ slot })`. Single-view slots return one `{ app }` item per app with an enabled, supported view, without requiring registered context or calling instance resolvers. Multiple-view slots retain context-based instance resolution and return `{ app, key, metadata, data }` items. Support app and scope filters, infer result types from the slot's multiple flag, and rename the shared slot store and cache configuration to match. Cache timings remain internal and are not exposed as hook options.

### Patch Changes

- c29880d: Replace TanStack Store with Nanostores for client fetch caches, preview sessions, view registration, and remote UI node state. Preserve change-only subscriptions, stable snapshots, and batched preview updates. Exposed local `state` stores now use the Nanostores atom API (`get`, `set`, and `listen`).

  Migrate app query, mutation, and action state to Nanostores with its Preact adapter. Preserve shared query subscriptions, selective updates, and protection against stale call results.

- Updated dependencies [c29880d]
- Updated dependencies [268df1e]
  - @patchsmith/app@0.1.0-beta.22
  - @patchsmith/sandbox@0.1.0-beta.22
  - @patchsmith/client-platform@0.1.0-beta.22
  - @patchsmith/core@0.1.0-beta.22

## 0.1.0-beta.21

### Patch Changes

- 1c52fe8: Add minimal package READMEs with readable names and short descriptions.
- Updated dependencies [1c52fe8]
  - @patchsmith/app@0.1.0-beta.21
  - @patchsmith/client-platform@0.1.0-beta.21
  - @patchsmith/core@0.1.0-beta.21
  - @patchsmith/sandbox@0.1.0-beta.21

## 0.1.0-beta.20

### Minor Changes

- e2de939: Add the framework-independent client-core package with TanStack Store-backed state and endpoint clients. Fetch stores for apps, metadata, slot instances, and preview sessions are separate from local view registration and remote UI node state. React uses shared response caching and in-flight request deduplication with configurable stale and retention times, while preserving its public app and view types.

### Patch Changes

- Updated dependencies [a2ed82b]
- Updated dependencies [fc09d5b]
  - @patchsmith/core@0.1.0-beta.20
  - @patchsmith/app@0.1.0-beta.20
  - @patchsmith/client-platform@0.1.0-beta.20
  - @patchsmith/sandbox@0.1.0-beta.20
