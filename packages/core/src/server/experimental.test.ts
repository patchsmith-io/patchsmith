import { createClient } from "@patchsmith/client-platform/client/client/index";
import { expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { defineContract } from "#schema/contract";

import { createServer } from "./contract";
import { createExperimental } from "./experimental";

const contract = defineContract({
  scopes: {
    day: z
      .object({ at: z.date() })
      .transform(({ at }) => ({ at: at.toISOString() })),
    org: z
      .object({ tenant: z.string().min(1) })
      .transform(({ tenant }) => ({ tenant: tenant.trim() })),
  },
});

it("installs from the public server API with host credentials and validated scope output", async () => {
  const installed = {
    id: "installation",
    scope: { name: "org", value: { tenant: "workspace" } },
    shortId: "installed001",
  };

  const platformFetch = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(installed))
    .mockResolvedValueOnce(Response.json(installed));

  const requests = () =>
    platformFetch.mock.calls.map(([input, init]) =>
      input instanceof Request ? input : new Request(input, init)
    );

  const patchsmith = createServer({
    $internal: {
      platformBaseUrl: "https://platform.test/api/platform",
      platformFetch,
    },
    baseUrl: "https://host.test/api/patchsmith",
    contract,
    projectKey: "project-secret",
  });

  await expect(
    patchsmith.experimental.installApp({
      appId: "published001",
      scope: { name: "org", value: { tenant: "  workspace  " } },
      subjectId: "user_1",
    })
  ).resolves.toEqual(installed);
  expect(platformFetch).toHaveBeenCalledOnce();
  const [request] = requests();

  if (!request) {
    throw new Error("Expected installation request");
  }

  expect(request.url).toBe("https://platform.test/api/platform/apps/install");
  expect(request.method).toBe("POST");
  expect(request.headers.get("authorization")).toBe("Bearer project-secret");
  expect(await request.json()).toEqual({
    app: { shortId: "published001" },
    scope: installed.scope,
    subjectId: "user_1",
    toolUrl: "https://host.test/api/patchsmith/tools/execute",
  });

  await patchsmith.experimental.installApp({
    appId: "published001",
    scope: { name: "day", value: { at: new Date("2026-10-16T00:00:00.000Z") } },
    subjectId: "user_2",
  });
  expect(await requests().at(-1)?.json()).toEqual({
    app: { shortId: "published001" },
    scope: { name: "day", value: { at: "2026-10-16T00:00:00.000Z" } },
    subjectId: "user_2",
    toolUrl: "https://host.test/api/patchsmith/tools/execute",
  });
});

it("rejects invalid or undeclared scopes before sending a platform request", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json({}));

  const experimental = createExperimental({
    platform: createClient({
      fetch,
    }),
    platformHeaders: { authorization: "Bearer secret" },
    scopeSchemas: contract.scopes,
    toolUrl: "https://host.test/api/patchsmith/tools/execute",
  });

  await expect(
    experimental.installApp({
      appId: "app",
      scope: { name: "org", value: { tenant: "" } },
      subjectId: "user_1",
    })
  ).rejects.toThrow("Standard Schema");
  await expect(
    experimental.installApp({
      appId: "app",
      scope: { name: "missing", value: { tenant: "workspace" } },
      subjectId: "user_1",
    })
  ).rejects.toThrow("undeclared scope");
  await expect(
    experimental.installApp({
      appId: "",
      scope: { name: "org", value: { tenant: "workspace" } },
      subjectId: "user_1",
    })
  ).rejects.toThrow("app ID");
  expect(fetch).not.toHaveBeenCalled();
});

it("requires host credentials and propagates platform installation errors", async () => {
  const server = createServer({
    $internal: {
      platformFetch: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json(
            { code: "NOT_FOUND", message: "No published app" },
            { status: 404 }
          )
        ),
    },
    baseUrl: "https://host.test/api/patchsmith",
    contract,
  });

  const input = {
    appId: "app",
    scope: { name: "org" as const, value: { tenant: "workspace" } },
    subjectId: "user_1",
  };

  await expect(server.experimental.installApp(input)).rejects.toThrow(
    "projectKey"
  );

  const authorized = createServer({
    $internal: {
      platformFetch: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json(
            { code: "NOT_FOUND", message: "No published app" },
            { status: 404 }
          )
        ),
    },
    baseUrl: "https://host.test/api/patchsmith",
    contract,
    projectKey: "secret",
  });

  await expect(authorized.experimental.installApp(input)).rejects.toMatchObject(
    { code: "NOT_FOUND" }
  );
});

it.each(["", "u".repeat(257)])(
  "rejects an invalid installer subject before sending a platform request: %j",
  async (subjectId) => {
    const platformFetch = vi.fn<typeof fetch>();

    const server = createServer({
      $internal: { platformFetch },
      baseUrl: "https://host.test/api/patchsmith",
      contract,
      projectKey: "secret",
    });

    await expect(
      server.experimental.installApp({
        appId: "published001",
        scope: { name: "org", value: { tenant: "workspace" } },
        subjectId,
      })
    ).rejects.toThrow();
    expect(platformFetch).not.toHaveBeenCalled();
  }
);
