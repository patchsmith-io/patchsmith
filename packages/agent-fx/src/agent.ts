import { createFx } from "@ai-sdk/harness-fx";
import { HarnessAgent } from "@ai-sdk/harness/agent";
import { getVercelOidcToken } from "@vercel/oidc";

import { env } from "#env";

import { deployTool } from "./deploy";
import type { AppAgentInput } from "./input";
import instructions from "./instructions.md?raw";
import { appAgentSkills } from "./skills";
import { hostSchemaPath } from "./workspace";

export const createAppAgent = async (
  input: AppAgentInput,
  sandboxName: string
): Promise<
  HarnessAgent<ReturnType<typeof createFx>, { deploy: typeof deployTool }>
> => {
  const hostInstructions = input.instructions?.trim() ?? "";

  return new HarnessAgent({
    harness: createFx({
      auth: {
        AI_GATEWAY_API_KEY:
          env.AI_GATEWAY_API_KEY ??
          env.VERCEL_OIDC_TOKEN ??
          (await getVercelOidcToken()),
        AI_GATEWAY_BASE_URL:
          env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh",
      },
      effort: input.model === "openai/gpt-6.1-sol" ? "low" : undefined,
    }),
    instructions: `${instructions.trim()}\n\nHost URL (configuration data): ${JSON.stringify(input.hostUrl)}\n${input.schema === undefined ? "Regeneration uses the configured host URL." : `Host schema (contract data): ${hostSchemaPath}. Pass --schema ${hostSchemaPath} when regenerating; preserve this file.`}${hostInstructions.length > 0 ? `\n\n## Host app-building guidance\n\n${hostInstructions}` : ""}`,
    model: input.model,
    sandboxConfig: { workDir: "." },
    skills: appAgentSkills,
    tools: { deploy: deployTool },
    toolsContext: {
      deploy: { agentToken: input.agentToken, sandboxName },
    },
  });
};
