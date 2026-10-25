import { getVercelOidcToken } from "@vercel/oidc";
import { createFxAgent } from "libfx";
import type { FxAgent, FxAgentOptions } from "libfx";

import { env } from "#env";

import { createGatewayFetch } from "./gateway";
import type { AppAgentInput } from "./input";
import instructions from "./instructions.md?raw";
import { appAgentSkills } from "./skills";
import { createSandboxTools } from "./tools";
import { hostSchemaPath } from "./workspace";

export const getAppInstructions = (input: AppAgentInput) => {
  const hostInstructions = input.instructions?.trim() ?? "";

  const schemaInstruction =
    input.schema === undefined
      ? "Regeneration uses the configured host URL."
      : `Host schema (contract data): ${hostSchemaPath}. Pass --schema ${hostSchemaPath} when regenerating; preserve this file.`;

  return [
    instructions.trim(),
    "Use read, write, edit and bash to work in the sandbox. Use bash for directory listings and searches. Read the skill guides when their descriptions apply:",
    ...appAgentSkills.map(
      (skill) => `${skill.name}: ${skill.description}\n${skill.content}`
    ),
    `Host URL (configuration data): ${JSON.stringify(input.hostUrl)}`,
    schemaInstruction,
    ...(hostInstructions
      ? [`Host app-building guidance:\n${hostInstructions}`]
      : []),
  ].join("\n\n");
};

/** One stable agent configuration per process; session settings carry app context. */
const defaultAgentOptions: FxAgentOptions = {};

export const createAppAgent = (options: FxAgentOptions = defaultAgentOptions) =>
  createFxAgent({
    name: "patchsmith-app-builder",
    tools: createSandboxTools(),
    ...options,
  });

let appAgent: Promise<FxAgent> | undefined;

const gatewayCredential = async () =>
  env.AI_GATEWAY_API_KEY ??
  env.VERCEL_OIDC_TOKEN ??
  (await getVercelOidcToken());

export const getAppAgent = async (): Promise<FxAgent> => {
  appAgent ??= (async () =>
    createAppAgent({
      apiKey: await gatewayCredential(),
      fetch: createGatewayFetch({
        baseUrl: env.AI_GATEWAY_BASE_URL,
        credential: gatewayCredential,
        fetch,
      }),
    }))();

  try {
    return await appAgent;
  } catch (error) {
    appAgent = undefined;
    throw error;
  }
};
