import type { RouterClient } from "@orpc/server";

import { appAgentRouter } from "./routes/app-agent";
import { appRouter, discoverApps, lookupApp } from "./routes/apps";
import { backendSession } from "./routes/backend";
import { cliAuthRouter } from "./routes/cli-auth";
import { cliAuthPageRouter } from "./routes/cli-auth-page";
import { deploymentRouter } from "./routes/deployments";
import { meta, schema } from "./routes/metadata";
import { toolsRouter } from "./routes/tools";
import { views } from "./routes/views";

export const patchsmithRouter = {
  appAgent: appAgentRouter,
  apps: appRouter,
  cliAuth: cliAuthRouter,
  deployments: deploymentRouter,
};

export type PatchsmithRouter = typeof patchsmithRouter;

export type PatchsmithRouterClient = RouterClient<PatchsmithRouter>;

/** Existing plain HTTP URLs, served by oRPC's OpenAPI transport. */
export const patchsmithHttpRouter = {
  appLookup: lookupApp,
  apps: discoverApps,
  backend: { session: backendSession },
  cliAuthPage: cliAuthPageRouter,
  meta,
  schema,
  tools: toolsRouter,
  views,
};
