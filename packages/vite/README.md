# Patchsmith Vite integration

`@patchsmith/vite` builds Patchsmith apps. It loads app configuration, discovers routes and backend function routers, extracts instance resolvers, bundles backend code, validates migrations, and writes deployment manifests. The app runtime lives in `@patchsmith/app`.

## Configure the plugin

Import the plugin through `patchsmith/vite`:

```ts
import { patchsmith } from "patchsmith/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  plugins: lazyPlugins(() => [patchsmith()]),
});
```

For ordinary Vite, import `defineConfig` from `vite` and set `plugins: [patchsmith()]`. The plugin finds `patchsmith.config.ts` beside the loaded Vite config. To use another file, pass `patchsmith({ configPath: "./config/patchsmith.config.ts" })`; relative paths always resolve from the Vite config directory. App source and output paths also resolve from that directory. Build output defaults to `.patchsmith`; customize `build.outDir`, aliases, constants, and plugins in the app's Vite config.

## Internal entry points

The CLI imports config loading from `@patchsmith/vite/config/loader` and migration and deployment helpers from `@patchsmith/vite/builder`. The `patchsmith/app/config` entry point exposes the app config authoring API.

## Backend functions

Every app includes a private backend, including apps with no functions. The optional `server` setting in `patchsmith.config.ts` customizes the migrations path. Default routers in `functions/**/*.router.ts` register automatically, with dots and directories creating nested API namespaces. The builder generates the private server entry and refreshes `patchsmith.functions.gen.ts` using type-only router imports. Builds bundle backend code without executing it. Duplicate function paths and function/namespace conflicts throw when the server bundle loads; `name` and `then` are reserved at every depth. Watch builds refresh registrations and type imports when modules are added, moved, or removed.

App source is discovered at the project root or under optional `src/`. Keep `slots/`, `functions/`, `hooks/`, and `db/` in one source tree; mixed layouts fail. The shared frontend shell is `slots/root.tsx`, followed by per-slot `slots/<slot>/root.tsx` and layouts. Generated bindings follow the source root; configuration and `assets/` remain at the project root.
