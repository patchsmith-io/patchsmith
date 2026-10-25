# @patchsmith/agent-fx

The default app builder for chat and MCP. Runs native durable `libfx` 0.0.14 sessions on the host, with filesystem and shell tools confined to a persistent Vercel Sandbox. App source stays on its shared Drive. Deployment credentials stay on the host and are passed only to the deployment command.

## Durability and tools

One Workflow manages each user turn's lifecycle: acquire the app lease and prepare the workspace, submit one native prompt, observe its stored terminal result, then stop the sandbox and release ownership. The Workflow run ID is the native `messageId`, so submission retries attach to the same turn. A generated native session ID is stored in the thread's existing opaque `resumeState` field; no database migration is required. Start new threads when switching from the old FX harness or Pi; their resume formats are incompatible.

libfx owns the model loop, stored model/tool results, crash recovery and replayable output. There is no per-model-step suspension, `@ai-sdk/harness-fx` patch, or Workflow step around tool calls. A private queue-trigger function at `/api/libfx/wake` registers the named agent and serves `wakeHandler()`. Vercel's World and queue store and recover native sessions; local development uses libfx's local store.

The host registers `read`, `write`, `edit`, `bash` and `deploy`. Reads may retry after a crash. Writes, edits, arbitrary shell commands and deployments are non-idempotent and serialize with other tool calls. When interrupted, libfx reports an uncertain outcome to the agent instead of automatically repeating the side effect. The agent can inspect the workspace or deployment status and decide how to recover. Publication does not claim exactly-once execution.

Every tool call checks the app lease and the native session's thread mapping. The persisted native context contains app/thread/run IDs and the already-verified grant identity, not deployment or model credentials. Deployment mints a short-lived token on the executing host; the platform still checks the underlying grant's expiry and revocation.

Chat and MCP translate libfx's stored events into AI SDK UI chunks. Reconnects derive the same chunks from the journal and skip the requested `startIndex`; a disconnect stops only the reader. Workflow does not copy or checkpoint the output stream. GPT-6.1 Sol uses low reasoning effort; other models use their defaults.

## Cleanup and deployment

Successful turns preserve the native conversation and stop the sandbox before releasing the app lease. Failed, cancelled and timed-out turns cancel the native session, delete the sandbox and invalidate the thread, preserving source on the Drive. Cleanup is retryable and checks ownership while holding the lease row lock, so a stale cleanup cannot release a newer writer. External cancellation starts an independent cleanup Workflow.

A Vercel cron invokes `/api/libfx/reconcile` every five minutes and starts a reconciliation Workflow. It cleans up leases belonging to terminal Workflows, including externally cancelled runs that skipped their catch blocks, and leaves running/pending Workflows alone. Configure `CRON_SECRET` on the host; the reconciliation endpoint rejects unauthenticated requests and requests when the secret is unset. The generated wake function must retain its private `queue/v2beta` trigger for topic `__libfx_wkf_workflow_session`.

The web host declares the same exact `libfx` version as this package so Nitro traces its native addons. The runtime resolution test guards that alignment. Configure `AI_GATEWAY_API_KEY` or Vercel OIDC on the host, with optional `AI_GATEWAY_BASE_URL`, and the existing `AUTH_SECRET` and `OPENAPI_SERVER_URL` for deployment grants.

The turn has a 30-minute budget. Ordinary native execution handoffs and observer timeouts keep it active; only a recorded terminal result, explicit cancellation or the overall deadline leads to cleanup.

## Instructions and workspace

Workspace setup initializes new apps with `patchsmith init --bare`, installs dependencies, and provisions generated host bindings. The bare app has no example views or backend. Existing apps and interrupted setup are preserved. The CLI beta containing `init --bare` must be published before deploying this agent.

Four skill pointers in the prompt lead to guides under `/workspace/.patchsmith-agent/references/`. Guides link to small recipes, including workflow examples. Keep guide bodies and recipes out of the initial prompt. `skills.test.ts` verifies the reference graph, and the CLI's `agent-examples.test.ts` compiles complete marked recipes against public SDK declarations.

The deployment tool runs `pnpm run fix`, `pnpm run test --passWithNoTests`, then `pnpm exec patchsmith deploy --no-interactive`. Each command must pass before the next runs; output redacts credentials. The model repairs reported failures and can retry. Regeneration and database migration generation remain explicit authoring commands.

## Verification

Tests use real native sessions and the local durable store. They cover repeated prompt IDs, conversation restoration, ordered UI replay and reconnection, and abrupt process termination before/after saved tool results. Interrupted non-idempotent calls are not automatically repeated; idempotent calls recover with the same execution ID. Lease and cleanup tests use the production Drizzle migrations against PGlite with injected infrastructure dependencies.
