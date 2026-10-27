import { expectTypeOf } from "vite-plus/test";
import { z } from "zod";

import { defineContract } from "#schema/contract";
import { hook } from "#schema/hooks";

import { createServer } from "./contract";

const server = createServer({
  baseUrl: "https://host.test/api/patchsmith",
  contract: defineContract({
    hooks: {
      notify: hook(),
      sync: hook()
        .input(z.object({ cursor: z.string() }))
        .output(z.object({ processed: z.number() })),
    },
    scopes: { team: z.object({ id: z.string() }) },
  }),
});

const context = { scopes: { team: { id: "team" } }, subjectId: "service:sync" };

expectTypeOf(
  server.hooks.sync.invoke({
    appId: "app",
    ...context,
    input: { cursor: "cursor" },
  })
).toEqualTypeOf<Promise<{ processed: number }>>();

const noOutput: Promise<void> = server.hooks.notify.invoke({
  appId: "app",
  ...context,
});

void noOutput;

// @ts-expect-error The host requires the declared hook input.
void server.hooks.sync.invoke({ appId: "app", ...context });

void server.hooks.sync.invoke({
  appId: "app",
  ...context,
  // @ts-expect-error Invalid payload shape.
  input: { cursor: 1 },
});

// @ts-expect-error Host invocation requires a verified principal.
void server.hooks.notify.invoke({ appId: "app", scopes: context.scopes });

// @ts-expect-error Only declared hooks can be invoked.
void server.hooks.missing;

void server.hooks.sync.list(context);

// @ts-expect-error Hook discovery requires a verified principal.
void server.hooks.sync.list({ scopes: context.scopes });

// @ts-expect-error Hook discovery requires authorized scopes.
void server.hooks.sync.list({ subjectId: context.subjectId });

// @ts-expect-error Host invocation requires authorized scopes.
void server.hooks.notify.invoke({ appId: "app", subjectId: context.subjectId });

// @ts-expect-error Platform lifecycle hooks are dispatched automatically, not through host callers.
void server.hooks["patchsmith.onInstall"];
