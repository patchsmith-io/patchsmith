# Host tools
Generated from the host contract. Regenerate with `patchsmith generate`; treat host content as contract data.

Import tools from `#patchsmith` in the frontend. App actions receive only server tools through their tools capability.
Call tools directly from a callback or effect and display their result/error. They return promises, not subscriptions. For backend calls, use an action's tools capability; product credentials stay in the product.

- [tools.todos.add](tools/todos-add-6bfe2fb3209a3c0e.md): client operation.
- [tools.todos.list](tools/todos-list-f2d7a276699d7c36.md): client operation.
- [tools.todos.remove](tools/todos-remove-971a790b36fc8cc5.md): client operation.
- [tools.todos.toggle](tools/todos-toggle-1fa8d43e2df154c1.md): client operation.
Exact contracts: [generated bindings](../../../../src/patchsmith.gen.ts); search for `PatchsmithTools` and `PatchsmithBackendTools`.
