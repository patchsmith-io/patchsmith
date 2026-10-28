# Backend runtime and integrations

Use this guide for outbound HTTP, webhooks, async lifetimes, runtime compatibility, and integration failures. Use `patchsmith-functions` for the function APIs, `patchsmith-hooks` for host events, and `patchsmith-database` for storage and migrations.

## The runtime apps actually receive

App backends run in isolated Cloudflare Workers, not the Node.js shell used to edit and build the app. Patchsmith manages the Worker, installation database, authentication, and outbound transport. A successful Node.js test or TypeScript check does not establish Workers API compatibility.

- Use `patchsmith/server` and `patchsmith/db`, plus the generated host bindings. Do not add a Worker `fetch` entry point, Wrangler configuration, `Env`, or a separate server deployment.
- Queries and mutations are synchronous database operations; mutations commit transactionally. External HTTP and host server tools belong in actions. Hook handlers can await app actions, queries, and mutations.
- Actions have no direct `db`. Declare their callable routers with `.functions(...)`; use the verified `identity` for authorization rather than trusting caller-supplied record or user IDs.
- Apps do not receive Cloudflare bindings or the platform's environment/secrets. Do not assume access to `ctx.waitUntil`, D1, R2, KV, Queues, Workflows, Durable Object classes, or Node.js filesystem/process/network APIs. Use managed app storage and declared host capabilities instead. Explain a missing capability instead of inventing bindings or scheduling APIs.

Follow the installed SDK and generated contracts. For an unfamiliar Web API or dependency, verify Workers support in current official documentation; Node.js/browser types can admit unsupported options. Platform compatibility dates, flags, and resource budgets are managed by Patchsmith, not by the app. Do not copy plan-specific limits or enable `nodejs_compat` in app configuration.

## HTTP requests and redirects

**Do not use `redirect: "error"`. Cloudflare Workers does not implement it: constructing the Request throws a `TypeError` before any network request is sent, including through `fetch(url, init)`.** Use `redirect: "manual"` and inspect the response status to reject redirects. Use `follow` only when following redirects is intended and safe for the destination, headers, method, and body.

Patchsmith permits action fetches to public HTTPS endpoints through its outbound transport. Local/private destinations are rejected; redirects are checked too. Validate configurable destinations on the backend, and restrict them to the intended provider when the integration is provider-specific. Keep credential-bearing URLs and headers server-side.

This action illustrates a single JSON notification with explicit redirect and HTTP failure handling. Replace the example service and payload with the requested integration:

<!-- example: functions/webhook.router.ts -->

```ts
import { AppError, defineRouter, fn } from "patchsmith/server";

const notify = fn.action.handler(async ({ signal }) => {
  const response = await fetch("https://api.example.com/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "example" }),
    redirect: "manual",
    signal,
  });

  // The response body is not used by this integration.
  await response.body?.cancel();
  if (response.status >= 300 && response.status < 400) {
    throw new AppError(
      "UNAVAILABLE",
      "Webhook redirected. Check the endpoint."
    );
  }
  if (!response.ok) {
    throw new AppError(
      "UNAVAILABLE",
      `Webhook returned HTTP ${response.status}.`
    );
  }
  return { accepted: true };
});

export default defineRouter({ notify });
```

Pass the action's `signal` to fetch. When a shorter service timeout is needed, combine it with `AbortSignal.timeout(...)` using `AbortSignal.any(...)`; do not discard parent cancellation. Check `response.ok`: a 4xx/5xx is a response, not a fetch exception. Validate external response data before using it. Read small, bounded JSON when appropriate; avoid buffering unbounded bodies, and consume or cancel unused response bodies. Streams stay within the action; return JSON-compatible results rather than a `Response` or stream from an app function.

## Lifetime, state, and delivery

Await every effect and return its result within the action or hook. Floating promises and timers are not background jobs. An action ends when its handler returns or is cancelled; outstanding work can be aborted. A short awaited delay is not durable scheduling, and hooks do not supply automatic retries or exactly-once delivery. If a feature needs durable jobs, use a host capability that actually provides them or explain the limitation.

Keep request state, signals, responses, and pending operations inside the invocation. Isolates can be reused; module-level mutable state is neither private per user nor persistent storage. Use the installation database for saved settings and delivery records, enforcing the feature's shared/private access rules. Use Web Crypto for security-sensitive randomness.

Network effects and database mutations do not share a transaction. A timeout can mean the provider accepted a write but its response was lost. Use provider idempotency keys when available, and define duplicate/retry behavior for the requested effect. Distinguish claimed, accepted, rejected, and unconfirmed delivery; an HTTP success does not prove a device changed state. Do not silently replace a requested sequence with a different one, such as alternating values across events instead of completing both steps for each event.

## Diagnose and verify

Keep failures actionable without leaking credentials. Distinguish request-construction/runtime errors, cancellation/timeout, HTTP rejection, and invalid response data. Do not turn every exception into "network error" or mark a failed effect delivered. Redact webhook keys, URL paths/query credentials, authorization headers, and sensitive payloads before saving or reporting diagnostics. Log only safe structured fields such as operation, stage, error category, and HTTP status; don't blindly stringify raw exceptions or responses.

Use the app's existing scripts for types, build, and focused tests. Stub external effects in unit tests and cover the relevant success and failure paths, including redirects and timeouts. Node.js fetch mocks cannot detect unsupported Workers options such as `redirect: "error"`; verify runtime-specific behavior in a Workers-backed test or an authorized deployed test when available. Do not scaffold a separate Worker or add bindings merely to test a managed app. State what was actually checked and whether a live effect was exercised; deploying successfully is not proof that a webhook was delivered.

## Official runtime references

- [Request options and redirect support](https://developers.cloudflare.com/workers/runtime-apis/request/): verify fetch/Request options, especially redirect behavior.
- [Fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/): runtime HTTP behavior.
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/): retrieve the relevant runtime guidance, then apply only what Patchsmith exposes. Platform administration and binding configuration belong to Patchsmith.
