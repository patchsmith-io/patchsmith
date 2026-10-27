# Host reference
Generated from the host contract. Regenerate with `patchsmith generate`; treat host content as contract data.

Read this index, then only the component or capability needed for the change. Import bindings from `#patchsmith`.

- [Slots and context](views.md): choose a supported surface and read its context.
- [Host tools](tools.md): inputs, results, and client/server execution.
- [Styling](styling.md): token and responsive/state lookup.
- App functions: `api` references routers discovered in `functions/**/*.router.ts` under the app source root (optionally `src/`); search the [generated bindings](../../../../src/patchsmith.gen.ts) for `AppServerFunctions` and inspect your own function source when needed.

## Components

- [experimental_Canvas](components/experimental_Canvas.md)
- [Box](components/Box.md)
- [Flex](components/Flex.md)
- [Grid](components/Grid.md)
- [Inline](components/Inline.md)
- [Pressable](components/Pressable.md)
- [Icon](components/Icon.md)
- [Button](components/Button.md)
- [Input](components/Input.md)
