import type { FxFetch } from "libfx";

interface GatewayTransport {
  baseUrl?: string;
  credential: () => Promise<string>;
  fetch: typeof fetch;
}

/** Refresh runtime OIDC credentials on requests made by a long-lived named agent. */
export const createGatewayFetch =
  (transport: GatewayTransport): FxFetch =>
  async (input, init) => {
    const request = new Request(input, init);
    const source = new URL(request.url);

    if (source.hostname !== "ai-gateway.vercel.sh") {
      return await transport.fetch(request);
    }

    request.headers.set(
      "authorization",
      `Bearer ${await transport.credential()}`
    );

    if (transport.baseUrl === undefined) {
      return await transport.fetch(request);
    }

    const target = new URL(transport.baseUrl);
    target.pathname = `${target.pathname.replace(/\/$/u, "")}${source.pathname}`;
    target.search = source.search;

    return await transport.fetch(new Request(target, request));
  };
