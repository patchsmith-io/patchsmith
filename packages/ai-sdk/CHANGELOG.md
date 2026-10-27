# @patchsmith/ai-sdk

## 0.1.0-beta.71

### Patch Changes

- Updated dependencies [9b669cb]
  - @patchsmith/core@0.1.0-beta.71

## 0.1.0-beta.70

### Patch Changes

- Updated dependencies [1d21d1b]
  - @patchsmith/core@0.1.0-beta.70

## 0.1.0-beta.69

### Patch Changes

- @patchsmith/core@0.1.0-beta.69

## 0.1.0-beta.68

### Patch Changes

- Updated dependencies [a023f8b]
  - @patchsmith/core@0.1.0-beta.68

## 0.1.0-beta.67

### Patch Changes

- @patchsmith/core@0.1.0-beta.67

## 0.1.0-beta.66

### Patch Changes

- Updated dependencies [7ab8c01]
  - @patchsmith/core@0.1.0-beta.66

## 0.1.0-beta.65

### Patch Changes

- Updated dependencies [416cd4c]
- Updated dependencies [92fd903]
  - @patchsmith/core@0.1.0-beta.65

## 0.1.0-beta.64

### Patch Changes

- Updated dependencies [cb4001c]
- Updated dependencies [39bb8e4]
- Updated dependencies [ed31e0e]
  - @patchsmith/core@0.1.0-beta.64

## 0.1.0-beta.63

### Patch Changes

- @patchsmith/core@0.1.0-beta.63

## 0.1.0-beta.62

### Patch Changes

- @patchsmith/core@0.1.0-beta.62

## 0.1.0-beta.61

### Patch Changes

- @patchsmith/core@0.1.0-beta.61

## 0.1.0-beta.60

### Patch Changes

- a325be8: Fix prerelease builds by declaring tool types through the AI SDK's public exports, preserving typed inputs and streaming outputs without referencing transitive dependency paths.
- @patchsmith/core@0.1.0-beta.60

## 0.1.0-beta.59

### Patch Changes

- Updated dependencies [07731b1]
  - @patchsmith/core@0.1.0-beta.59

## 0.1.0-beta.58

### Patch Changes

- Updated dependencies [bb541bb]
  - @patchsmith/core@0.1.0-beta.58

## 0.1.0-beta.57

### Patch Changes

- Updated dependencies [a963f46]
  - @patchsmith/core@0.1.0-beta.57

## 0.1.0-beta.56

### Patch Changes

- Updated dependencies [74a7a6b]
  - @patchsmith/core@0.1.0-beta.56

## 0.1.0-beta.55

### Patch Changes

- Updated dependencies [7f5d15b]
  - @patchsmith/core@0.1.0-beta.55

## 0.1.0-beta.54

### Patch Changes

- Updated dependencies [d26ee48]
  - @patchsmith/core@0.1.0-beta.54

## 0.1.0-beta.53

### Minor Changes

- e96dce2: Rename TailorKit to Patchsmith. Install `patchsmith` and `@patchsmith/*` packages, replace `TailorKit`/`tailorkit` identifiers with `Patchsmith`/`patchsmith`, and use the `patchsmith` CLI. Rename `tailorkit.config.ts` to `patchsmith.config.ts`, regenerate app bindings with `patchsmith generate`, and update imports to `#patchsmith` and `src/patchsmith.gen.ts`.

  Move platform URLs to `https://patchsmith.io` and host integration routes to `/api/patchsmith`. Rename `TAILORKIT_*` environment variables to `PATCHSMITH_*`; app output and local credential directories now use `.patchsmith`. Sign in again after upgrading. Hosted app assets and RPC URLs continue to use `tailorkit.app`.

### Patch Changes

- f58b745: Add `createTools(patchsmith, { scopes, subjectId })` from `patchsmith/ai-sdk` to execute fixed definitions of the app agent's MCP tools with the AI SDK. Use Valibot for tool schemas and validation. Return destructurable `listApps`, `createApp`, and `editApp` tools while retaining snake_case MCP names internally. Stream MCP activity as preliminary tool results, preserve final structured results, and forward cancellation without replaying app changes.
- d799743: Update package repository links to `patchsmith-io/patchsmith`.
- Updated dependencies [d799743]
- Updated dependencies [e96dce2]
- Updated dependencies [1912070]
  - @patchsmith/core@0.1.0-beta.53
