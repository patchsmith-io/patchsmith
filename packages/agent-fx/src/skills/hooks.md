# Host hooks

A host hook is a named point where the product calls app logic. Most hooks let an app react to product events, such as a contact being created, including when no app panel is open. Hosts can also use hooks as callbacks that return a result, approval steps that return a decision, or other extensions to product behavior.

The host declares the input and output and decides when to invoke the hook and how to use its result. An event notification may need no return value; a callback or approval step may require one. Host hooks run on the backend, separately from Preact hooks and UI callbacks. Tools work in the other direction: the app calls the product.

## Discover the hook

For requests such as “when a contact is created” or “check whether this request should be approved”, read `.agents/skills/patchsmith-capabilities/references/hooks.md`, then the matching hook's reference. These pages come from the host contract and describe each hook's input, output, and registration path. Check them before concluding the capability is unavailable; the tools list does not list host hooks.

If the references are from an older generator, inspect `hooks` in the host schema supplied to the workspace or search `PatchsmithHooks` in `patchsmith.gen.ts`. Regenerate bindings with the configured host or supplied schema when needed. An absent handler in the app means the app has not implemented the hook, not that the host lacks it. If the current host contract has no matching hook, explain that limitation rather than inventing a hook or silently replacing the requested behavior with polling or manual testing.

## Implement a handler

Create `hooks/<name>.hook.ts` under the app source root, optionally `src/`. Default-export `defineHook` from `patchsmith/server` with a literal `hook` name matching the host declaration. Dotted names map to directories or dots: `records.created` can use `hooks/records/created.hook.ts` or `hooks/records.created.hook.ts`. Choose one file per hook.

Import the generated bindings for their types; they declare both the host hooks and the app function registry. This example assumes the host declares `contactCreated` with input `{ contact: { name: string } }` and no output. It uses the `notes.add` mutation from `patchsmith-functions`:

<!-- example: hooks/contactCreated.hook.ts -->

```ts
import { defineHook } from "patchsmith/server";

import type {} from "#patchsmith";

export default defineHook({
  hook: "contactCreated",
  async handler({ input, mutations }) {
    await mutations.notes.add({ title: input.contact.name });
  },
});
```

Handlers receive `input`, `queries`, `mutations`, `actions`, server `tools`, `identity`, `scope`, `requestId`, and `signal`. They have no direct `db`; use app queries and mutations for saved settings or other installation data. Await backend work and return the host's declared output when required. Do not return an action's result from a hook that declares no output.

For an automation with a manual test button, put the shared behavior in an app action and call it through `actions` from the hook and `useAction` from the UI. Keep functions used only by the hook `.internal()`; internal functions remain callable by hook handlers. Use `patchsmith-functions` for actions and `patchsmith-database` for persistent settings.

## Publish and delivery

The builder discovers `*.hook.ts` files automatically. Regenerate after adding backend functions and deploy the app: the selected published deployment advertises its implemented hook names, which the host uses for discovery. An unpublished handler or older deployment will not receive calls.

The host decides when to invoke hooks and owns scheduling and retry policy. Hooks are backend calls, not frontend subscriptions, and do not provide durable execution or automatic retries. Make repeatable effects safe for the requested integration without assuming exactly-once delivery. Do not claim a real event or webhook was tested unless it was exercised with authorization.
