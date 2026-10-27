import type { StandardSchemaV1 } from "@standard-schema/spec";
import { expectTypeOf } from "vite-plus/test";
import { z } from "zod";

import { defineContract } from "#schema/contract";
import type { EmptyDefinitionMap } from "#schema/shared";

import { createServer } from "./contract";
import { createPatchsmithServer } from "./handler";
import type { PatchsmithServerOptions, PatchsmithHostContext } from "./types";

expectTypeOf<
  PatchsmithHostContext<{ org: { orgId: string } }>
>().toEqualTypeOf<{
  scopes: { org: { orgId: string } };
  subjectId: string;
}>();

createPatchsmithServer({
  baseUrl: "https://example.com/api/patchsmith",
  components: {},
  scopes: { account: z.object({ accountId: z.string() }) },
  slots: { navbar: { views: ["/"] }, panel: { views: ["/users"] } },
  views: { "/": z.object({}), "/users": z.object({}) },
});

createPatchsmithServer({
  baseUrl: "https://example.com/api/patchsmith",

  components: {},

  scopes: { account: z.object({ accountId: z.string() }) },

  // @ts-expect-error A slot cannot reference an undeclared global view.
  slots: { panel: { views: ["/missing"] } },

  views: { "/": z.object({}) },
});

const namedScopes = {
  org: z.object({ orgId: z.string() }),
  userOrg: z.object({ orgId: z.string(), userId: z.string() }),
};

const scopedServer = createPatchsmithServer({
  baseUrl: "https://example.com/api/patchsmith",
  components: {},
  scopes: namedScopes,
});

const explicitlyTypedOptions: PatchsmithServerOptions<
  EmptyDefinitionMap,
  EmptyDefinitionMap,
  EmptyDefinitionMap,
  typeof namedScopes
> = {
  baseUrl: "https://example.com/api/patchsmith",
  components: {},
  scopes: namedScopes,
};

const explicitlyTypedServer = createPatchsmithServer(explicitlyTypedOptions);

void explicitlyTypedServer.handler(
  new Request("https://example.com/api/patchsmith/apps"),
  {
    // @ts-expect-error Authenticated hosts must supply the verified subject, even for workspace-scoped apps.
    authenticate: () => ({ scopes: { org: { orgId: "org_1" } } }),
  }
);

// @ts-expect-error MCP transports require the same authenticated subject as the host handler.
void explicitlyTypedServer.mcp.transport({
  scopes: { org: { orgId: "org_1" } },
});

void explicitlyTypedServer.handler(
  new Request("https://example.com/api/patchsmith/apps"),
  {
    authenticate: () => ({
      scopes: {
        // @ts-expect-error explicit options retain the org schema's required orgId
        org: {},
      },
      subjectId: "user",
    }),
  }
);

void scopedServer.handler(
  new Request("https://example.com/api/patchsmith/apps"),
  {
    authenticate: () => ({
      scopes: {
        org: { orgId: "org_1" },
        userOrg: { orgId: "org_1", userId: "user_1" },
      },
      subjectId: "user",
    }),
  }
);

void scopedServer.handler(
  new Request("https://example.com/api/patchsmith/apps"),
  {
    authenticate: () => ({
      scopes: { org: { orgId: "org_1" } },
      subjectId: "user",
    }),
  }
);

void scopedServer.handler(
  new Request("https://example.com/api/patchsmith/apps"),
  {
    // @ts-expect-error authenticate must provide at least one declared scope
    authenticate: () => ({ scopes: {}, subjectId: "user" }),
  }
);

void scopedServer.handler(
  new Request("https://example.com/api/patchsmith/apps"),
  {
    authenticate: () => ({
      scopes: {
        // @ts-expect-error org is inferred from its schema and requires orgId
        org: {},
      },
      subjectId: "user",
    }),
  }
);

const nonJsonSchemaScope = {
  "~standard": {
    types: {
      input: { accountId: "account" },
      output: { accountId: "account" },
    },
    validate: (
      value: Parameters<StandardSchemaV1["~standard"]["validate"]>[0]
    ) => {
      const parsed = z.object({ accountId: z.string() }).safeParse(value);

      if (!parsed.success) {
        return { issues: [{ message: "Expected an account ID." }] };
      }

      return { value: parsed.data };
    },
    vendor: "core-type-test",
    version: 1 as const,
  },
} satisfies StandardSchemaV1<{ accountId: string }, { accountId: string }>;

const standardOnlyServer = createPatchsmithServer({
  baseUrl: "https://example.com/api/patchsmith",
  components: {},
  scopes: { account: nonJsonSchemaScope },
});

void standardOnlyServer.handler(
  new Request("https://example.com/api/patchsmith/apps"),
  {
    authenticate: () => ({
      scopes: { account: { accountId: "acct_1" } },
      subjectId: "user",
    }),
  }
);

const contractServer = createServer({
  baseUrl: "https://example.com/api/patchsmith",
  contract: defineContract({ scopes: namedScopes }),
});

for (const installApp of [
  scopedServer.experimental.installApp,
  contractServer.experimental.installApp,
]) {
  void installApp({
    appId: "app",
    scope: { name: "org", value: { orgId: "org_1" } },
    subjectId: "user_1",
  });
  void installApp({
    appId: "app",
    scope: { name: "userOrg", value: { orgId: "org_1", userId: "user_1" } },
    subjectId: "user_1",
  });
  void installApp({
    appId: "app",
    // @ts-expect-error installation requires a declared scope name
    scope: { name: "missing", value: {} },
    subjectId: "user_1",
  });
  void installApp({
    appId: "app",
    // @ts-expect-error the named scope's value must include its required fields
    scope: { name: "userOrg", value: { orgId: "org_1" } },
    subjectId: "user_1",
  });
  // @ts-expect-error installation requires an explicit scope
  void installApp({ appId: "app", subjectId: "user_1" });
  // @ts-expect-error installation requires an explicit subject
  void installApp({
    appId: "app",
    scope: { name: "org", value: { orgId: "org_1" } },
  });
}

createServer({
  agent: { model: "deepseek/deepseek-v4.1-flash" },
  baseUrl: "https://host.test/api/patchsmith",
  contract: defineContract({ components: {}, scopes: namedScopes }),
});

createServer({
  // @ts-expect-error Only supported app-building model IDs are accepted.
  agent: { model: "unsupported/model" },
  baseUrl: "https://host.test/api/patchsmith",
  contract: defineContract({ components: {}, scopes: namedScopes }),
});
