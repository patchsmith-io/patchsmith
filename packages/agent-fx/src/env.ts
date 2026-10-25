import { createEnv } from "@patchsmith/env";
import { z } from "zod";

export const env = createEnv({
  schema: {
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    AI_GATEWAY_BASE_URL: z.url().optional(),
    AUTH_SECRET: z.string().min(32).optional(),
    CRON_SECRET: z.string().min(1).optional(),
    OPENAPI_SERVER_URL: z.url().optional(),
    VERCEL_OIDC_TOKEN: z.string().min(1).optional(),
  },
  scope: "agent-fx",
});
