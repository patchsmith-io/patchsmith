# Patchsmith core

Use `@patchsmith/core` to define a host contract and connect your server to Patchsmith.

## Guide the app builder

Set `agent.instructions` on `createServer()` to give the app builder design conventions, product context, or implementation tips:

```ts
const patchsmith = createServer({
  contract,
  baseUrl: "https://example.com/api/patchsmith",
  projectKey,
  agent: {
    instructions: `Use our purple accent color and compact layouts.
Prefer the host's existing components. Keep copy short and task-focused.`,
  },
});
```

The guidance is appended to Patchsmith's built-in builder instructions on each new turn, including follow-ups in existing conversations. It applies to MCP clients, `createTools(patchsmith, context)` from `patchsmith/ai-sdk`, and CLI chat through the host. The outer AI SDK model keeps its own instructions.

Instructions are trimmed, may contain up to 32,000 characters, and stay out of the public contract schema. MCP requests share the existing 8 KiB encoded context-header budget with the host URL, scopes, and subject ID. Shorten the guidance if the transport reports that limit. Use guidance for conventions and tips; authorization and tool permissions still belong in host code.

## Connect an app agent over MCP

`createServer()` exposes `server.mcp.transport({ scopes, subjectId })` to prepare an HTTP connection for a server-side Model Context Protocol (MCP) client. Pass the same data shape returned by your host’s `authenticate()` callback. The helper validates scope values against the contract’s Standard Schema validators; it does not call `authenticate()` or require a `Request`.

For example, use the returned URL and headers with the AI SDK’s `createMCPClient`:

```ts
const { url, headers } = await patchsmith.mcp.transport({
  scopes: { org: { tenant: organization.id } },
  subjectId: user.id,
});

const mcpClient = await createMCPClient({
  transport: { type: "http", url, headers },
});
```

The URL points directly to Patchsmith’s platform MCP endpoint. The headers contain your project credential and encoded caller context. These values also work with other HTTP MCP clients.

Keep the headers server-side and create them for each authenticated caller. They contain the project secret and must never reach browsers or untrusted clients. Scopes describe the trusted host’s caller context for the request. The helper does not mount a host `/mcp` route or proxy handler.

The helper includes the configured host URL so the builder agent can fetch its `/schema` endpoint when creating or editing an app. That endpoint must be reachable from the agent’s sandbox. Contract schemas stay out of HTTP headers; the caller context header has an 8 KiB limit.

Clients must implement MCP 2026-07-28 and request progress notifications to receive agent events. See the [app-agent protocol and client example](../agent/README.md#mcp).

## Invoke app hooks

Declare hooks alongside host tools. A tool is implemented by the host and called by an app; a hook is implemented by an app and called by the host.

```ts
import { defineContract, hook } from "patchsmith";
import { createServer } from "patchsmith/server";
import { z } from "zod";

const contract = defineContract({
  scopes: { team: z.object({ id: z.string() }) },
  hooks: {
    sync: hook()
      .input(z.object({ mode: z.enum(["full", "incremental"]) }))
      .output(z.object({ processed: z.number(), hasMore: z.boolean() })),
  },
});

const patchsmith = createServer({
  contract,
  baseUrl: "https://example.com/api/patchsmith",
  projectKey,
});

const scopes = { team: { id: teamId } };
const subjectId = "service:sync";

const apps = await patchsmith.hooks.sync.list({ scopes, subjectId });

for (const app of apps) {
  await patchsmith.hooks.sync.invoke({
    appId: app.id,
    input: { mode: "incremental" },
    scopes,
    subjectId,
  });
}
```

Call these methods from trusted server code, such as a cron handler, verified webhook handler, or authenticated manual operation. The host must resolve the caller's authorized scopes and subject before passing `scopes` and `subjectId`. Both methods accept an optional `signal` for cancellation.

`list` reads hook names from each installation’s active published deployment metadata, without calling app runtimes. Apps with no declared hooks are omitted. `invoke` targets one installation, validates input before execution, obtains a server-only session granting that hook, and validates its output. Platform project credentials and hook sessions stay on the host. Apps run inside the existing sandbox and use host tools for host data writes.

Hook names are flat contract keys with optional dotted namespaces, such as `"customers.sync"`; access those callers as `patchsmith.hooks["customers.sync"]`. Hooks without input or output schemas accept no payload or return value. App bindings use the parsed input type and the output validator's accepted type, preserving host schema transformations.

This interface does not manage schedules, webhook verification, sync checkpoints, concurrency locks, or retries. The host controls triggers; apps can store provider-specific checkpoints in their installation database.

Hook names are recorded per deployment from the build manifest. Existing deployments and older uploaders default to no hooks; rebuild and republish hook-enabled apps to populate the metadata. Installations and rollouts use their selected deployment’s hook list. Deploy the database migration before the updated platform; host invocation checks support before issuing a hook session.

## Install an app

Pass the authenticated user's or service principal's stable identifier when installing an app into a host-authorized scope:

```ts
const installation = await patchsmith.experimental.installApp({
  appId: publishedAppId,
  scope: { name: "team", value: { id: teamId } },
  subjectId: user.id,
});
```

`subjectId` is required and must contain between 1 and 256 characters. Resolve it in trusted host code, alongside authorization for the destination scope. The SDK forwards it to the platform using the host's project credentials.

Apps can implement the built-in `patchsmith.onInstall` hook in `src/hooks/patchsmith/onInstall.hook.ts` using `defineHook` from `patchsmith/server`. No host declaration is needed. The SDK forwards its configured host tool endpoint automatically, and the platform invokes the hook in the sandbox after the installation commits, with the installing subject's identity and the installation scope.

The install request waits up to 30 seconds for hook execution. Failures are logged and leave the installation in place; delivery has no automatic retries. Hosts cannot declare `patchsmith` or `patchsmith.*` hooks, and platform hooks cannot be invoked through host hook callers.
