# @patchsmith/react

## 0.1.0-beta.69

### Patch Changes

- Updated dependencies [6cdca73]
- Updated dependencies [5a6c00b]
- Updated dependencies [2ac11bc]
  - @patchsmith/client-platform@0.1.0-beta.69
  - @patchsmith/app@0.1.0-beta.69
  - @patchsmith/core@0.1.0-beta.69
  - @patchsmith/client-core@0.1.0-beta.69
  - @patchsmith/sandbox@0.1.0-beta.69

## 0.1.0-beta.68

### Patch Changes

- Updated dependencies [a023f8b]
  - @patchsmith/app@0.1.0-beta.68
  - @patchsmith/core@0.1.0-beta.68
  - @patchsmith/sandbox@0.1.0-beta.68
  - @patchsmith/client-platform@0.1.0-beta.68
  - @patchsmith/client-core@0.1.0-beta.68

## 0.1.0-beta.67

### Patch Changes

- @patchsmith/app@0.1.0-beta.67
  - @patchsmith/client-core@0.1.0-beta.67
  - @patchsmith/client-platform@0.1.0-beta.67
  - @patchsmith/core@0.1.0-beta.67
  - @patchsmith/sandbox@0.1.0-beta.67

## 0.1.0-beta.66

### Patch Changes

- Updated dependencies [7ab8c01]
  - @patchsmith/app@0.1.0-beta.66
  - @patchsmith/core@0.1.0-beta.66
  - @patchsmith/client-platform@0.1.0-beta.66
  - @patchsmith/client-core@0.1.0-beta.66
  - @patchsmith/sandbox@0.1.0-beta.66

## 0.1.0-beta.65

### Patch Changes

- Updated dependencies [416cd4c]
- Updated dependencies [92fd903]
  - @patchsmith/core@0.1.0-beta.65
  - @patchsmith/app@0.1.0-beta.65
  - @patchsmith/client-platform@0.1.0-beta.65
  - @patchsmith/client-core@0.1.0-beta.65
  - @patchsmith/sandbox@0.1.0-beta.65

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
  - @patchsmith/client-core@0.1.0-beta.64
  - @patchsmith/sandbox@0.1.0-beta.64
  - @patchsmith/app@0.1.0-beta.64
  - @patchsmith/client-platform@0.1.0-beta.64

## 0.1.0-beta.63

### Patch Changes

- Updated dependencies [29d4061]
  - @patchsmith/app@0.1.0-beta.63
  - @patchsmith/sandbox@0.1.0-beta.63
  - @patchsmith/client-core@0.1.0-beta.63
  - @patchsmith/core@0.1.0-beta.63
  - @patchsmith/client-platform@0.1.0-beta.63

## 0.1.0-beta.62

### Patch Changes

- @patchsmith/app@0.1.0-beta.62
  - @patchsmith/client-core@0.1.0-beta.62
  - @patchsmith/client-platform@0.1.0-beta.62
  - @patchsmith/core@0.1.0-beta.62
  - @patchsmith/sandbox@0.1.0-beta.62

## 0.1.0-beta.61

### Patch Changes

- Updated dependencies [dfca420]
  - @patchsmith/app@0.1.0-beta.61
  - @patchsmith/client-core@0.1.0-beta.61
  - @patchsmith/core@0.1.0-beta.61
  - @patchsmith/sandbox@0.1.0-beta.61
  - @patchsmith/client-platform@0.1.0-beta.61

## 0.1.0-beta.60

### Patch Changes

- @patchsmith/app@0.1.0-beta.60
  - @patchsmith/client-core@0.1.0-beta.60
  - @patchsmith/client-platform@0.1.0-beta.60
  - @patchsmith/core@0.1.0-beta.60
  - @patchsmith/sandbox@0.1.0-beta.60

## 0.1.0-beta.59

### Minor Changes

- 07731b1: Resolve view instances through one platform request. The host authenticates the viewer and validates view context; the platform discovers scoped installations, issues private runtime sessions, and calls app resolvers concurrently near the runtime. Preserve ancestor selection, context readiness, cancellation, and credential isolation. Breaking: replace `/apps/runtime/discover` with `/apps/runtime/resolve` and remove the old client operation. Deploy the platform with `/apps/runtime/resolve` first, then upgrade host SDKs. New SDKs do not fall back to `/apps/runtime/discover`; their multiple-slot view requests fail until the new endpoint is available. Existing deployments are unsupported during this coordinated upgrade.

  Limit the instance-resolution phase, including session creation and response reading, to one second across all apps. Cancel outstanding calls at the deadline and return completed, validated app results in discovery order. Return a sanitized 504 only when no app completed. Use Effect for resolution orchestration, interruption, and resource cleanup.

  Require a warnings array on every ready response, with structured per-app timeout warnings alongside partial results and expose them through view queries and `useViews().warnings`. Complete responses expose an empty warning list in the SDK.

### Patch Changes

- 7a11341: Expose uncached, validated host requests through `createClient().api.apps()` and `createClient().api.views(input)`. Use these Promise-based methods with TanStack Query or another cache, with an optional `signal` field for cancellation. Both endpoints accept a single options object; standalone `createEndpointClient` callers should replace positional signal arguments with `apps({ signal })` and `views({ ...input, signal })`. Existing `useApps` and `useViews` hooks retain their nanostore cache.
- Updated dependencies [07731b1]
- Updated dependencies [7a11341]
- Updated dependencies [c96def0]
  - @patchsmith/core@0.1.0-beta.59
  - @patchsmith/client-core@0.1.0-beta.59
  - @patchsmith/client-platform@0.1.0-beta.59
  - @patchsmith/app@0.1.0-beta.59
  - @patchsmith/sandbox@0.1.0-beta.59

## 0.1.0-beta.58

### Patch Changes

- Updated dependencies [bb541bb]
  - @patchsmith/client-core@0.1.0-beta.58
  - @patchsmith/core@0.1.0-beta.58
  - @patchsmith/sandbox@0.1.0-beta.58
  - @patchsmith/app@0.1.0-beta.58
  - @patchsmith/client-platform@0.1.0-beta.58

## 0.1.0-beta.57

### Patch Changes

- Updated dependencies [a963f46]
  - @patchsmith/core@0.1.0-beta.57
  - @patchsmith/client-platform@0.1.0-beta.57
  - @patchsmith/client-core@0.1.0-beta.57
  - @patchsmith/sandbox@0.1.0-beta.57
  - @patchsmith/app@0.1.0-beta.57

## 0.1.0-beta.56

### Minor Changes

- 74a7a6b: Resolve views through a single authenticated host request. The host discovers authorized installations, validates ancestor context and calls the existing compiled instance actions in parallel. View queries no longer request app runtime sessions or call instance actions from the browser.

  Breaking: deploy the host and client together to enable `POST /views`. Provider-supplied apps now seed only `useApps`; use `appIds` and `scopes` to filter host view discovery. The direct `slotInstances` transport and the previous `createSlotStore` options are removed. `createPatchsmithFetchClient().views(input)` supports server prefetching with a request-scoped authenticated fetch implementation.

### Patch Changes

- Updated dependencies [74a7a6b]
  - @patchsmith/core@0.1.0-beta.56
  - @patchsmith/client-core@0.1.0-beta.56
  - @patchsmith/sandbox@0.1.0-beta.56
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

- Updated dependencies [2b3e206]
- Updated dependencies [7f5d15b]
  - @patchsmith/app@0.1.0-beta.55
  - @patchsmith/sandbox@0.1.0-beta.55
  - @patchsmith/core@0.1.0-beta.55
  - @patchsmith/client-core@0.1.0-beta.55
  - @patchsmith/client-platform@0.1.0-beta.55

## 0.1.0-beta.54

### Patch Changes

- Updated dependencies [d26ee48]
  - @patchsmith/core@0.1.0-beta.54
  - @patchsmith/client-platform@0.1.0-beta.54
  - @patchsmith/client-core@0.1.0-beta.54
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
  - @patchsmith/client-core@0.1.0-beta.53
  - @patchsmith/client-platform@0.1.0-beta.53
  - @patchsmith/core@0.1.0-beta.53
  - @patchsmith/sandbox@0.1.0-beta.53

## 0.1.0-beta.52

### Patch Changes

- Updated dependencies [1fa87fe]
  - @patchsmith/app@0.1.0-beta.52
  - @patchsmith/core@0.1.0-beta.52
  - @patchsmith/client-core@0.1.0-beta.52
  - @patchsmith/sandbox@0.1.0-beta.52
  - @patchsmith/client-platform@0.1.0-beta.52

## 0.1.0-beta.51

### Patch Changes

- Updated dependencies [8cbc3d5]
- Updated dependencies [38e1ced]
  - @patchsmith/core@0.1.0-beta.51
  - @patchsmith/app@0.1.0-beta.51
  - @patchsmith/sandbox@0.1.0-beta.51
  - @patchsmith/client-platform@0.1.0-beta.51
  - @patchsmith/client-core@0.1.0-beta.51

## 0.1.0-beta.50

### Minor Changes

- 71fc3a7: Return component callback results across the sandbox bridge instead of dropping them. Callback definitions use only input and output schemas. App callbacks accept direct or promised results, and every host callback returns a promise, including callbacks without an output schema. Callback failures, sandbox destruction, and a 30-second timeout reject pending results.

### Patch Changes

- Updated dependencies [71fc3a7]
  - @patchsmith/core@0.1.0-beta.50
  - @patchsmith/app@0.1.0-beta.50
  - @patchsmith/sandbox@0.1.0-beta.50
  - @patchsmith/client-core@0.1.0-beta.50
  - @patchsmith/client-platform@0.1.0-beta.50

## 0.1.0-beta.49

### Patch Changes

- @patchsmith/app@0.1.0-beta.49
  - @patchsmith/client-core@0.1.0-beta.49
  - @patchsmith/client-platform@0.1.0-beta.49
  - @patchsmith/core@0.1.0-beta.49
  - @patchsmith/sandbox@0.1.0-beta.49

## 0.1.0-beta.48

### Patch Changes

- Updated dependencies [6a5c17a]
  - @patchsmith/app@0.1.0-beta.48
  - @patchsmith/client-core@0.1.0-beta.48
  - @patchsmith/sandbox@0.1.0-beta.48
  - @patchsmith/client-platform@0.1.0-beta.48
  - @patchsmith/core@0.1.0-beta.48

## 0.1.0-beta.47

### Patch Changes

- @patchsmith/app@0.1.0-beta.47
  - @patchsmith/client-core@0.1.0-beta.47
  - @patchsmith/client-platform@0.1.0-beta.47
  - @patchsmith/core@0.1.0-beta.47
  - @patchsmith/sandbox@0.1.0-beta.47

## 0.1.0-beta.46

### Patch Changes

- Updated dependencies [20947c7]
  - @patchsmith/app@0.1.0-beta.46
  - @patchsmith/client-core@0.1.0-beta.46
  - @patchsmith/sandbox@0.1.0-beta.46
  - @patchsmith/client-platform@0.1.0-beta.46
  - @patchsmith/core@0.1.0-beta.46

## 0.1.0-beta.45

### Patch Changes

- @patchsmith/app@0.1.0-beta.45
  - @patchsmith/client-core@0.1.0-beta.45
  - @patchsmith/client-platform@0.1.0-beta.45
  - @patchsmith/core@0.1.0-beta.45
  - @patchsmith/sandbox@0.1.0-beta.45

## 0.1.0-beta.44

### Patch Changes

- Restore the 0.x beta release line after the accidental 1.0.0-beta.44 release. This release includes the app slug and validation changes from that release; use 0.1.0-beta.44 instead of 1.0.0-beta.44.
- Updated dependencies [89d328f]
- Updated dependencies
- Updated dependencies [1fb0155]
  - @patchsmith/client-platform@0.1.0-beta.44
  - @patchsmith/core@0.1.0-beta.44
  - @patchsmith/app@0.1.0-beta.44
  - @patchsmith/client-core@0.1.0-beta.44
  - @patchsmith/sandbox@0.1.0-beta.44

## 1.0.0-beta.44

### Patch Changes

- Updated dependencies [89d328f]
- Updated dependencies [1fb0155]
  - @patchsmith/client-platform@1.0.0-beta.44
  - @patchsmith/core@1.0.0-beta.44
  - @patchsmith/app@1.0.0-beta.44
  - @patchsmith/client-core@1.0.0-beta.44
  - @patchsmith/sandbox@1.0.0-beta.44

## 0.1.0-beta.43

### Patch Changes

- Updated dependencies [6a68ba5]
  - @patchsmith/client-platform@0.1.0-beta.43
  - @patchsmith/core@0.1.0-beta.43
  - @patchsmith/client-core@0.1.0-beta.43
  - @patchsmith/sandbox@0.1.0-beta.43
  - @patchsmith/app@0.1.0-beta.43

## 0.1.0-beta.42

### Minor Changes

- c54e0b1: Remove Patchsmith app previews, including the `patchsmith preview` command, host preview consent and configuration, platform preview APIs and schemas, client preview metadata and stores, live revision subscriptions, and sandbox inline-source loading. Use deployed app builds for host integrations.

### Patch Changes

- Updated dependencies [c54e0b1]
  - @patchsmith/client-core@0.1.0-beta.42
  - @patchsmith/client-platform@0.1.0-beta.42
  - @patchsmith/core@0.1.0-beta.42
  - @patchsmith/sandbox@0.1.0-beta.42
  - @patchsmith/app@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- d4798f0: Render Pressable as an accessible div button that supports nested layout primitives, keyboard activation, focus indication, and disabled interaction styles. Keep interaction events in the host and send only the zero-argument onPress callback to the sandbox.
- Updated dependencies [d4798f0]
  - @patchsmith/client-core@0.1.0-beta.41
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
  - @patchsmith/client-core@0.1.0-beta.40
  - @patchsmith/sandbox@0.1.0-beta.40
  - @patchsmith/app@0.1.0-beta.40
  - @patchsmith/client-platform@0.1.0-beta.40

## 0.1.0-beta.39

### Patch Changes

- Updated dependencies [ad770d2]
  - @patchsmith/core@0.1.0-beta.39
  - @patchsmith/client-platform@0.1.0-beta.39
  - @patchsmith/client-core@0.1.0-beta.39
  - @patchsmith/sandbox@0.1.0-beta.39
  - @patchsmith/app@0.1.0-beta.39

## 0.1.0-beta.38

### Patch Changes

- Updated dependencies [469d8c2]
  - @patchsmith/core@0.1.0-beta.38
  - @patchsmith/client-core@0.1.0-beta.38
  - @patchsmith/sandbox@0.1.0-beta.38
  - @patchsmith/app@0.1.0-beta.38
  - @patchsmith/client-platform@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- Updated dependencies [0d72562]
  - @patchsmith/core@0.1.0-beta.37
  - @patchsmith/app@0.1.0-beta.37
  - @patchsmith/client-core@0.1.0-beta.37
  - @patchsmith/sandbox@0.1.0-beta.37
  - @patchsmith/client-platform@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- Updated dependencies [c0ce502]
  - @patchsmith/core@0.1.0-beta.36
  - @patchsmith/client-platform@0.1.0-beta.36
  - @patchsmith/client-core@0.1.0-beta.36
  - @patchsmith/sandbox@0.1.0-beta.36
  - @patchsmith/app@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- @patchsmith/app@0.1.0-beta.35
  - @patchsmith/client-core@0.1.0-beta.35
  - @patchsmith/client-platform@0.1.0-beta.35
  - @patchsmith/core@0.1.0-beta.35
  - @patchsmith/sandbox@0.1.0-beta.35

## 0.1.0-beta.34

### Patch Changes

- Updated dependencies [82aa45f]
  - @patchsmith/core@0.1.0-beta.34
  - @patchsmith/client-platform@0.1.0-beta.34
  - @patchsmith/client-core@0.1.0-beta.34
  - @patchsmith/sandbox@0.1.0-beta.34
  - @patchsmith/app@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- Updated dependencies [a215860]
  - @patchsmith/core@0.1.0-beta.33
  - @patchsmith/client-core@0.1.0-beta.33
  - @patchsmith/sandbox@0.1.0-beta.33
  - @patchsmith/app@0.1.0-beta.33
  - @patchsmith/client-platform@0.1.0-beta.33

## 0.1.0-beta.32

### Patch Changes

- Updated dependencies [1929607]
  - @patchsmith/client-platform@0.1.0-beta.32
  - @patchsmith/client-core@0.1.0-beta.32
  - @patchsmith/core@0.1.0-beta.32
  - @patchsmith/sandbox@0.1.0-beta.32
  - @patchsmith/app@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- 4d2f904: Align source code with Ultracite’s default Oxlint and Oxfmt presets while preserving public APIs and runtime lifecycle behavior.
- Updated dependencies [4d2f904]
  - @patchsmith/app@0.1.0-beta.31
  - @patchsmith/client-core@0.1.0-beta.31
  - @patchsmith/client-platform@0.1.0-beta.31
  - @patchsmith/core@0.1.0-beta.31
  - @patchsmith/sandbox@0.1.0-beta.31

## 0.1.0-beta.30

### Patch Changes

- a79bf54: Omit the `children` renderer argument for components that do not support children and when no children are rendered.
- Updated dependencies [a79bf54]
- Updated dependencies [f8dce5d]
- Updated dependencies [29f3e30]
  - @patchsmith/client-core@0.1.0-beta.30
  - @patchsmith/app@0.1.0-beta.30
  - @patchsmith/sandbox@0.1.0-beta.30
  - @patchsmith/client-platform@0.1.0-beta.30
  - @patchsmith/core@0.1.0-beta.30

## 0.1.0-beta.29

### Patch Changes

- Updated dependencies [3567f94]
  - @patchsmith/core@0.1.0-beta.29
  - @patchsmith/client-core@0.1.0-beta.29
  - @patchsmith/sandbox@0.1.0-beta.29
  - @patchsmith/app@0.1.0-beta.29
  - @patchsmith/client-platform@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- Updated dependencies [a0ffa4f]
  - @patchsmith/client-platform@0.1.0-beta.28
  - @patchsmith/core@0.1.0-beta.28
  - @patchsmith/client-core@0.1.0-beta.28
  - @patchsmith/sandbox@0.1.0-beta.28
  - @patchsmith/app@0.1.0-beta.28

## 0.1.0-beta.27

### Minor Changes

- 664a460: Allow `useViewContext` errors to be booleans, strings, or `Error` instances. Only `false`, `null`, and `undefined` mean no error; all strings, including an empty string, mark the view as failed. Errors continue to take precedence over loading and suppress context publication.
- 4685874: Remove the React provider's `subjectId` prop and subject-based cache partitioning and remounting. Providers share their client cache, and backend sessions are cached per app until renewal or an explicit refresh. Remove the session provider's subject cache key and the endpoint client's `setSubject` method; authenticated subject identity continues to come from the server.

  Expose `client.clearCache()` to clear shared app data and backend sessions after host authentication changes.

### Patch Changes

- Updated dependencies [21761f2]
- Updated dependencies [664a460]
- Updated dependencies [4685874]
  - @patchsmith/core@0.1.0-beta.27
  - @patchsmith/client-core@0.1.0-beta.27
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
  - @patchsmith/client-core@0.1.0-beta.26
  - @patchsmith/app@0.1.0-beta.26
  - @patchsmith/client-platform@0.1.0-beta.26

## 0.1.0-beta.25

### Minor Changes

- 441a5a9: Rename `Slot` to `RenderSlot` (including client-bound `RenderSlot.Controlled`) and replace its `name` prop with `slot`. Rename the public types to `RenderSlotProps`, `ControlledRenderSlotProps`, `RuntimeRenderSlotProps`, `RenderSlotContext`, and `RenderSlotComponent`.

  Remove the standalone `Root` provider and its DOM/render props. Return a client-bound `Provider` from `createPatchsmithClient`, accepting only `children` and `apps`, with the client supplied internally. Export it as `Provider: PatchsmithProvider` alongside the hooks and `RenderSlot`, and wrap host components in `<PatchsmithProvider>`. Export `PatchsmithProviderProps` for the bound provider.

### Patch Changes

- e87dc2c: Simplify React's useApps and useViews results to data, isPending, error, isRefetching, and fetch. Rename refetch to fetch and remove status, isFetching, isLoading, isSuccess, and isError. Background refreshes set isRefetching while retaining the available data.
- Updated dependencies [441a5a9]
  - @patchsmith/client-core@0.1.0-beta.25
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
  - @patchsmith/client-core@0.1.0-beta.24
  - @patchsmith/client-platform@0.1.0-beta.24

## 0.1.0-beta.23

### Minor Changes

- 754f2d3: Rename `useSlot` to `useViews` and `useRegisterView` to `useViewContext`, along with their exported hook types. Update the demo, host examples, and documentation to use the new names. Preserve typed slot results, context registration, cache behavior, and refetch semantics without compatibility aliases.

### Patch Changes

- @patchsmith/app@0.1.0-beta.23
  - @patchsmith/client-core@0.1.0-beta.23
  - @patchsmith/client-platform@0.1.0-beta.23
  - @patchsmith/core@0.1.0-beta.23
  - @patchsmith/sandbox@0.1.0-beta.23

## 0.1.0-beta.22

### Minor Changes

- 382f569: Replace `useSlotInstances` and `useViews` with `useSlot({ slot })`. Single-view slots return one `{ app }` item per app with an enabled, supported view, without requiring registered context or calling instance resolvers. Multiple-view slots retain context-based instance resolution and return `{ app, key, metadata, data }` items. Support app and scope filters, infer result types from the slot's multiple flag, and rename the shared slot store and cache configuration to match. Cache timings remain internal and are not exposed as hook options.

### Patch Changes

- 589ffae: Remove staleTime and gcTime from useApps, useViews, and useSlotInstances options. Hooks continue to use the client's cache configuration and support explicit refetching.
- Updated dependencies [c29880d]
- Updated dependencies [268df1e]
- Updated dependencies [382f569]
  - @patchsmith/client-core@0.1.0-beta.22
  - @patchsmith/app@0.1.0-beta.22
  - @patchsmith/sandbox@0.1.0-beta.22
  - @patchsmith/client-platform@0.1.0-beta.22
  - @patchsmith/core@0.1.0-beta.22

## 0.1.0-beta.21

### Patch Changes

- 1c52fe8: Add minimal package READMEs with readable names and short descriptions.
- Updated dependencies [1c52fe8]
  - @patchsmith/app@0.1.0-beta.21
  - @patchsmith/client-core@0.1.0-beta.21
  - @patchsmith/client-platform@0.1.0-beta.21
  - @patchsmith/core@0.1.0-beta.21
  - @patchsmith/sandbox@0.1.0-beta.21

## 0.1.0-beta.20

### Minor Changes

- 11b46f8: Change `useSlotInstances` to accept only `{ slot }` and discover matching instances across all apps through `useApps`. Include the source `app` on each instance, resolve apps in parallel, and preserve app-specific managed Slot rendering.
- a2ed82b: Declare multi-instance host slots with `multiple: true` (omitted or false means single-instance). Client-bound `Slot` requires `instanceKey` for multi-instance slots and rejects it for single-instance slots; ready `Slot.Controlled` similarly requires or rejects `instance`.

  Breaking change: rename `createView` to `defineView`, use `defineView({ slot, view, component, ... })` and regenerate app bindings. Multi-instance slots require `instances: { dataSchema, resolve }`; single-instance slots reject it. View registration is restricted to the slot selected in `defineView`. The CLI scaffolds a resolver when the selected host slot supports multiple instances.

- e2de939: Add the framework-independent client-core package with TanStack Store-backed state and endpoint clients. Fetch stores for apps, metadata, slot instances, and preview sessions are separate from local view registration and remote UI node state. React uses shared response caching and in-flight request deduplication with configurable stale and retention times, while preserving its public app and view types.

### Patch Changes

- Updated dependencies [a2ed82b]
- Updated dependencies [fc09d5b]
- Updated dependencies [e2de939]
  - @patchsmith/core@0.1.0-beta.20
  - @patchsmith/app@0.1.0-beta.20
  - @patchsmith/client-platform@0.1.0-beta.20
  - @patchsmith/client-core@0.1.0-beta.20
  - @patchsmith/sandbox@0.1.0-beta.20

## 0.1.0-beta.19

### Minor Changes

- fa05f02: Breaking change: rename the client-bound `useView` hook to `useRegisterView` and its exported `UseView` type to `UseRegisterView`. Update client destructuring, re-exports, imports, and calls to use the new names. The hook's arguments and registration lifecycle are unchanged.
- fa05f02: Breaking change: replace `AppView` and `AppViewProps` with client-bound `Slot` and `Slot.Controlled`. Use `<Slot app={app} name="panel" />` for registered view matching. For explicit rendering, `Slot.Controlled` requires a view, status, and complete combined context when ready, and renders the exact view without reading the registry or falling back to ancestors. The old `fallback` and `createIframe` props are no longer exposed.
- fa05f02: Add client-bound `useSlotInstances({ app, slot })` to fetch instances through the authenticated app action endpoint using the matching view and registered ancestor context. Expose loading, errors, and refetch; clear stale data when context or deployment changes. Preserve disabled view paths in manifests so host matching respects blocked fallback, while keeping them out of `useViews` discovery.
- fa05f02: Render dynamic view instances with `Slot instanceKey` or an explicit `Slot.Controlled instance`. Pass the selected instance through the sandbox and expose its validated data through the typed `view.useInstance()` hook. Handle pending requests, resolver errors, and missing keys, and reset view component state when the selected key changes.
- fa05f02: Add client-bound useViews with scopes, appIds, and slot filters. App builds and deployments include view manifests, including preview builds. useApps and useViews share one authenticated app request and filter locally; useApps also accepts appIds. Apps without a view manifest must be redeployed to appear in useViews.

### Patch Changes

- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
- Updated dependencies [fa05f02]
  - @patchsmith/app@0.1.0-beta.19
  - @patchsmith/sandbox@0.1.0-beta.19
  - @patchsmith/core@0.1.0-beta.19
  - @patchsmith/client-platform@0.1.0-beta.19

## 0.1.0-beta.18

### Minor Changes

- 731e066: Rename host `contexts` declarations to `views` to match slot view references. Replace the `contexts` configuration key and schema property with `views`; each path still maps directly to its data schema. View selection, context composition, and the serialized schema format are unchanged.

### Patch Changes

- Updated dependencies [fc9538d]
- Updated dependencies [6f969e3]
- Updated dependencies [731e066]
  - @patchsmith/app@0.1.0-beta.18
  - @patchsmith/core@0.1.0-beta.18
  - @patchsmith/client-platform@0.1.0-beta.18
  - @patchsmith/sandbox@0.1.0-beta.18

## 0.1.0-beta.17

### Patch Changes

- Updated dependencies [ba00155]
- Updated dependencies [364d5cd]
- Updated dependencies [d586115]
  - @patchsmith/core@0.1.0-beta.17
  - @patchsmith/client-platform@0.1.0-beta.17
  - @patchsmith/app@0.1.0-beta.17
  - @patchsmith/sandbox@0.1.0-beta.17

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
- Updated dependencies [71ad08c]
  - @patchsmith/core@0.1.0-beta.16
  - @patchsmith/client-platform@0.1.0-beta.16
  - @patchsmith/app@0.1.0-beta.16
  - @patchsmith/sandbox@0.1.0-beta.16

## 0.1.0-beta.15

### Minor Changes

- d3a873e: Breaking change: remove the `Register` module augmentation and the unbound package-root `useView` export. Hosts that relied on the augmentation must migrate to helpers returned by `createPatchsmithClient` (for example, `export const { AppView, useApps, useView } = tailorKit`) to retain schema-specific view and context validation. An old ambient declaration may still compile while providing no validation.

  The client-bound helpers also check that they are rendered under the matching `<Root client={tailorKit}>`; using a helper from another client throws at runtime.

### Patch Changes

- @patchsmith/client-platform@0.1.0-beta.15
  - @patchsmith/core@0.1.0-beta.15
  - @patchsmith/sandbox@0.1.0-beta.15

## 0.1.0-beta.14

### Minor Changes

- 491f715: Rename host context declarations from `views` to `contexts`. Each context path now maps directly to its Zod, Valibot, or ArkType schema.

### Patch Changes

- e06e450: Upload complete preview builds to KV in bounded oRPC chunks, accept previews through a host consent page, and stream verified revisions to sandboxed app views.
- Updated dependencies [e06e450]
  - @patchsmith/core@0.1.0-beta.14
  - @patchsmith/sandbox@0.1.0-beta.14
  - @patchsmith/client-platform@0.1.0-beta.14

## 0.1.0-beta.13

### Patch Changes

- Updated dependencies [061adb2]
  - @patchsmith/core@0.1.0-beta.13
  - @patchsmith/sandbox@0.1.0-beta.13

## 0.1.0-beta.12

### Patch Changes

- @patchsmith/core@0.1.0-beta.12
  - @patchsmith/sandbox@0.1.0-beta.12

## 0.1.0-beta.11

### Patch Changes

- @patchsmith/core@0.1.0-beta.11
  - @patchsmith/sandbox@0.1.0-beta.11

## 0.1.0-beta.10

### Patch Changes

- Updated dependencies [a0d3233]
  - @patchsmith/core@0.1.0-beta.10
  - @patchsmith/sandbox@0.1.0-beta.10

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
  - @patchsmith/sandbox@0.1.0-beta.9

## 0.1.0-beta.8

### Minor Changes

- 9e46a8b: Run app clients directly inside the opaque-origin iframe sandbox while preserving the validated host messaging boundary. Remove the worker runtime and Worker DOM exports, bundle Preact into app clients, preserve typed component props, and use weak callback target references.

### Patch Changes

- Updated dependencies [9e46a8b]
  - @patchsmith/sandbox@0.1.0-beta.8
  - @patchsmith/core@0.1.0-beta.8

## 0.1.0-beta.7

### Patch Changes

- 2e7b3a4: Add optional light and dark app logos to the deployment pipeline, including validated SVG, PNG, and WebP uploads, hosted logo URLs, and a 1 MiB combined client asset limit.
- Updated dependencies [2e7b3a4]
- Updated dependencies [d75e2fe]
  - @patchsmith/core@0.1.0-beta.7
  - @patchsmith/sandbox@0.1.0-beta.7

## 0.1.0-beta.6

### Patch Changes

- Updated dependencies [a33af95]
  - @patchsmith/sandbox@0.1.0-beta.6
  - @patchsmith/core@0.1.0-beta.6

## 0.1.0-beta.5

### Patch Changes

- Updated dependencies [695cdad]
  - @patchsmith/core@0.1.0-beta.5
  - @patchsmith/sandbox@0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- 324b281: Resolve public packages to compiled distribution files in both development and production, without custom source export conditions.

  Remove stale source aliases and declaration maps that reference unpublished source files. Generate apps with a single patchsmith dependency and its app subpath exports.

- Updated dependencies [324b281]
  - @patchsmith/core@0.1.0-beta.4
  - @patchsmith/sandbox@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- a02ebee: Include development export targets in published packages so Vite consumers do not need custom resolution conditions. Expose app authoring from `patchsmith/app` and `patchsmith/app/config`.
- Updated dependencies [a02ebee]
  - @patchsmith/core@0.1.0-beta.3
  - @patchsmith/sandbox@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies [586cc14]
  - @patchsmith/core@0.1.0-beta.2
  - @patchsmith/sandbox@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Updated dependencies [c0bdd68]
  - @patchsmith/core@0.1.0-beta.1
  - @patchsmith/sandbox@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 4230689: Publish the initial Patchsmith beta packages.

### Patch Changes

- Updated dependencies [4230689]
  - @patchsmith/core@0.1.0-beta.0
  - @patchsmith/sandbox@0.1.0-beta.0
