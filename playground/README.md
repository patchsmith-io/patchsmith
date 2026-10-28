# Patchsmith playground

Use the playground to try Patchsmith contracts and apps against a local host. The TanStack Start host in `playground/tanstack-start` includes a SQLite-backed issue tracker and a passwordless profile picker. The Todo app uses the host’s client tools to scope todos to the selected team.

## Start the playground

From the repository root, install dependencies and start the local Patchsmith platform in one terminal:

```sh
pnpm install
pnpm dev
```

Prepare and seed the playground database, then start the host in another terminal:

```sh
pnpm playground:db:push
pnpm playground:db:seed
pnpm playground:dev
```

Open the [playground at localhost:5010](http://localhost:5010). Choose one of the demo profiles and teams. The demo sign-in is local-only and does not use passwords. To reset the database, delete `playground/shared/.data/playground.sqlite`, then run `pnpm playground:db:push` followed by `pnpm playground:db:seed`. This removes your local playground data.

## Apps and contracts

The Todo app builds with Vite+ and the Patchsmith plugin in `vite.config.ts`. Run `pnpm playground:todo:build` from the repository root, or `pnpm build` from `playground/apps/todo`. Build aliases and custom plugins belong in that Vite configuration. Host and backend settings remain in `patchsmith.config.ts`. Lint and format settings are inherited from the repository's root configuration; the app also provides `check`, `fix`, `lint`, and `format` scripts.

The app in `playground/apps/todo` uses the host's `todos` client tools, whose API is defined in the active contract. To try a different validation library, change the export in `playground/shared/src/contracts/active.ts` to `./valibot` or `./arktype`, then run:

```sh
pnpm playground:generate
pnpm playground:todo:build
```

`playground:generate` serializes the selected contract to `playground/schema.json`, then runs `patchsmith generate --schema` for the todo app. It does not need the host to be running. Repeated JSON Schema definitions use local `$defs`/`$ref` references in both the generated file and the host response; the app type generator resolves them before producing TypeScript. The file contains the raw schema object accepted by `patchsmith generate --schema`, matching the `schema` value inside the host's `/meta` response.

The host contract exposes these components: the standard `Box`, `Flex`, `Grid`, `Inline`, `Pressable`, and Lucide-backed `Icon` primitives, plus `Button`, `Input`, and the opt-in `experimental_Canvas`. The host maps `Button` and `Input` to `@patchsmith/ui` and uses the standard React renderers for primitives.

All three validator contracts also declare a `ping` hook with no input and the literal output `"pong"`. The Todo app implements it in [src/hooks/ping.hook.ts](apps/todo/src/hooks/ping.hook.ts). After `pnpm playground:generate`, inspect its generated [capability skill](apps/todo/.agents/skills/patchsmith-capabilities/SKILL.md), [hook index](apps/todo/.agents/skills/patchsmith-capabilities/references/hooks.md), and [ping reference](apps/todo/.agents/skills/patchsmith-capabilities/references/hooks/ping.md). Build and publish the app to advertise the handler to the host.

The Todo panel includes Pressable examples with inline, box, flex, and grid layouts, an email row with nested layout children, an icon-only action with an explicit name, and a disable toggle. Try hover, hold, Tab / Shift+Tab, Enter, and Space.

The built-in scales follow Tailwind v4: spacing uses numeric strings (`padding="4"` is `1rem`), and width and height share the same fixed sizes (`width="12"` is `3rem`). Radius names match `rounded-*`, including `xs` through `4xl`, `none`, and `full`.

Every primitive style prop accepts a token string or a conditional object:

```tsx
<Pressable
  background={{
    default: "surface",
    ":hover": "hover",
    ":active": { default: "pressed", lg: "hover" },
  }}
  borderColor={{ default: "default", ":focus-visible": "focus" }}
  padding={{ default: "2", lg: "4" }}
  textColor={{ ":disabled": "muted" }}
  onPress={openProject}
>
  Open project
</Pressable>
```

Use `background="surface"` when no conditions are needed. Supported states are `:hover`, `:active`, `:focus-visible`, and `:disabled`. State values accept a token or a breakpoint object; combine conditions by nesting breakpoints inside a state. `default` supplies the fallback independently of configured breakpoints. Breakpoint names come from `primitives(theme)`; `default` and names beginning with `:` produce type errors and are rejected at runtime. A breakpoint named `hover` is distinct from the `:hover` state.

Within a property, later matching breakpoint entries override earlier ones. List minimum-width breakpoints from smaller to larger for the usual responsive behavior. State styles override ordinary breakpoint styles; active styles override focus-visible and hover styles on conflicting properties. Disabled Pressables ignore the other interaction states. `onPress` runs on activation; state styling stays in the host. Pressable renders its own `<div role="button">`; `layout` defaults to `"inline"` (`inline-flex`). `"box"`, `"flex"`, and `"grid"` map to `block`, `flex`, and `grid`. Layout never depends on children. Use `Box`, `Flex`, `Grid`, and `Inline` children to compose content. Nested interactive controls (including other Pressables, buttons, links, and inputs) are unsupported; place them alongside the Pressable.

Enabled Pressables use `tabIndex={0}` and have a visible focus outline. Enter activates on keydown; Space prevents scrolling and activates on keyup. Moving focus or disabling the control cancels a held Space. Activation preserves focus unless the action moves it. Disabled Pressables expose `aria-disabled="true"`, use `tabIndex={-1}`, and block pointer, keyboard, and programmatic clicks. Children supply the accessible name; use `ariaLabel` for an explicit name, especially for icon-only controls. Only the zero-argument `onPress` callback crosses into the sandbox; DOM events, focus, and interaction state remain in the host.

The email row demonstrates nested layout children:

```tsx
<Pressable layout="flex" align="center" gap="2" padding="4" onPress={openEmail}>
  <Box grow="1">
    <Inline>{email.sender}</Inline>
    <Inline>{email.subject}</Inline>
  </Box>
  <Inline>{email.receivedAt}</Inline>
</Pressable>
```

Every configured breakpoint needs a media-query width. Generated types reflect the contract's breakpoint names and supported pseudo-classes; `default` is the sole fallback key.

The contracts in `playground/shared/src/contracts/` are deliberately written with each validator's native API. Keep their components, views, scopes, tools, and validation behavior aligned when editing them.

## Update the playground database

The host data model is in `playground/shared/src/db/schema.ts`. It uses Drizzle with Node's built-in SQLite driver. Push schema changes with `pnpm playground:db:push`; this playground does not keep migration files. Profiles, teams, memberships, and starter issues are seeded by `pnpm playground:db:seed`.

## Experimental canvas demo

The Todo panel includes a Chart.js 4.5.1 bar chart drawn inside the sandbox with `experimental_useCanvasSurface`. Its host component is declared with `experimental_canvas` and rendered by `experimental_canvasRenderer`; all three validator contracts expose the same policy. Controls exercise dependency redraw, backing-size changes, animation, and unmount/remount. The instance counter verifies that resizing replaces the chart and hiding it releases the Chart.js instance.

Chart.js uses the lifecycle form of `experimental_useCanvasSurface`: `create` creates the chart and installs local event listeners, `resize` initializes its backing dimensions, `update` applies data changes, `draw` handles continuous animation, and `dispose` destroys it. Update dependencies do not recreate the chart; `createDependencies` can explicitly request replacement for construction settings. Input and invalidation present the library’s existing drawing without rerunning data updates. Patchsmith owns surface replacement, cancellation, and disposal. A small Chart.js `BasicPlatform` extension uses the OffscreenCanvas's local mouse events, so its ordinary hover handling and on-canvas tooltip work. Chart.js uses `responsive: false`, `devicePixelRatio: 1`, and `animation: false`; Patchsmith controls backing dimensions and frame pacing. The chart animation uses the supplied frame timestamp and requests at most 30 FPS, below the host cap. The drawing buffer is preserved by default. Its `ChartItem` TypeScript type still requires a documented local assertion for OffscreenCanvas.

All three playground contracts grant pointer input and the focused ArrowLeft/ArrowRight keys. Hover over a bar to show its tooltip. Click or Tab to the canvas, hold an arrow key, then move focus away to verify the held-key indicator resets. The host excludes other keys and control/meta/alt shortcuts. These permissions are disabled by default in the canvas API.

To try the same app through a standalone `RenderSlot.Controlled` host without database or platform setup, run `pnpm playground:generate`, `pnpm playground:todo:build`, `pnpm --filter @patchsmith/ui build`, and `pnpm --filter @playground/tanstack-start dev:canvas`. Open http://127.0.0.1:5191/canvas-demo.html. The standalone host adds sandbox restart and a second app instance for isolation checks. From a fresh load, `await window.experimental_runCanvasChecks()` runs the repeatable browser checks, including pixel readback for bars and axis labels, data changes, animation start/stop, and Chart.js instance cleanup.

See [the sandbox guide](../packages/sandbox/README.md) for the host/app API, limits, and low-level throughput harness. Canvas input requires host opt-in; audio remains a separate capability. The sandbox script policy now permits WebAssembly compilation and JavaScript string evaluation inside the isolated iframe.
