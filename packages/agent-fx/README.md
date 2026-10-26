# @patchsmith/agent-fx

The default app builder for chat and MCP. Uses `HarnessAgent` with unpatched `@ai-sdk/harness-fx` 1.0.80 and libfx 0.0.14. The harness provides sandbox tools, skills, conversation checkpoints and AI SDK streaming. App source stays on a persistent Vercel Sandbox Drive; deployment credentials remain host-controlled.

## Execution and durability

Each user turn has three Workflow steps: prepare the workspace and acquire the app lease, run the complete harness turn, then save its resume state and stop the sandbox before releasing ownership. There are no Workflow steps around individual model requests or tool calls. Whole-turn execution avoids the mid-turn suspension/replay boundary that required our FX patch.

Completed turns are durable checkpoints. Chat and MCP reconnect through Workflow's existing output stream. The next user turn restores the harness conversation and receives fresh deployment credentials. Start a new conversation after upgrading: harness 1.0.80 stores its private checkpoints in the shared harness data directory, rather than the previous FX-specific directory.

The execution step explicitly disables automatic retries: restarting an entire interrupted turn could repeat arbitrary shell commands or a deployment. A crashed, failed, cancelled or timed-out turn is cleaned up and its thread invalidated. Source already written to the Drive remains available to a new conversation, which can inspect it and recover. This is durability between completed turns, not automatic mid-turn crash continuation. Ordinary tool errors are reported to the running agent so it can inspect and repair them.

Setup and cleanup remain retryable. Cleanup holds the app lease until the sandbox is stopped or deleted, so stale cleanup cannot release a newer writer. External cancellation starts an independent cleanup Workflow. An authenticated cron at `/api/app-agent/reconcile` runs every five minutes to clean up terminal Workflows that skipped their catch blocks. Configure `CRON_SECRET` on the host. No native libfx queue route or custom stream bridge is needed.

A turn has a 25-minute execution limit, within the host's 30-minute function budget. The web host declares the same exact libfx version as the harness so Nitro can trace its runtime-relative native assets, including in isolated functions. Configure `AI_GATEWAY_API_KEY` or Vercel OIDC on the host, with optional `AI_GATEWAY_BASE_URL`.

## Workspace and deployment

Workspace setup initializes new apps with `patchsmith init --bare`, installs dependencies and provisions generated host bindings. Existing apps and interrupted setup are preserved. The CLI beta containing `init --bare` must be published before deploying this agent.

Four skill pointers lead to guides under `/workspace/.patchsmith-agent/references/`. Guides link to small recipes; their bodies stay out of the initial prompt. `skills.test.ts` verifies the reference graph, and the CLI's `agent-examples.test.ts` compiles complete marked recipes against public SDK declarations.

The host deployment tool runs `pnpm run fix`, `pnpm run test --passWithNoTests`, then `pnpm exec patchsmith deploy --no-interactive`. Each command must pass before the next runs; output redacts credentials. Regeneration and database migration generation remain explicit authoring commands.

## Verification

Integration tests run the real, unpatched harness against a disposable filesystem and shell with fixture model responses. They cover multiple tools in one uninterrupted turn, AI SDK stream consumption, next-turn conversation restoration, credentials and skills. A child-process test dies after a shell side effect and verifies that a new conversation can inspect the retained source without repeating it. Lease and retryable-cleanup tests use the production Drizzle migrations against PGlite.
