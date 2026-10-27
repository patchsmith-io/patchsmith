import { expect, it } from "vite-plus/test";

import { defineHook } from "./hooks";

it("rejects unknown platform hooks from untyped app code", () => {
  expect(() =>
    defineHook({
      handler: () => {},
      // @ts-expect-error Untyped callers must respect the reserved namespace at runtime too.
      hook: "patchsmith.custom",
    })
  ).toThrow('Unknown platform hook "patchsmith.custom"');
});
