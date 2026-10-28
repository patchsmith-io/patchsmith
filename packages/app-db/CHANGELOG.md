# @patchsmith/app-db

## 0.1.0-beta.72

No changes in this release.

## 0.1.0-beta.71

No changes in this release.

## 0.1.0-beta.70

No changes in this release.

## 0.1.0-beta.69

No changes in this release.

## 0.1.0-beta.68

No changes in this release.

## 0.1.0-beta.67

No changes in this release.

## 0.1.0-beta.66

No changes in this release.

## 0.1.0-beta.65

No changes in this release.

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

No changes in this release.

## 0.1.0-beta.58

No changes in this release.

## 0.1.0-beta.57

No changes in this release.

## 0.1.0-beta.56

No changes in this release.

## 0.1.0-beta.55

No changes in this release.

## 0.1.0-beta.54

No changes in this release.

## 0.1.0-beta.53

### Minor Changes

- e96dce2: Rename TailorKit to Patchsmith. Install `patchsmith` and `@patchsmith/*` packages, replace `TailorKit`/`tailorkit` identifiers with `Patchsmith`/`patchsmith`, and use the `patchsmith` CLI. Rename `tailorkit.config.ts` to `patchsmith.config.ts`, regenerate app bindings with `patchsmith generate`, and update imports to `#patchsmith` and `src/patchsmith.gen.ts`.

  Move platform URLs to `https://patchsmith.io` and host integration routes to `/api/patchsmith`. Rename `TAILORKIT_*` environment variables to `PATCHSMITH_*`; app output and local credential directories now use `.patchsmith`. Sign in again after upgrading. Hosted app assets and RPC URLs continue to use `tailorkit.app`.

- 1912070: Build packages with Vite+ instead of tsup while preserving public entry points and declaration paths.

  Drop Node.js 20 support and target Node.js 22 for all public packages, including the CLI and sandbox library. Use Node.js 22 or newer. Public package manifests and generated apps declare `engines.node: ">=22"`. Internal builds and workspace manifests require Node.js 24.

### Patch Changes

- d799743: Update package repository links to `patchsmith-io/patchsmith`.

## 0.1.0-beta.52

No changes in this release.

## 0.1.0-beta.51

No changes in this release.

## 0.1.0-beta.50

No changes in this release.

## 0.1.0-beta.49

No changes in this release.

## 0.1.0-beta.48

No changes in this release.

## 0.1.0-beta.47

No changes in this release.

## 0.1.0-beta.46

### Minor Changes

- 20947c7: Move the app database API into the new `@patchsmith/app-db` package, exposed through `patchsmith/db`. Import `defineDatabase`, table and column builders, query helpers, and database types from `patchsmith/db` instead of `patchsmith/server`.

  Use Patchsmith's `defineRelations` from `patchsmith/db` instead of importing it directly from `drizzle-orm`. New apps scaffold these imports automatically. Existing relation callbacks keep the same typed one/many navigation syntax.
