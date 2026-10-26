import type { AgentModel } from "@patchsmith/client-platform/agent";

import { validatePatchsmithScopes } from "./scope";
import type { PatchsmithScopeSchemas } from "./scope";
import type { PatchsmithHostContext, PatchsmithPlatformOptions } from "./types";

const isStringValue = <TValue>(value: TValue): value is TValue & string =>
  typeof value === "string";

const isFunctionValue = <TValue>(
  value: TValue
): value is Extract<TValue, CallableFunction> => typeof value === "function";

const maximumContextHeaderLength = 8192;

/** Prepare standard HTTP MCP client configuration; no host route or custom fetch is needed. */
export const createMcpTransport = (options: {
  agentInstructions?: string;
  agentModel?: AgentModel;
  hostUrl: string;
  platformUrl: string;
  platformHeaders?: PatchsmithPlatformOptions["headers"];
  scopeSchemas: PatchsmithScopeSchemas;
}) => ({
  transport: async (
    context: PatchsmithHostContext<unknown>
  ): Promise<{
    url: string;
    headers: Record<string, string>;
  }> => {
    if (
      !isStringValue(context.subjectId) ||
      !context.subjectId ||
      context.subjectId.length > 256
    ) {
      throw new TypeError("Invalid MCP subjectId.");
    }

    const scopes = await validatePatchsmithScopes(
      options.scopeSchemas,
      context.scopes
    );

    const bytes = new TextEncoder().encode(
      JSON.stringify({
        hostUrl: options.hostUrl,
        instructions: options.agentInstructions,
        model: options.agentModel,
        scopes,
        subjectId: context.subjectId,
      })
    );

    if (bytes.length > (maximumContextHeaderLength * 3) / 4) {
      throw new TypeError(
        "MCP context exceeds the 8 KiB header limit. Supply fewer scopes or shorter agent instructions."
      );
    }

    const encoded = btoa(String.fromCodePoint(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");

    const configured = await (isFunctionValue(options.platformHeaders)
      ? options.platformHeaders()
      : options.platformHeaders);

    const headers = new Headers(configured);

    if (!(headers.get("authorization")?.startsWith("Bearer ") === true)) {
      throw new Error("A Patchsmith projectKey is required for MCP transport.");
    }

    headers.set("x-patchsmith-context", encoded);

    return {
      headers: Object.fromEntries(headers),
      url: `${options.platformUrl.replace(/\/$/u, "")}/app-agent/mcp`,
    };
  },
});
