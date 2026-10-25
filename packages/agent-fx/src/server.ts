import { env } from "#env";

import { getAppAgent } from "./agent";

/** Mounted only on the private Vercel queue-trigger function. */
export const handleAppAgentWake = async (
  request: Request
): Promise<Response> => {
  const agent = await getAppAgent();

  return await agent.wakeHandler()(request);
};

export const handleAppAgentReconcile = async (
  request: Request
): Promise<Response> => {
  if (
    env.CRON_SECRET === undefined ||
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [{ start }, { reconcileAppAgents }] = await Promise.all([
    import("workflow/api"),
    import("./workflows"),
  ]);

  const run = await start(reconcileAppAgents, []);

  return Response.json({ runId: run.runId }, { status: 202 });
};
