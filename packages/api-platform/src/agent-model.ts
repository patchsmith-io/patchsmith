import { z } from "zod";

export const agentModelSchema = z.enum([
  "openai/gpt-6.1-sol",
  "openai/gpt-6.1-sol-fast",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-opus-5.5",
  "openai/gpt-6-astra",
  "deepseek/deepseek-v4.1-flash",
]);

/** Keep the public DeepSeek option stable while pinning the tested Gateway snapshot. */
export const resolveAgentModel = (
  model: z.infer<typeof agentModelSchema> = "openai/gpt-6.1-sol"
) =>
  model === "deepseek/deepseek-v4.1-flash"
    ? "deepseek/deepseek-v4.1-flash-1017"
    : model;
