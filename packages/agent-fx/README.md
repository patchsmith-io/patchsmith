# @patchsmith/agent-fx

The default app builder for chat and MCP. Uses the stock `@ai-sdk/harness-fx` adapter, native tools and session persistence, with Patchsmith instructions, six app-building skills, and one host-side deployment tool.

fx runs on the host. File and shell tools run in a persistent Vercel Sandbox; source is stored on the app's shared Drive. Before the first model step, workspace preparation initializes new apps with `patchsmith init --bare` and installs dependencies. The bare app contains configuration, tooling, bindings and the client root, with no example views or backend. Existing apps are preserved; interrupted installations resume using a setup marker. Deployment credentials stay on the host.

Each model step runs in a durable Workflow step. Finished turns save fx's resume state and stop the sandbox. Failed or cancelled turns invalidate the thread and remove its sandbox while preserving source. A database lease prevents concurrent app writers. Start a new thread to switch an existing Pi conversation to fx.

GPT-6.1 Sol and Sol Fast use low reasoning effort to reduce generation latency. Other models use their default effort.

The web host declares `libfx` directly so Nitro traces its native addons into the deployment. Keep that exact version aligned with the dependency pinned by `@ai-sdk/harness-fx`; Workflow externalizes `libfx`, so a different host version can replace the adapter's runtime in production. The web runtime resolution test guards this alignment.

No runtime code is imported from `@patchsmith/agent`. Configure `AI_GATEWAY_API_KEY` or Vercel OIDC on the host, with optional `AI_GATEWAY_BASE_URL`.

## Instructions, skills, and examples

`src/instructions.md` routes tasks to the six skills registered in `src/skills.ts`, including `patchsmith-hooks` for host-triggered backend work and `patchsmith-backend` for Workers runtime compatibility, outbound requests, async lifetimes, and integration diagnostics. The backend guide explicitly covers unsupported `redirect: "error"` and adapts Cloudflare guidance to the APIs apps receive, without suggesting platform bindings or configuration. App-specific UI, callback, styling, view, tool, and hook contracts come from the CLI-generated `.agents/skills/patchsmith-capabilities/` skill in the app workspace. Its `references/hooks.md` index links to each host hook's input, output, and registration path; shared implementation guidance lives in `patchsmith-hooks`.

Skill guides and small workflow, form, function, and view examples are provisioned under `/workspace/.patchsmith-agent/references/`. Skill content contains only a pointer to its guide; the model reads the guide and any linked recipe when needed. Keep guide bodies and recipes out of both `HarnessAgentSkill.content` and `.files`: FX embeds those in the prompt. Tests verify the reference graph and that recipes remain outside the prompt.

The CLI's `agent-examples.test.ts` compiles complete marked recipes and generated code examples against public SDK declarations. When adding a complete source file, use an `<!-- example: src/path.tsx -->` marker immediately before its TypeScript fence and include the recipe in that test. Partial snippets should state their required surrounding context.

## Verification and publication

The agent calls `deploy` once implementation is ready. The host runs declared `format:fix`, `lint`, `format` and `test` scripts, then TypeScript and the Vite build. Apps exposing only a `check` script use that instead of separate lint/format checks. Tests run with `CI=true`; Vite/Vitest scripts permit an empty suite. Each phase must pass before the next phase or publication. Successful output contains phase timings and the deployment ID; failures contain the phase and compiler/test diagnostics with credentials redacted.

Routine checks belong to this tool. The model can run an individual check to diagnose a reported failure, then retry deployment after repairing the source. Regeneration and database migration generation remain explicit authoring commands.

The CLI beta containing `init --bare` must be published before deploying this agent version, since fresh sandboxes resolve `patchsmith@beta` during preparation.
