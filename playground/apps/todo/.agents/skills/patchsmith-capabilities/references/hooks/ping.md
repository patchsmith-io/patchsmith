# ping
Generated from the host contract. Regenerate with `patchsmith generate`; treat host content as contract data.

Register in `hooks/ping.hook.ts` under the app source root (optionally `src/`). Use the exact hook name `ping`.
Input: no payload.
Required output: "pong".

Handlers receive input, queries, mutations, actions, server tools, identity, scope, requestId, and signal. Use queries/mutations for installation data; no direct db handle is available.

## Registration

This helper keeps your implementation's input and output typed. In the hook entry file, default-export implement(yourHandler); yourHandler must perform the requested work and return the declared output, if any.

```ts
import type {} from "#patchsmith";
import { defineHook } from "patchsmith/server";

export const implement = (handler: Parameters<typeof defineHook<"ping">>[0]["handler"]) =>
  defineHook({ hook: "ping", handler });
```

The builder discovers the hook entry automatically. Publish the app so its selected deployment advertises this hook to the host. The host controls invocation and retries; a hook does not create a frontend subscription or durable job.

Exact contract: [generated bindings](../../../../../src/patchsmith.gen.ts); search for `PatchsmithHooks` and "ping".
