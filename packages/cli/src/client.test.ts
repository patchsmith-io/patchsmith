import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { asyncFixture } from "@patchsmith/config/testing";
import { SignJWT } from "jose";
import { afterEach, assert, expect, it, vi } from "vite-plus/test";

import { getAgentAuth } from "./agent-auth";
import { createCliClient } from "./client";

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error("Expected a defined value.");
  }

  return value;
};

const requireRequest = (input: Parameters<typeof fetch>[0]): Request => {
  assert(input instanceof Request);

  return input;
};

const now = Math.floor(Date.now() / 1000);
const scope = { name: "user", value: { userId: "one" } };

const token = async (overrides = {}) =>
  await new SignJWT({
    appId: "app-one",
    aud: "patchsmith-platform-cli",
    exp: now + 3600,
    iat: now,
    iss: "patchsmith-agent",
    platformUrl: "https://platform.test/api/platform",
    projectId: "project",
    scope,
    ...overrides,
  })
    .setProtectedHeader({ alg: "HS256", typ: "patchsmith-agent+jwt" })
    .sign(new TextEncoder().encode("test-only-signing-key"));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("uses existing platform deployment endpoints and scope from the agent JWT", async () => {
  const jwt = await token();
  vi.stubEnv("PATCHSMITH_AGENT_TOKEN", jwt);

  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(Response.json({}));

  const client = createCliClient({ token: jwt, url: "http://localhost:1" });
  await client.deployments.create({
    appId: "app-one",
    assets: [
      {
        checksum: "a".repeat(64),
        contentLength: 10,
        contentType: "application/javascript",
        encoding: "gzip",
        objectKey: "client.js",
      },
    ],
  });
  await client.deployments.publish({
    deploymentId: "deployment-one",
    rollout: true,
  });

  const requests = fetch.mock.calls.map(([input]) => requireRequest(input));
  expect(requests.map((request) => request.url)).toEqual([
    "https://platform.test/api/platform/deployments",
    "https://platform.test/api/platform/deployments/deployment-one",
  ]);
  await Promise.all(
    requests.map(async (request) => {
      expect(request.headers.get("authorization")).toBe(`Bearer ${jwt}`);
      expect(request.redirect).toBe("error");

      expect(await request.json()).toMatchObject({ scope });
    })
  );
  await client.appAgent.create({
    description: null,
    name: "App",
  });
  const appRequest = requireRequest(requireValue(fetch.mock.lastCall)[0]);
  expect(appRequest.url).toBe(
    "https://platform.test/api/platform/app-agent/apps"
  );
  expect(await appRequest.json()).toEqual({
    deployToken: jwt,
    description: null,
    name: "App",
  });
});

it.each([
  { exp: now - 1 },
  { iat: now + 10 },
  { exp: now + 7200 },
  { platformUrl: "https://user:password@platform.test/api/platform" },
  { platformUrl: "https://platform.test/api/platform?query=1" },
  { aud: "different" },
  { scope: null },
  { platformUrl: "http://platform.test/api/platform" },
  { platformUrl: "http://localhost.evil.test/api/platform" },
])("rejects malformed or expired agent authorization %j", async (overrides) => {
  vi.stubEnv("PATCHSMITH_AGENT_TOKEN", await token(overrides));
  expect(getAgentAuth).toThrow(/agent authorization/iu);
});

it("does not fall back when an explicitly supplied JWT is invalid or empty", () => {
  vi.stubEnv("PATCHSMITH_AGENT_TOKEN", "");
  expect(getAgentAuth).toThrow("Invalid agent authorization");
  vi.stubEnv("PATCHSMITH_AGENT_TOKEN", "bad-token");
  expect(getAgentAuth).toThrow("Invalid agent authorization");
});

it("retains actionable platform authentication errors", async () => {
  vi.stubEnv("PATCHSMITH_AGENT_TOKEN", await token());
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      { code: "UNAUTHORIZED", message: "Agent authorization revoked." },
      { status: 401 }
    )
  );
  const agent = requireValue(getAgentAuth());
  await expect(
    createCliClient({
      token: agent.token,
      url: "http://localhost:1",
    }).deployments.publish({
      deploymentId: "deployment-one",
    })
  ).rejects.toMatchObject({
    code: "UNAUTHORIZED",
    message: "Agent authorization revoked.",
  });
});

it("requires an app ID for direct agent lookups rather than guessing the host's slug prefix", async () => {
  const jwt = await token();
  vi.stubEnv("PATCHSMITH_AGENT_TOKEN", jwt);
  const requests: Request[] = [];

  const client = createCliClient({
    fetch: asyncFixture((input, init) => {
      requests.push(
        input instanceof Request ? input : new Request(input, init)
      );

      return Response.json({ id: "app-one" });
    }),
    token: jwt,
    url: "https://host.test/api/patchsmith",
  });

  await expect(client.apps.get({ slug: "@stripe" })).rejects.toThrow(
    "Use an app ID"
  );
  expect(requests).toHaveLength(0);
  await expect(client.apps.get({ appId: "app-one" })).resolves.toMatchObject({
    id: "app-one",
  });
  await expect(requests[0]?.json()).resolves.toEqual({
    app: { shortId: "app-one" },
    scopes: [scope],
  });
});

it.each([
  "https://platform.test/api/platform",
  "http://localhost/api/platform",
  "http://127.0.0.1/api/platform",
  "http://[::1]/api/platform",
])("allows secure or loopback destinations: %s", async (platformUrl) => {
  vi.stubEnv("PATCHSMITH_AGENT_TOKEN", await token({ platformUrl }));
  expect(requireValue(getAgentAuth()).platformUrl).toBe(platformUrl);
});

it("rejects insecure routing before creating a client or sending requests", async () => {
  vi.stubEnv(
    "PATCHSMITH_AGENT_TOKEN",
    await token({ platformUrl: "http://platform.test/api/platform" })
  );
  const fetch = vi.spyOn(globalThis, "fetch");
  expect(() =>
    createCliClient({ token: "stored-token", url: "http://localhost:1" })
  ).toThrow("Invalid agent authorization");
  expect(fetch).not.toHaveBeenCalled();
});

it("routes every authenticated CLI surface through existing platform endpoints for JWTs", async () => {
  const jwt = await token();
  vi.stubEnv("PATCHSMITH_AGENT_TOKEN", jwt);

  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
    asyncFixture((input) => {
      const request = requireRequest(input);
      expect(request.headers.get("authorization")).toBe(`Bearer ${jwt}`);
      expect(request.redirect).toBe("error");

      if (request.url.endsWith("/app-agent/chat")) {
        return new Response(
          'data: {"type":"start","messageId":"one"}\n\ndata: {"type":"finish"}\n\ndata: {"type":"data-run-complete","data":{"runId":"wrun_test"},"transient":true}\n\n',
          { headers: { "content-type": "text/event-stream" } }
        );
      }

      return Response.json({ scope });
    })
  );

  const client = createCliClient({
    token: "stored-session",
    url: "http://localhost:1",
  });

  await client.cliAuth.verifyToken({});
  await client.apps.list({ page: 1, pageSize: 100 });
  await client.apps.create({ description: null, name: "App" });
  const chunks = [];

  for await (const chunk of await client.appAgent.chat({
    appId: "app-one",
    hostUrl: "http://localhost:1",
    messages: [
      { id: "user", parts: [{ text: "Build", type: "text" }], role: "user" },
    ],
    schema: {},
    type: "turn",
  })) {
    chunks.push(chunk);
  }

  expect(chunks).toEqual([
    { messageId: "one", type: "start" },
    { type: "finish" },
    {
      data: { runId: "wrun_test" },
      transient: true,
      type: "data-run-complete",
    },
  ]);

  expect(fetch.mock.calls.map(([input]) => requireRequest(input).url)).toEqual([
    "https://platform.test/api/platform/cli-auth/verify-token",
    "https://platform.test/api/platform/apps/list",
    "https://platform.test/api/platform/apps",
    "https://platform.test/api/platform/app-agent/chat",
  ]);
  fetch.mockClear();
  await expect(client.apps.list({ scopes: ["other"] })).rejects.toThrow(
    "Requested scope"
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("discovers file authorization for all commands, with environment-token precedence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-agent-auth-"));

  try {
    const jwt = await token();
    const file = path.join(root, "token");
    await writeFile(file, jwt, { mode: 0o600 });
    vi.stubEnv("PATCHSMITH_AGENT_TOKEN_FILE", file);
    expect(requireValue(getAgentAuth()).token).toBe(jwt);

    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ scope }));

    await createCliClient({
      token: "stored-session",
      url: "http://localhost:1",
    }).cliAuth.verifyToken({});
    expect(
      requireRequest(requireValue(fetch.mock.lastCall)[0]).headers.get(
        "authorization"
      )
    ).toBe(`Bearer ${jwt}`);
    vi.stubEnv("PATCHSMITH_AGENT_TOKEN", "");
    expect(getAgentAuth).toThrow("Invalid agent authorization");
    // oxlint-disable-next-line unicorn/no-useless-undefined -- Vitest requires the environment value argument.
    vi.stubEnv("PATCHSMITH_AGENT_TOKEN", undefined);
    vi.stubEnv("PATCHSMITH_AGENT_TOKEN_FILE", path.join(root, "missing"));
    expect(getAgentAuth).toThrow("Unable to read agent authorization file");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
