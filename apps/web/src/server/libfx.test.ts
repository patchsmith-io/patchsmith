import { createRequire } from "node:module";

import { expect, it } from "vite-plus/test";

it("traces the same libfx runtime used by the native app agent", () => {
  const hostRequire = createRequire(import.meta.url);

  const agentRequire = createRequire(
    import.meta.resolve("@patchsmith/agent-fx/workflows")
  );

  expect(hostRequire.resolve("libfx")).toBe(agentRequire.resolve("libfx"));
});
