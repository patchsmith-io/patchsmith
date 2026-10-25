import { z } from "zod";

export const nativeSessionSchema = z.strictObject({
  sessionId: z.string().regex(/^wrun_[A-Za-z0-9]+$/u),
  type: z.literal("libfx"),
  version: z.literal(1),
});

export type NativeSessionState = z.infer<typeof nativeSessionSchema>;

export const toolContextSchema = z.strictObject({
  appId: z.uuid(),
  grant: z.strictObject({
    appId: z.uuid(),
    cliTokenId: z.string().min(1),
    projectId: z.string().min(1),
    scope: z.object({
      name: z.string(),
      value: z.record(z.string(), z.json()),
    }),
  }),
  runId: z.string().startsWith("wrun_"),
  threadId: z.uuid(),
});

export type AppToolContext = z.infer<typeof toolContextSchema>;
