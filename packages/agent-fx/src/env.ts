import { createEnv } from "@patchsmith/env";
import { z } from "zod";

export const env = createEnv({
  schema: {
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    AI_GATEWAY_BASE_URL: z.url().optional(),
    CRON_SECRET: z.string().min(1).optional(),
    VERCEL_OIDC_TOKEN: z.string().min(1).optional(),
  },
  scope: "agent-fx",
});
