# Host hooks
Generated from the host contract. Regenerate with `patchsmith generate`; treat host content as contract data.

Hooks usually let apps respond to product events, including while app UI is closed. The host can also use hooks as callbacks, approval steps, or other extension points, asking the app for a result or decision before continuing.
The host declares each hook's input and output, decides when to invoke it, and controls how its result is used. Host hooks run on the backend, separately from UI callbacks and client hooks. Host tools run in the opposite direction: the app calls the host.

- [ping](hooks/ping.md)

Exact contracts: [generated bindings](../../../../src/patchsmith.gen.ts); search for `PatchsmithHooks`.
