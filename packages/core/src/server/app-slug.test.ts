import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { slugSelector, validateLocalSlugPrefix, withAppSlug } from "./app-slug";
import type { LocalSlugPrefix } from "./app-slug";
import { createPatchsmithClient } from "./client";
import { createPatchsmithServer } from "./handler";

const prefixes: LocalSlugPrefix[] = ["@", "~", "_"];

const prefixChanges = prefixes.flatMap((previous) =>
  prefixes.flatMap((current) => {
    if (current === previous) {
      return [];
    }

    return [{ current, previous }];
  })
);

const scope = { name: "org", value: { customerId: "123" } };

const localApp = {
  id: "local-app",
  isShared: false,
  name: "Stripe",
  slug: "stripe",
};

const sharedApp = {
  id: "shared-app",
  isShared: true,
  name: "Stripe",
  slug: "stripe",
};

const authenticateContext = () => ({
  scopes: { org: scope.value },
  subjectId: "viewer",
});

const fixture = (localSlugPrefix?: LocalSlugPrefix, lookupStatus = 200) => {
  const requests: Request[] = [];

  const server = createPatchsmithServer({
    $internal: {
      localSlugPrefix,
      platformBaseUrl: "https://platform.test",
      platformFetch: async (input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init);

        requests.push(request.clone());
        const path = new URL(request.url).pathname;

        if (path === "/cli-auth/verify-token") {
          return Response.json({ scope });
        }

        if (path === "/apps/list") {
          return Response.json({
            items: [sharedApp, localApp],
            pagination: { hasMore: false, page: 1, pageSize: 20 },
          });
        }

        if (path === "/apps/lookup") {
          if (lookupStatus !== 200) {
            return Response.json(
              {
                code: lookupStatus === 409 ? "CONFLICT" : "NOT_FOUND",
                message: "App lookup failed.",
              },
              { status: lookupStatus }
            );
          }

          const body = z
            .object({ app: z.object({ isShared: z.boolean().optional() }) })
            .parse(await request.json());

          return Response.json(
            body.app.isShared === false ? localApp : sharedApp
          );
        }

        return Response.json(localApp);
      },
    },
    baseUrl: "https://host.test/api/patchsmith",
    components: {},
    projectKey: "project-key",
    scopes: { org: z.object({ customerId: z.string() }) },
  });

  const client = createPatchsmithClient({
    fetch: async (input, init) =>
      await server.handler(new Request(input, init), {
        authenticate: authenticateContext,
      }),
    headers: { authorization: "Bearer deploy-token" },
    url: "https://host.test/api/patchsmith",
  });

  return { authenticate: authenticateContext, client, requests, server };
};

describe("local slug prefix helpers", () => {
  it("uses @ when no override is supplied", () => {
    expect(validateLocalSlugPrefix()).toBe("@");
    expect(withAppSlug(localApp)).toEqual({ ...localApp, slug: "@stripe" });
    expect(slugSelector("@stripe")).toEqual({
      isShared: false,
      slug: "stripe",
    });
    expect(slugSelector("stripe")).toEqual({ isShared: true, slug: "stripe" });
  });

  it.each(prefixes)("round-trips local slugs with %s", (prefix) => {
    expect(validateLocalSlugPrefix(prefix)).toBe(prefix);
    const formatted = withAppSlug(localApp, prefix);

    expect(formatted.slug).toBe(`${prefix}stripe`);
    expect(slugSelector(formatted.slug, prefix)).toEqual({
      isShared: false,
      slug: "stripe",
    });
    expect(withAppSlug(sharedApp, prefix)).toBe(sharedApp);
    expect(slugSelector(sharedApp.slug, prefix)).toEqual({
      isShared: true,
      slug: "stripe",
    });
    expect(localApp.slug).toBe("stripe");
  });

  it.each([
    "",
    "local",
    "local-",
    "custom:",
    "local@",
    "@local",
    "@@",
    "@~",
    "__",
    "~~",
    ".",
    ":",
    "!",
    "+",
    "/",
    "@/",
    "?",
    "#",
    "%40",
    "has space",
    "é",
    "@".repeat(33),
  ])("rejects unsupported prefix %j", (prefix) => {
    expect(() => validateLocalSlugPrefix(prefix)).toThrow(
      'localSlugPrefix must be "@", "~", or "_".'
    );
  });
});

describe("host app slug namespaces", () => {
  it.each(prefixes)(
    "formats and resolves local names with prefix %s without changing stored names",
    async (prefix) => {
      const { server, requests, client, authenticate } = fixture(prefix);

      const response = await server.handler(
        new Request("https://host.test/api/patchsmith/apps"),
        { authenticate }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        sharedApp,
        { ...localApp, slug: `${prefix}stripe` },
      ]);

      await expect(
        client.apps.get({ slug: `${prefix}stripe` })
      ).resolves.toMatchObject({ id: localApp.id, slug: `${prefix}stripe` });
      await expect(client.apps.get({ slug: "stripe" })).resolves.toMatchObject(
        sharedApp
      );

      const lookups = requests.filter((request) =>
        request.url.endsWith("/apps/lookup")
      );

      await expect(lookups[0]?.json()).resolves.toEqual({
        app: { isShared: false, slug: "stripe" },
        scopes: [scope],
      });
      await expect(lookups[1]?.json()).resolves.toEqual({
        app: { isShared: true, slug: "stripe" },
        scopes: [scope],
      });

      const browserUrl = new URL(
        "https://host.test/api/patchsmith/apps/lookup"
      );

      browserUrl.searchParams.set("slug", `${prefix}stripe`);
      browserUrl.searchParams.set("scopes", "org");

      const browserResponse = await server.handler(new Request(browserUrl), {
        authenticate,
      });

      expect(browserResponse.status).toBe(200);
      expect(await browserResponse.json()).toMatchObject({
        isShared: false,
        slug: `${prefix}stripe`,
      });
      expect(localApp.slug).toBe("stripe");
    }
  );

  it.each([undefined, ...prefixes])(
    "formats all app responses with prefix %s (default @)",
    async (configuredPrefix) => {
      const prefix = configuredPrefix ?? "@";
      const { client, server } = fixture(configuredPrefix);
      await expect(
        client.apps.create({
          description: null,
          name: "Stripe",
          slug: "stripe",
        })
      ).resolves.toMatchObject({ slug: `${prefix}stripe` });
      await expect(client.apps.list()).resolves.toMatchObject({
        items: [sharedApp, { ...localApp, slug: `${prefix}stripe` }],
      });
      await expect(
        client.apps.update({
          appId: localApp.id,
          description: null,
          name: "Renamed",
        })
      ).resolves.toMatchObject({ slug: `${prefix}stripe` });
      await expect(
        client.apps.deploy({ appId: localApp.id, deploymentId: "deployment" })
      ).resolves.toMatchObject({ slug: `${prefix}stripe` });

      await expect(
        server.experimental.installApp({
          appId: "source",
          scope: { name: "org", value: scope.value },
        })
      ).resolves.toMatchObject({ slug: `${prefix}stripe` });
    }
  );

  it.each([404, 409])(
    "preserves upstream lookup status %s for browser and RPC callers",
    async (status) => {
      const { server, client, authenticate } = fixture("@", status);

      const response = await server.handler(
        new Request(
          "https://host.test/api/patchsmith/apps/lookup?slug=@stripe"
        ),
        { authenticate }
      );

      expect(response.status).toBe(status);
      await expect(client.apps.get({ slug: "@stripe" })).rejects.toMatchObject({
        code: status === 409 ? "CONFLICT" : "NOT_FOUND",
      });
    }
  );

  it.each(prefixChanges)(
    "changes presented names from $previous to $current and rejects the previous prefix",
    async ({ current, previous }) => {
      const original = fixture(previous);

      await expect(
        original.client.apps.get({ slug: `${previous}stripe` })
      ).resolves.toMatchObject({ id: localApp.id, slug: `${previous}stripe` });

      const { client, requests, server, authenticate } = fixture(current);
      await expect(client.apps.list()).resolves.toMatchObject({
        items: [sharedApp, { ...localApp, slug: `${current}stripe` }],
      });
      await expect(
        client.apps.get({ slug: `${current}stripe` })
      ).resolves.toMatchObject({ id: localApp.id, slug: `${current}stripe` });
      await expect(
        client.apps.get({ slug: `${previous}stripe` })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });

      const obsoleteUrl = new URL(
        "https://host.test/api/patchsmith/apps/lookup"
      );

      obsoleteUrl.searchParams.set("slug", `${previous}stripe`);

      const obsoleteResponse = await server.handler(new Request(obsoleteUrl), {
        authenticate,
      });

      expect(obsoleteResponse.status).toBe(400);

      await expect(
        client.apps.get({ scopes: ["other"], slug: `${current}stripe` })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(client.apps.get({ slug: "stripe" })).resolves.toMatchObject(
        sharedApp
      );
      expect(
        requests.filter((request) => request.url.endsWith("/apps/lookup"))
      ).toHaveLength(2);
      expect(localApp.slug).toBe("stripe");
    }
  );
});
