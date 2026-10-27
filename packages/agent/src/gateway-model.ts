import type { HarnessV1AuthenticationEnvironment } from "@ai-sdk/harness";
import type { PiHarnessSettings } from "@ai-sdk/harness-pi";

/** Override Pi's Gateway transport for Sol so reasoning effort reaches Responses. */
export const gatewayModelProviders = (
  modelId: string,
  auth: HarnessV1AuthenticationEnvironment
): NonNullable<PiHarnessSettings["providers"]> => {
  const useGateway =
    auth.AI_GATEWAY_API_KEY !== undefined ||
    auth.VERCEL_OIDC_TOKEN !== undefined;

  const isSolFast = modelId === "openai/gpt-6.1-sol-fast";

  if (!useGateway || (modelId !== "openai/gpt-6.1-sol" && !isSolFast)) {
    return {};
  }

  const baseUrl = (
    auth.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh"
  ).replace(/\/$/u, "");

  return {
    "vercel-ai-gateway": {
      api: "openai-responses",
      baseUrl: `${baseUrl}/v1`,
      // Pi requires a complete entry to override a bundled model's protocol.
      models: [
        {
          // Operational budget: Pi's 16,384-token reserve triggers compaction
          // around 256K, leaving headroom below the 272K pricing threshold.
          contextWindow: 272_000,
          cost: isSolFast
            ? { cacheRead: 0.2, cacheWrite: 5, input: 4, output: 20 }
            : { cacheRead: 0.1, cacheWrite: 2.5, input: 2, output: 10 },
          id: modelId,
          input: ["text", "image"],
          maxTokens: 128_000,
          name: isSolFast ? "GPT-6.1 Sol (Fast)" : "GPT-6.1 Sol",
          reasoning: true,
        },
      ],
    },
  };
};
