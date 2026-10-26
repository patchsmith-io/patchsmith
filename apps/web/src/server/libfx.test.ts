import { createRequire } from "node:module";

import { expect, it } from "vite-plus/test";

it("traces the same libfx runtime used by the fx adapter", () => {
  const hostRequire = createRequire(import.meta.url);

  const agentRequire = createRequire(
    import.meta.resolve("@patchsmith/agent-fx/workflows")
  );

  const adapterRequire = createRequire(
    agentRequire.resolve("@ai-sdk/harness-fx")
  );

  // Workflow externalizes libfx, so the deployment loads the host's copy.
  expect(hostRequire.resolve("libfx")).toBe(adapterRequire.resolve("libfx"));
});
