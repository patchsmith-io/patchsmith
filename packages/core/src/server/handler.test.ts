import { asyncFixture } from "@patchsmith/config/testing";
import type { Mock } from "vite-plus/test";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { createPatchsmithClient } from "./client";
import { createPatchsmithServer } from "./handler";

const platformRequests = (request: Mock<typeof fetch>): Request[] =>
  request.mock.calls.map(([input, init]) =>
    input instanceof Request ? input : new Request(input, init)
  );

const testScopeSchema = z.record(z.string(), z.string().min(1));

const tailor = createPatchsmithServer({
  baseUrl: "https://example.com/api/patchsmith",
  components: {},
  scopes: { org: testScopeSchema },
});

const optionalSchemaTailor = tailor;

const authenticateImplementation2Implementation = () => ({
  scopes: { org: { tenant: "workspace" } },
  subjectId: "user",
});

const authenticateImplementationImplementation = () => ({
  scopes: {
    org: { tenant: "org" },
    userOrg: { tenant: "user_org" },
  },
  subjectId: "user",
});

const requestImplementationImplementation = (origin: string) =>
  new Request("http://internal:3000/custom/patchsmith/backend/session", {
    body: JSON.stringify({ appId: "app" }),
    headers: {
      "content-type": "application/json",
      origin,
      "x-forwarded-host": "attacker.test",
      "x-forwarded-proto": "https",
    },
    method: "POST",
  });

describe("createPatchsmithServer", () => {
  it.each([undefined, null, "", 123, "x".repeat(257)])(
    "rejects authenticated host contexts without a valid subject: %j",
    async (subjectId) => {
      const platformFetch = vi.fn<typeof fetch>();

      const server = createPatchsmithServer({
        $internal: { platformFetch },
        baseUrl: "https://host.test/api/patchsmith",
        components: {},
        projectKey: "project-key",
        scopes: { org: testScopeSchema },
      });

      await expect(
        server.handler(
          new Request("https://host.test/api/patchsmith/backend/session", {
            body: JSON.stringify({ appId: "app" }),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
          {
            authenticate: () => ({
              scopes: { org: { tenant: "verified" } },
              // @ts-expect-error Exercise host integrations supplying invalid runtime authentication data.
              subjectId,
            }),
          }
        )
      ).rejects.toThrow("Invalid authenticated subject");
      expect(platformFetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["GET", "preview/metadata?sessionId=removed"],
    ["GET", `preview/${"a".repeat(43)}`],
    ["POST", `preview/${"a".repeat(43)}`],
    ["POST", "preview/start"],
  ])("returns 404 for removed %s %s routes", async (method, path) => {
    const response = await tailor.handler(
      new Request(`https://example.com/api/patchsmith/${path}`, { method }),
      { authenticate: authenticateImplementation2Implementation }
    );

    expect(response.status).toBe(404);
  });

  it("requests app backend tokens from the platform with host credentials and verified scopes", async () => {
    const session = {
      expiresAt: 123,
      identity: {
        appId: "app",
        deploymentId: "deployment",
        expiresAt: 123,
        installationId: "app",
        projectId: "project",
        scope: { name: "org", value: { tenant: "verified" } },
        subjectId: "user",
        toolUrl: "https://host.test/api/patchsmith/tools/execute",
      },
      token: "platform-token",
      url: "https://runtime.test/rpc",
    };

    const platformFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session));

    const server = createPatchsmithServer({
      $internal: {
        platformFetch,
      },
      baseUrl: "https://host.test/api/patchsmith",
      components: {},
      projectKey: "project-key",
      scopes: { org: testScopeSchema },
    });

    const response = await server.handler(
      new Request("https://host.test/api/patchsmith/backend/session", {
        body: JSON.stringify({ appId: "app" }),
        headers: {
          "content-type": "application/json",
          origin: "https://host.test",
        },
        method: "POST",
      }),
      {
        authenticate: () => ({
          scopes: { org: { tenant: "verified" } },
          subjectId: "user",
        }),
      }
    );

    expect(await response.json()).toEqual(session);
    const [issuedRequest] = platformRequests(platformFetch);

    if (!issuedRequest) {
      throw new Error("Expected a platform token request");
    }

    expect(issuedRequest.url).toBe(
      "https://patchsmith.io/api/platform/apps/runtime/session"
    );
    expect(issuedRequest.headers.get("authorization")).toBe(
      "Bearer project-key"
    );
    expect(await issuedRequest.json()).toEqual({
      app: { shortId: "app" },
      scopes: [{ name: "org", value: { tenant: "verified" } }],
      subjectId: "user",
      toolUrl: "https://host.test/api/patchsmith/tools/execute",
    });
  });

  const requestImplementation = requestImplementationImplementation;

  it("issues the public tool destination and checks the browser origin behind a proxy", async () => {
    const platformFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        expiresAt: 123,
        token: "platform-token",
        url: "https://runtime.test/rpc",
      })
    );

    const server = createPatchsmithServer({
      $internal: {
        platformFetch,
      },
      baseUrl: "https://host.test/custom/patchsmith/",
      components: {},
      projectKey: "project-key",
      scopes: { org: testScopeSchema },
    });

    const request = requestImplementation;

    const authentication = {
      authenticate: () => ({
        scopes: { org: { tenant: "verified" } },
        subjectId: "user",
      }),
    };

    const awaitedResult1 = await server.handler(
      request("https://host.test"),
      authentication
    );

    expect(awaitedResult1.status).toBe(200);
    expect(await platformRequests(platformFetch)[0]?.json()).toMatchObject({
      toolUrl: "https://host.test/custom/patchsmith/tools/execute",
    });

    const awaitedResult2 = await server.handler(
      request("https://attacker.test"),
      authentication
    );

    expect(awaitedResult2.status).toBe(400);

    const awaitedResult3 = await server.handler(
      request("http://internal:3000"),
      authentication
    );

    expect(awaitedResult3.status).toBe(400);
    expect(platformRequests(platformFetch)).toHaveLength(1);
  });

  it.each([
    {
      baseUrl: "http://localhost:3000/api/patchsmith",
      origin: "http://localhost:3000",
      prefix: "/api/patchsmith",
    },
    {
      baseUrl: "https://public.test/custom/routes///",
      origin: "https://public.test",
      prefix: "/custom/routes",
    },
    {
      baseUrl: new URL("https://public.test:8443/custom/routes/"),
      origin: "https://public.test:8443",
      prefix: "/custom/routes",
    },
    {
      baseUrl: "https://public.test/",
      origin: "https://public.test",
      prefix: "",
    },
  ])(
    "routes and issues sessions from baseUrl=$baseUrl",
    async ({ baseUrl, prefix, origin }) => {
      const bodies: unknown[] = [];

      const server = createPatchsmithServer({
        $internal: {
          platformFetch: async (input, init) => {
            bodies.push(
              await (
                input instanceof Request ? input : new Request(input, init)
              ).json()
            );

            return Response.json({
              expiresAt: 123,
              token: "token",
              url: "https://runtime.test/rpc",
            });
          },
        },
        baseUrl,
        components: {},
        scopes: { org: testScopeSchema },
      });

      const authentication = {
        authenticate: () => ({
          scopes: { org: { tenant: "verified" } },
          subjectId: "user",
        }),
      };

      await Promise.all(
        ["schema", "meta"].map(async (route) => {
          const awaitedResult4 = await server.handler(
            new Request(`https://request.test${prefix}/${route}`),
            authentication
          );

          expect(awaitedResult4.status).toBe(200);
        })
      );

      const response = await server.handler(
        new Request(`https://request.test${prefix}/backend/session`, {
          body: JSON.stringify({ appId: "app" }),
          headers: { "content-type": "application/json", origin },
          method: "POST",
        }),
        authentication
      );

      expect(response.status).toBe(200);
      expect(bodies).toEqual([
        {
          app: { shortId: "app" },
          scopes: [{ name: "org", value: { tenant: "verified" } }],
          subjectId: "user",
          toolUrl: `${origin + prefix}/tools/execute`,
        },
      ]);
    }
  );

  it.each([
    undefined,
    null,
    "",
    "/",
    "/api/patchsmith",
    "https:host.test/api",
    "https:/host.test/api",
    "https:///host.test/api",
    "//attacker.test/api",
    "api/relative",
    "ftp://host.test/api",
    "https://user:password@host.test/api",
    "/api?query=1",
    "https://host.test/api#fragment",
    "/api\\path",
    " /api",
  ])("rejects an ambiguous or invalid baseUrl=%s", (baseUrl) => {
    // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
    expect(() =>
      createPatchsmithServer({
        // oxlint-disable-next-line typescript/no-non-null-assertion -- Parameterized negative cases deliberately pass invalid inputs through the public API.
        baseUrl: baseUrl!,
        components: {},
        scopes: { org: testScopeSchema },
      })
    ).toThrow();
  });

  it("returns platform scope denials without issuing a backend session", async () => {
    const platformFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { code: "NOT_FOUND", message: "Not found" },
          { status: 404 }
        )
      );

    const server = createPatchsmithServer({
      $internal: {
        platformFetch,
      },
      baseUrl: "https://host.test/api/patchsmith",
      components: {},
      projectKey: "project-key",
      scopes: { org: testScopeSchema },
    });

    const response = await server.handler(
      new Request("https://host.test/api/patchsmith/backend/session", {
        body: JSON.stringify({ appId: "not-in-scope" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {
        authenticate: () => ({
          scopes: { org: { tenant: "verified" } },
          subjectId: "user",
        }),
      }
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(platformRequests(platformFetch)).toHaveLength(1);
  });

  const authenticateImplementation = authenticateImplementationImplementation;

  it.each([
    { names: ["org", "userOrg"], query: "" },
    { names: ["userOrg"], query: "?scopes=userOrg" },
    { names: ["userOrg"], query: "?scopes=userOrg&scopes=userOrg" },
    { names: ["userOrg", "org"], query: "?scopes=userOrg&scopes=org" },
  ])(
    "selects authenticated scopes for host app reads: $query",
    async ({ query, names }) => {
      const platformBodies: unknown[] = [];

      const server = createPatchsmithServer({
        $internal: {
          platformFetch: async (input, init) => {
            const request =
              input instanceof Request ? input : new Request(input, init);

            platformBodies.push(await request.json());

            return Response.json({
              items: [],
              pagination: { hasMore: false, page: 1, pageSize: 100 },
            });
          },
        },
        baseUrl: "https://example.com/api/patchsmith",
        components: {},
        scopes: { org: testScopeSchema, userOrg: testScopeSchema },
      });

      const authenticate = authenticateImplementation;

      const response = await server.handler(
        new Request(`https://example.com/api/patchsmith/apps${query}`),
        { authenticate }
      );

      expect(response.status).toBe(200);
      expect(platformBodies).toEqual([
        {
          page: 1,
          pageSize: 100,
          scopes: names.map((name) => ({
            name,
            value: { tenant: name === "org" ? "org" : "user_org" },
          })),
        },
      ]);

      const invalid = await server.handler(
        new Request("https://example.com/api/patchsmith/apps?scopes=missing"),
        { authenticate }
      );

      expect(invalid.status).toBe(400);
      expect(platformBodies).toHaveLength(1);
    }
  );

  const authenticateImplementation2 = authenticateImplementation2Implementation;

  it("treats scopes= as an empty app selection", async () => {
    const platformFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [] }));

    const server = createPatchsmithServer({
      $internal: {
        platformFetch,
      },
      baseUrl: "https://example.com/api/patchsmith",
      components: {},
      scopes: { org: testScopeSchema },
    });

    const authenticate = authenticateImplementation2;

    const apps = await server.handler(
      new Request("https://example.com/api/patchsmith/apps?scopes="),
      { authenticate }
    );

    expect(apps.status).toBe(200);
    await expect(apps.json()).resolves.toEqual([]);

    expect(platformFetch).not.toHaveBeenCalled();
  });

  it("preserves hosted bundle URLs", async () => {
    const app = {
      clientPath:
        "https://abc123def4.tailorkit.app/p/22222222-2222-4222-8222-222222222222/a/33333333-3333-4333-8333-333333333333/d/44444444-4444-4444-8444-444444444444/client.js",
      id: "app",
    };

    const server = createPatchsmithServer({
      $internal: {
        platformFetch: vi.fn<typeof fetch>().mockResolvedValueOnce(
          Response.json({
            items: [app],
            pagination: { hasMore: false, page: 1, pageSize: 100 },
          })
        ),
      },
      baseUrl: "https://example.com/api/patchsmith",
      components: {},
      projectKey: "server-only-key",
      scopes: { org: testScopeSchema },
    });

    const response = await server.handler(
      new Request("https://host.test/api/patchsmith/apps"),
      {
        authenticate: () => ({
          scopes: { org: { tenant: "workspace" } },
          subjectId: "user",
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([app]);
  });
  it("serves the serialized schema from the handler", async () => {
    const response = await optionalSchemaTailor.handler(
      new Request("https://example.com/api/patchsmith/schema"),
      {
        authenticate: () => ({
          scopes: { org: { tenant: "test" } },
          subjectId: "user",
        }),
      }
    );

    await expect(response.json()).resolves.toMatchObject({
      components: {},
      tools: {},
      version: 1,
    });
  });

  it("serves a built-in CLI auth approval page", async () => {
    const response = await optionalSchemaTailor.handler(
      new Request(
        "https://example.com/api/patchsmith/cli-auth/approve?code=ABC-123-XYZ"
      ),
      {
        authenticate: () => ({
          scopes: { org: { tenant: "test" } },
          subjectId: "user",
        }),
      }
    );

    const html = await response.text();
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Approve CLI login");
    expect(html).toContain('value="ABC-123-XYZ"');
    expect(html).toContain("prefers-color-scheme: dark");
  });

  it("redirects unauthenticated CLI approvals to the host sign-in page", async () => {
    const server = createPatchsmithServer({
      baseUrl: "https://example.com/api/patchsmith",
      cliAuth: { signInPath: "/admin/sign-in?source=patchsmith" },
      components: {},
      scopes: { org: testScopeSchema },
    });

    const response = await server.handler(
      new Request(
        "https://example.com/api/patchsmith/cli-auth/approve?code=ABC-123-XYZ"
      ),
      { authenticate: () => null }
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("location")).toBe(
      "https://example.com/admin/sign-in?source=patchsmith&returnTo=%2Fapi%2Fpatchsmith%2Fcli-auth%2Fapprove%3Fcode%3DABC-123-XYZ"
    );
  });

  it("renders configured CLI approvals for authenticated users", async () => {
    const server = createPatchsmithServer({
      baseUrl: "https://example.com/api/patchsmith",
      cliAuth: { signInPath: "/admin/sign-in" },
      components: {},
      scopes: { org: testScopeSchema, userOrg: testScopeSchema },
    });

    const response = await server.handler(
      new Request(
        "https://example.com/api/patchsmith/cli-auth/approve?code=ABC-123-XYZ"
      ),
      {
        authenticate: () => ({
          scopes: { org: { tenant: "test" }, userOrg: { tenant: "user" } },
          subjectId: "user",
        }),
      }
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Approve CLI login");
    expect(html).toContain('<form method="post">');
    expect(html).toContain('name="scope" required');
    expect(html).not.toContain('<form method="post" novalidate>');
  });

  it("preserves the scope selection when a CLI approval code is missing", async () => {
    const server = createPatchsmithServer({
      baseUrl: "https://example.com/api/patchsmith",
      components: {},
      scopes: { org: testScopeSchema, userOrg: testScopeSchema },
    });

    const response = await server.handler(
      new Request("https://example.com/api/patchsmith/cli-auth/approve", {
        body: new URLSearchParams({
          intent: "approve",
          scope: "userOrg",
          userCode: "",
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      }),
      {
        authenticate: () => ({
          scopes: { org: { tenant: "test" }, userOrg: { tenant: "user" } },
          subjectId: "user",
        }),
      }
    );

    const html = await response.text();
    expect(html).toContain("Enter the code shown in your terminal.");
    expect(html).toContain('<option value="org">org</option>');
    expect(html).toContain('<option value="userOrg" selected>userOrg</option>');
  });

  it("rejects cross-origin CLI sign-in redirects", async () => {
    const server = createPatchsmithServer({
      baseUrl: "https://example.com/api/patchsmith",
      cliAuth: { signInPath: "//evil.example/sign-in" },
      components: {},
      scopes: { org: testScopeSchema },
    });

    await expect(
      server.handler(
        new Request(
          "https://example.com/api/patchsmith/cli-auth/approve?code=ABC-123-XYZ"
        ),
        { authenticate: () => null }
      )
    ).rejects.toThrow(
      "Patchsmith cliAuth.signInPath must be a same-origin path."
    );
  });

  it("rejects host scopes that fail Standard Schema validation before platform access", async () => {
    const server = createPatchsmithServer({
      baseUrl: "https://example.com/api/patchsmith",
      cliAuth: { signInPath: "/sign-in" },
      components: {},
      scopes: { org: z.object({ orgId: z.string().min(1) }) },
    });

    await expect(
      server.handler(
        new Request(
          "https://example.com/api/patchsmith/cli-auth/approve?code=ABC-123-XYZ"
        ),
        {
          authenticate: () => ({
            scopes: { org: { orgId: "" } },
            subjectId: "user",
          }),
        }
      )
    ).rejects.toThrow(/failed its Standard Schema validation/u);
  });

  it("approves CLI auth from the built-in approval page", async () => {
    const platformFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "cli_auth_session_1" }));

    const server = createPatchsmithServer({
      $internal: {
        platformBaseUrl: "http://localhost:3000/api/platform",
        platformFetch,
        platformHeaders: { authorization: "Bearer host-token" },
      },
      baseUrl: "https://example.com/api/patchsmith",
      components: {},
      scopes: { org: testScopeSchema },
    });

    const body = new URLSearchParams({
      intent: "approve",
      userCode: "ABC-123-XYZ",
    });

    const response = await server.handler(
      new Request("https://example.com/api/patchsmith/cli-auth/approve", {
        body,
        method: "POST",
      }),
      {
        authenticate: () => ({
          scopes: { org: { orgId: "org_1" } },
          subjectId: "user",
        }),
      }
    );

    const html = await response.text();
    expect(html).toContain("CLI login approved");
    expect(platformRequests(platformFetch)[0]?.url).toBe(
      "http://localhost:3000/api/platform/cli-auth/approve"
    );
    expect(
      platformRequests(platformFetch)[0]?.headers.get("authorization")
    ).toBe("Bearer host-token");
    await expect(platformRequests(platformFetch)[0]?.json()).resolves.toEqual({
      scope: { name: "org", value: { orgId: "org_1" } },
      userCode: "ABC-123-XYZ",
    });
  });

  it("uses projectKey as the default platform authorization header", async () => {
    const platformFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "cli_auth_session_1" }));

    const server = createPatchsmithServer({
      $internal: {
        platformBaseUrl: "http://localhost:3000/api/platform",
        platformFetch,
      },
      baseUrl: "https://example.com/api/patchsmith",
      components: {},
      projectKey: "project-key",
      scopes: { org: testScopeSchema },
    });

    const body = new URLSearchParams({
      intent: "approve",
      userCode: "ABC-123-XYZ",
    });

    await server.handler(
      new Request("https://example.com/api/patchsmith/cli-auth/approve", {
        body,
        method: "POST",
      }),
      {
        authenticate: () => ({
          scopes: { org: { orgId: "org_1" } },
          subjectId: "user",
        }),
      }
    );

    expect(
      platformRequests(platformFetch)[0]?.headers.get("authorization")
    ).toBe("Bearer project-key");
  });

  it("surfaces rejected project keys during CLI auth start", async () => {
    const server = createPatchsmithServer({
      $internal: {
        platformBaseUrl: "http://localhost:3000/api/platform",
        platformFetch: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 })),
      },
      baseUrl: "https://example.com/api/patchsmith",
      components: {},
      projectKey: "invalid-project-key",
      scopes: { org: testScopeSchema },
    });

    const client = createPatchsmithClient({
      fetch: async (request, init) => {
        const hostRequest =
          request instanceof Request ? request : new Request(request, init);

        return await server.handler(hostRequest, {
          authenticate: () => ({
            scopes: { org: { orgId: "org_1" } },
            subjectId: "user",
          }),
        });
      },
      url: "https://example.com/api/patchsmith",
    });

    await expect(client.cliAuth.start({})).rejects.toThrow(
      "Patchsmith platform rejected the host project key. Check PATCHSMITH_PROJECT_KEY."
    );
  });

  it.each([
    { code: "UNAUTHORIZED", message: "Invalid CLI deploy token.", status: 401 },
    { code: "FORBIDDEN", message: "Forbidden", status: 403 },
    {
      code: "SERVICE_UNAVAILABLE",
      message: "Service unavailable",
      status: 503,
    },
  ])(
    "preserves platform $code during CLI token verification",
    async ({ code, message, status }) => {
      const server = createPatchsmithServer({
        $internal: {
          platformFetch: vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
              Response.json({ code, defined: false, message }, { status })
            ),
        },
        baseUrl: "https://example.com/api/patchsmith",
        components: {},
        projectKey: "host-project-key",
        scopes: { org: testScopeSchema },
      });

      const client = createPatchsmithClient({
        fetch: async (request, init) => {
          const response = await server.handler(
            request instanceof Request ? request : new Request(request, init),
            {
              authenticate: () => {
                throw new Error("CLI verification must use the deploy token.");
              },
            }
          );

          expect(response.status).toBe(status);

          return response;
        },
        headers: { authorization: "Bearer expired-cli-token" },
        url: "https://example.com/api/patchsmith",
      });

      await expect(client.cliAuth.verifyToken({})).rejects.toMatchObject({
        code,
        message,
      });
    }
  );

  it("calls the platform client with authorization headers", async () => {
    const requests: Request[] = [];
    const hostRequests: Request[] = [];

    const server = createPatchsmithServer({
      $internal: {
        platformBaseUrl: "http://localhost:3000/api/platform",
        platformFetch: asyncFixture((request, init) => {
          const platformRequest =
            request instanceof Request ? request : new Request(request, init);

          requests.push(platformRequest);

          if (platformRequest.url.endsWith("/cli-auth/verify-token")) {
            return Response.json({
              scope: { name: "org", value: { orgId: "org_1" } },
            });
          }

          return Response.json({
            items: [],
            pagination: { hasMore: false, page: 1, pageSize: 20 },
          });
        }),
        platformHeaders: { authorization: "Bearer host-token" },
      },
      baseUrl: "https://example.com/api/patchsmith",
      components: {},
      scopes: { org: testScopeSchema },
    });

    const client = createPatchsmithClient({
      fetch: async (request, init) => {
        const hostRequest =
          request instanceof Request
            ? new Request(request, {
                headers: { authorization: "Bearer host-token" },
              })
            : new Request(request, {
                ...init,
                headers: new Headers([
                  ...new Headers(init?.headers).entries(),
                  ["authorization", "Bearer host-token"],
                ]),
              });

        hostRequests.push(hostRequest);

        return await server.handler(hostRequest, {
          authenticate: () => {
            throw new Error(
              "Host authentication should not run for deploy-token routes."
            );
          },
        });
      },
      url: "https://example.com/api/patchsmith",
    });

    await expect(client.cliAuth.verifyToken({})).resolves.toEqual({
      scope: { name: "org", value: { orgId: "org_1" } },
    });
    await expect(client.apps.list({ page: 1 })).resolves.toEqual({
      items: [],
      pagination: { hasMore: false, page: 1, pageSize: 20 },
    });
    expect(hostRequests[0]?.method).toBe("POST");
    expect(requests[0]?.url).toBe(
      "http://localhost:3000/api/platform/cli-auth/verify-token"
    );
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer host-token");
    expect(requests[1]?.url).toBe(
      "http://localhost:3000/api/platform/cli-auth/verify-token"
    );
    expect(requests[2]?.url).toBe(
      "http://localhost:3000/api/platform/apps/list"
    );
    expect(requests[2]?.headers.get("authorization")).toBe("Bearer host-token");
  });

  it("validates host app mutations and attaches the CLI deploy token scope", async () => {
    const requests: Request[] = [];
    const hostRequests: Request[] = [];

    const server = createPatchsmithServer({
      $internal: {
        platformBaseUrl: "http://localhost:3000/api/platform",
        platformFetch: asyncFixture((request, init) => {
          const platformRequest =
            request instanceof Request ? request : new Request(request, init);

          requests.push(platformRequest);

          if (platformRequest.url.endsWith("/cli-auth/verify-token")) {
            return Response.json({
              scope: { name: "org", value: { orgId: "org_1" } },
            });
          }

          return Response.json({ id: "app_1" });
        }),
        platformHeaders: { authorization: "Bearer host-token" },
      },
      baseUrl: "https://example.com/api/patchsmith",
      components: {},
      scopes: { org: testScopeSchema },
    });

    const client = createPatchsmithClient({
      fetch: async (request, init) => {
        const hostRequest =
          request instanceof Request
            ? new Request(request, {
                headers: { authorization: "Bearer cli-token" },
              })
            : new Request(request, {
                ...init,
                headers: new Headers([
                  ...new Headers(init?.headers).entries(),
                  ["authorization", "Bearer cli-token"],
                ]),
              });

        hostRequests.push(hostRequest);

        return await server.handler(hostRequest, {
          authenticate: () => {
            throw new Error(
              "Host authentication should not run for deploy-token routes."
            );
          },
        });
      },
      url: "https://example.com/api/patchsmith",
    });

    await expect(
      client.apps.create({
        description: null,
        name: "Calendar",
      })
    ).resolves.toEqual({
      id: "app_1",
    });

    const untrustedInput = {
      createdByAgent: true,
      description: null,
      name: "Forged AI app",
    };

    await expect(client.apps.create(untrustedInput)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(
      requests.filter((request) => request.url.endsWith("/apps"))
    ).toHaveLength(1);
    expect(hostRequests[0]?.method).toBe("POST");
    await expect(requests[1]?.json()).resolves.toEqual({
      description: null,
      name: "Calendar",
      scope: { name: "org", value: { orgId: "org_1" } },
    });
    const updateInput = { appId: "app_1", description: null, name: "Renamed" };
    const slugChange = { ...updateInput, slug: "changed" };
    await expect(client.apps.update(slugChange)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const unknownField = { ...updateInput, unexpected: true };
    await expect(client.apps.update(unknownField)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(
      requests.filter((request) => request.url.endsWith("/apps/update"))
    ).toHaveLength(0);
    await expect(client.apps.update(updateInput)).resolves.toEqual({
      id: "app_1",
    });
    expect(
      requests.filter((request) => request.url.endsWith("/apps/update"))
    ).toHaveLength(1);
  });

  it.each([true, false])(
    "returns AI provenance from app lookups: %s",
    async (createdByAgent) => {
      const server = createPatchsmithServer({
        $internal: {
          platformFetch: async (input, init) => {
            const request =
              input instanceof Request ? input : new Request(input, init);

            if (request.url.endsWith("/cli-auth/verify-token")) {
              return Response.json({
                scope: { name: "org", value: { orgId: "org_1" } },
              });
            }

            expect(request.url).toBe(
              "https://patchsmith.io/api/platform/apps/lookup"
            );
            expect(await request.json()).toEqual({
              app: { shortId: "app_1" },
              scopes: [{ name: "org", value: { orgId: "org_1" } }],
            });

            return Response.json({ createdByAgent, id: "app_1" });
          },
        },
        baseUrl: "https://example.com/api/patchsmith",
        components: {},
        scopes: { org: testScopeSchema },
      });

      const client = createPatchsmithClient({
        fetch: async (input, init) =>
          await server.handler(
            input instanceof Request ? input : new Request(input, init),
            {
              authenticate: () => {
                throw new Error(
                  "Host authentication should not run for deploy-token routes."
                );
              },
            }
          ),
        headers: { authorization: "Bearer cli-token" },
        url: "https://example.com/api/patchsmith",
      });

      await expect(client.apps.get({ appId: "app_1" })).resolves.toEqual({
        createdByAgent,
        id: "app_1",
      });
    }
  );

  it("preserves instance discovery when the CLI deploys through the host", async () => {
    const requests: Request[] = [];

    const server = createPatchsmithServer({
      $internal: {
        platformFetch: asyncFixture((input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init);

          requests.push(request);

          if (request.url.endsWith("/cli-auth/verify-token")) {
            return Response.json({
              scope: { name: "org", value: { orgId: "org_1" } },
            });
          }

          return Response.json({
            assets: [],
            deployment: { id: "deployment" },
          });
        }),
      },
      baseUrl: "https://example.com/api/patchsmith",
      components: {},
      scopes: { org: testScopeSchema },
    });

    const client = createPatchsmithClient({
      fetch: async (input, init) =>
        await server.handler(
          input instanceof Request ? input : new Request(input, init),
          {
            authenticate: () => {
              throw new Error("Expected CLI authentication");
            },
          }
        ),
      headers: { authorization: "Bearer cli-token" },
      url: "https://host.test/api/patchsmith",
    });

    const views = [
      {
        instances: true as const,
        path: "/",
        slot: "page",
        staticInstances: [
          {
            data: { section: "reports" },
            key: "reports",
            metadata: { label: "Reports" },
          },
        ],
      },
      {
        instances: true as const,
        path: "/empty",
        slot: "page",
        staticInstances: [],
      },
      { path: "/", slot: "panel" },
      { disabled: true as const, path: "/disabled", slot: "page" },
    ];

    const staticAssets = Array.from({ length: 256 }, (_, index) => ({
      checksum: "a".repeat(64),
      contentLength: 1,
      path: `asset-${index}.bin`,
    }));

    const input = {
      appId: "app",
      assets: [
        {
          checksum: "0".repeat(64),
          contentLength: 1,
          contentType: "application/javascript",
          encoding: "utf-8",
          objectKey: "client.js",
        },
      ],
      staticAssets,
      views,
    } satisfies Parameters<typeof client.deployments.create>[0];

    await client.deployments.create(input);
    await expect(requests[1]?.json()).resolves.toMatchObject({
      staticAssets,
      views,
    });
    await expect(
      client.deployments.create({
        ...input,
        staticAssets: [
          ...staticAssets,
          { checksum: "a".repeat(64), contentLength: 1, path: "extra.bin" },
        ],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      requests.filter((request) => request.url.endsWith("/deployments"))
    ).toHaveLength(1);
  });

  it("accepts a CLI token containing a transformed scope output", async () => {
    const platformBodies: unknown[] = [];

    const server = createPatchsmithServer({
      $internal: {
        platformFetch: async (input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init);

          if (request.url.endsWith("/cli-auth/verify-token")) {
            return Response.json({
              scope: { name: "org", value: { canonical: "org_1" } },
            });
          }

          platformBodies.push(await request.json());

          return Response.json({ id: "app_1" });
        },
      },
      baseUrl: "https://example.com/api/patchsmith",
      components: {},
      scopes: {
        org: z
          .object({ raw: z.string() })
          .transform(({ raw }) => ({ canonical: raw.trim() })),
      },
    });

    const client = createPatchsmithClient({
      fetch: async (input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init);

        request.headers.set("authorization", "Bearer cli-token");

        return await server.handler(request, { authenticate: () => null });
      },
      url: "https://example.com/api/patchsmith",
    });

    await expect(
      client.apps.create({ description: null, name: "Calendar" })
    ).resolves.toEqual({
      id: "app_1",
    });
    expect(platformBodies).toEqual([
      {
        description: null,
        name: "Calendar",
        scope: { name: "org", value: { canonical: "org_1" } },
      },
    ]);
  });
});
