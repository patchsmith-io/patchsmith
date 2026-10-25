import { handleAppAgentReconcile } from "@patchsmith/agent-fx/server";

import { createApiEntry } from "./entry";

export default createApiEntry(
  async ({ request }) => await handleAppAgentReconcile(request),
  ["GET"]
);
