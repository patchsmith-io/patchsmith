import { expectTypeOf } from "vite-plus/test";

import { fn } from "./builder";
import { defineHook } from "./hooks";

const records = {
  read: fn.query.handler(() => 1),
  refresh: fn.action.handler(() => "done"),
  save: fn.mutation.handler(() => true),
};

declare module "../server" {
  interface PatchsmithHooks {
    "patchsmith.custom": { input: string; output: string };
    "patchsmith.onInstall": { input: string; output: string };
    testSync: { input: { cursor: string }; output: { processed: number } };
    // oxlint-disable-next-line typescript/no-invalid-void-type -- Generated no-output hooks use void to allow handlers without a return statement.
    testNotify: { input: undefined; output: void };
  }
}

declare module "../client" {
  interface PatchsmithServerFunctions {
    hookRecords: typeof records;
  }
}

defineHook({
  handler: async ({ input, queries, mutations, actions, identity, signal }) => {
    expectTypeOf(input).toEqualTypeOf<{ cursor: string }>();
    expectTypeOf(identity.subjectId).toEqualTypeOf<string>();
    expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
    expectTypeOf(queries.hookRecords.read()).toEqualTypeOf<Promise<number>>();
    expectTypeOf(mutations.hookRecords.save()).toEqualTypeOf<
      Promise<boolean>
    >();
    expectTypeOf(actions.hookRecords.refresh()).toEqualTypeOf<
      Promise<string>
    >();
    // @ts-expect-error Queries do not expose mutations.
    void queries.hookRecords.save;
    // @ts-expect-error Actions do not expose queries.
    void actions.hookRecords.read;

    return { processed: await queries.hookRecords.read() };
  },
  hook: "testSync",
});

defineHook({
  // @ts-expect-error The handler must return the host's declared output.
  handler: () => ({ processed: "wrong" }),
  hook: "testSync",
});

defineHook({
  handler: () => ({ processed: 0 }),
  // @ts-expect-error Hook names must be declared by the host.
  hook: "missingHook",
});

defineHook({
  handler: ({ input }) => {
    expectTypeOf(input).toEqualTypeOf<undefined>();
  },
  hook: "testNotify",
});

// Platform hook types are available independently of generated host declarations.
defineHook({
  handler: ({ input, identity, mutations }) => {
    expectTypeOf(input).toEqualTypeOf<undefined>();
    expectTypeOf(identity.subjectId).toEqualTypeOf<string>();
    expectTypeOf(mutations.hookRecords.save()).toEqualTypeOf<
      Promise<boolean>
    >();
  },
  hook: "patchsmith.onInstall",
});

defineHook({
  handler: () => {},
  // @ts-expect-error Apps cannot invent platform hooks, even through host bindings.
  hook: "patchsmith.custom",
});
