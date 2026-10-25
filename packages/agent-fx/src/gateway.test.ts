import { expect, it } from "vite-plus/test";

import { createGatewayFetch } from "./gateway";

it("refreshes host credentials per request and preserves model request bodies when retargeting Gateway", async () => {
  const requests: Request[] = [];
  let generation = 0;

  const gatewayFetch = createGatewayFetch({
    baseUrl: "https://gateway.test/prefix",
    credential: async () => {
      generation += 1;

      return await Promise.resolve(`token-${generation}`);
    },
    fetch: async (input, init) => {
      requests.push(new Request(input, init));

      return await Promise.resolve(Response.json({ ok: true }));
    },
  });

  await gatewayFetch("https://ai-gateway.vercel.sh/v4/ai/language-model", {
    body: "first",
    headers: { authorization: "Bearer stale" },
    method: "POST",
  });
  await gatewayFetch("https://ai-gateway.vercel.sh/v4/ai/language-model", {
    body: "second",
    method: "POST",
  });
  const [first, second] = requests;
  expect(first?.url).toBe("https://gateway.test/prefix/v4/ai/language-model");
  expect(first?.headers.get("authorization")).toBe("Bearer token-1");
  expect(second?.headers.get("authorization")).toBe("Bearer token-2");
  expect(await first?.text()).toBe("first");
  expect(await second?.text()).toBe("second");
});
