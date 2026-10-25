import { handleAppAgentWake } from "@patchsmith/agent-fx/server";

import { createApiEntry } from "./entry";

export default createApiEntry(
  async ({ request }) => await handleAppAgentWake(request),
  ["POST"]
);
