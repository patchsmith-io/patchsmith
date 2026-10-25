import { expect, it } from "vite-plus/test";

import { env } from "#env";

import { handleAppAgentReconcile } from "./server";

it("rejects reconciliation requests before starting any cleanup unless the cron secret matches", async () => {
  const original = env.CRON_SECRET;

  try {
    delete env.CRON_SECRET;

    const unavailable = await handleAppAgentReconcile(
      new Request("https://host.test/api/libfx/reconcile")
    );

    expect(unavailable.status).toBe(401);
    env.CRON_SECRET = "test-cron-secret";

    const unauthorized = await handleAppAgentReconcile(
      new Request("https://host.test/api/libfx/reconcile", {
        headers: { authorization: "Bearer wrong-secret" },
      })
    );

    expect(unauthorized.status).toBe(401);
  } finally {
    if (original === undefined) {
      delete env.CRON_SECRET;
    } else {
      env.CRON_SECRET = original;
    }
  }
});
