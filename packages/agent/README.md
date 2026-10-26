# Patchsmith agent

`@patchsmith/agent` runs a Pi-backed `HarnessAgent` to build and edit Patchsmith extensions. The web host, platform chat routes, Model Context Protocol (MCP) routes, and app source export use this package.

## Instructions and skills

`src/instructions.md` supplies always-loaded workspace, app structure, runtime, and publishing rules. `src/skills.ts` registers six on-demand harness skills from bundled Markdown:

- Host UI and tools
- Views and file routing
- Backend functions
- SQLite and relations
- Preact composition
- Preact performance

The harness makes these skills discoverable each turn; app workspaces do not need copies of this repository's `.agents` directory. App-specific component, callback, styling, slot, and tool pages come from the CLI-generated `patchsmith-capabilities` skill.

The frontend and composition skills bundle small form and state examples from `src/skills/references/` as on-demand files. The CLI's `agent-examples.test.ts` compiles complete marked recipes against public SDK declarations, and integration tests check that their bodies stay outside the initial model prompt.

The skills document SDK patterns for use with the scaffold and generated contract declarations. The agent consults installed public types for missing details or version mismatches. Host component names, props, and tools always come from that app's generated bindings.

The guidance favors ordinary components, local state, and direct SDK calls. Add abstractions or performance work for a current need. Keep platform requirements aligned with the CLI scaffold and public SDK; use Preact APIs rather than React/Next.js-specific patterns.

## Durable turns

`@patchsmith/agent/workflows` exports `appAgent(input)`. Start it with `start()` from `workflow/api`; the web host discovers it through `apps/web/workflows/app-agent.ts`. The workflow imports the agent dynamically from its step module. Node APIs, credentials, and sandbox objects stay inside steps.

Each turn checkpoints at model-step boundaries using `runHarnessAgentStep()`. Workflow records the returned `continueFrom` checkpoint and reconnects to the same unfinished turn without replaying the prompt.

Pi runs in the workflow step’s Node.js process and uses the Vercel sandbox for filesystem and shell tools. There is no sandbox bridge or exposed port. In-process reattachment is disabled: each slice restores Pi’s journal with the current tool context.

The virtual machine (VM) remains available between slices. Turns have a 30-minute scheduling budget; each step renews the VM lifetime to 15 minutes.

## App source and editing leases

The authorized app ID selects the shared `app-<appId>` source Drive. A separate `threadId` identifies the Pi conversation and its persistent `agent-thread-<threadId>` VM. PostgreSQL stores each thread's opaque resume handle in `app_agent_thread`; the thread's sandbox snapshots retain its Pi journal. Successful turns snapshot and stop the VM and release the app’s editing lease. Deployment credentials stay in the host process.

Switching threads uses the same current app source and each thread's own conversation history.

`app_agent_lease` allows one active writer per app, across all threads. Failed or cancelled runs invalidate and delete only their owning thread's VM; other conversations and the app source survive.

An abandoned lease expires after one hour. A new thread can reclaim it, invalidate the abandoned conversation, and clean up its VM. Unknown, foreign-app, interrupted, or cancelled thread IDs are rejected rather than silently starting an empty conversation. Cleanup is owner-checked and remains retryable.

## Prepare an app workspace

Before the model starts, sandbox setup installs `patchsmith@beta` and its matching command-line interface (CLI) in `/tmp/patchsmith-cli`. For empty workspaces, setup scaffolds `new-app` in `/workspace/app`, installs dependencies, and generates host bindings. A setup marker lets interrupted installation or generation resume without overwriting the scaffold. Existing app source is preserved.

CLI and new app installs enforce a three-day package release age. Only `patchsmith` and `@patchsmith/*` are immediately available. The agent receives a short readiness note and can begin implementation immediately.

## Start or resume a conversation

Every `patchsmith agent --host your_host_url` invocation starts a new conversation by default. Follow-up messages in that invocation reuse the thread ID announced by the platform in a transient `data-thread` UI chunk. The CLI prints the ID when the chat closes; use `patchsmith agent --host your_host_url --app your_app_id --thread your_thread_id` to continue it. The resumed terminal UI shows new messages while Pi retains the conversation’s prior context.

MCP `create_app` and `edit_app` create a new thread by default and return its ID in the terminal result. Pass `threadId` to `edit_app` for a related follow-up. After `create_app`, continue through `edit_app` with the returned app and thread IDs. The backend validates that the requested thread belongs to the authorized app before starting a run or issuing an MCP agent grant.

Direct workflow callers must first authorize the app and call `resolveAppAgentThread(appId, optionalThreadId)` from `@patchsmith/agent/threads`, then pass its result as `AppAgentInput.threadId`. Workflow slices continue the same unfinished turn; separate user-turn runs resume only their explicit thread.

## Configure the agent

Apply the generated `app-agent-sessions` and `agent-threads` migrations with `pnpm db:migrate` against your configured database. Set `DATABASE_URL` and the Vercel Sandbox credentials required by your environment. Choose model credentials for your provider:

| Provider   | Credentials                                            |
| ---------- | ------------------------------------------------------ |
| AI Gateway | `VERCEL_OIDC_TOKEN` or `AI_GATEWAY_API_KEY`            |
| OpenAI     | `OPENAI_API_KEY`                                       |
| Anthropic  | `ANTHROPIC_API_KEY`, optionally `ANTHROPIC_AUTH_TOKEN` |

Matching `*_BASE_URL` overrides are optional. Pi receives an isolated authentication record from `@patchsmith/env` and keeps model credentials in the host process.

Each execution resolves OpenID Connect (OIDC) credentials with `getVercelOidcToken()`. Vercel Functions supply these through the request context. Gateway credentials take precedence; the platform routes still supply the existing Gateway model. Using a direct provider also requires a matching model ID.

The platform uses `deepseek/deepseek-v4.1-flash-1017` through AI Gateway. Pi supplies the bundled model catalog. For callers selecting `openai/gpt-6.1-sol`, a fixed Sol model entry overrides its Gateway transport to OpenAI Responses so explicit reasoning effort is preserved. Agent initialization makes no model-catalog requests; model-call credentials are resolved afresh for each execution.

## Consume tool events

The agent exposes Pi’s typed `read`, `write`, `edit`, `bash`, `grep`, `glob`, and `ls` tools through AI SDK tool events. Native file tools can read the app workspace, supplied schema, and installed CLI; writes stay in the workspace.

The host-executed `deploy` tool runs typechecks and builds in the sandbox without deployment credentials. It validates the resulting artifact manifest, then uploads and publishes from the host using the platform’s short-lived grant. The host pins the authorized app and redacts credentials from tool results. The JWT never enters the shell-visible sandbox. Setup and resumed turns remove token files left by older snapshots. See the [Pi adapter](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi).

`run.getReadable<UIMessageChunk>()` emits AI SDK UI chunks. Consume it directly without `createModelCallToUIChunkTransform()`. The CLI chat keeps running when its response disconnects; the existing MCP transport cancels its agent on disconnect.

## MCP

`@patchsmith/agent/mcp` exports `createAppAgentMcp(backend, scopeNames)`. The backend supplies authorized app operations; the package registers exactly three tools:

- `list_apps`: a paginated, read-only lookup across the caller's authorized scopes.
- `create_app`: creates an app installation and launches an autonomous agent to build and deploy it. Takes `name`, optional `description`, the authorized scope name, and `prompt`.
- `edit_app`: launches an autonomous agent to edit and deploy an existing app. Takes `appId`, `prompt`, and optional `threadId`.

The `create_app` and `edit_app` descriptions explain that their agents write code, run commands, and publish apps. Calls without a thread ID start a new conversation; callers must not automatically retry a disconnected create/edit call. List does not launch an agent.

The endpoint implements MCP 2026-07-28 using the official SDK v2. It rejects legacy initialization, HTTP+SSE, and protocol sessions. Responses use request-scoped Server-Sent Events (SSE) with keepalives.

The web host gives `/api/platform/app-agent/mcp` its own Vercel Function with a 1,800-second maximum duration so the request can stream a full agent turn. This requires Vercel’s extended function durations on Pro or Enterprise. Other web routes retain their default duration.

`create_app` and `edit_app` send standard `notifications/progress` when the request supplies `_meta.progressToken`. Each notification contains `progressToken`, `progress`, and a human-readable `message`, following the [MCP progress specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress). `progress` is a monotonically increasing notification count. A message that generation has finished does not establish success: wait for the final result. Failed MCP tool calls have `isError: true`; a failed nested tool action may be repaired by the agent before the call completes. Clients that do not request progress still receive the final result. The `create_app` schema advertises the authorized scope names as an enum.

Standard progress messages include cumulative assistant text, command previews such as `Bash: pnpm check`, file paths such as `Read: src/app.tsx`, and tool outcomes such as `failed: Bash: pnpm check`. Nonzero tool exit codes and `isError: true` tool results are reported as failed; preliminary results are omitted. Previews collapse whitespace, remove terminal control sequences, and stay within 320 characters; truncated previews use an ellipsis. Commands containing credential markers are hidden. Reasoning, raw tool arguments, file contents, tool outputs, and bookkeeping chunks are excluded from progress messages. Preview text remains agent-generated data, not a guarantee that arbitrary text is free of sensitive information.

Unrecognized tools use their sanitized name, for example `Tool: browser_snapshot`. Their arbitrary arguments are not previewed. A blank name falls back to `Tool.`. Identical consecutive updates are omitted. Text updates are coalesced over 750 ms, with the latest pending text flushed at text-block boundaries, before significant activity changes, and before the final result. Tool and lifecycle changes are delivered immediately. During quiet work, the last message is repeated every 15 seconds to keep progress-aware client timeouts alive. Timers stop when the call completes, fails, or is cancelled.

The backend returns an `AppAgentMcpResult` containing `{ appId, answer, threadId, runId, finishReason }`. All fields are required and advertised in the tools' output schema. The platform collects only assistant text from the workflow stream; it does not assemble a full UI message or return internal messages, reasoning, tool transcripts, session state, or usage. Text blocks are separated by blank lines. `answer` defaults to `App agent run ended.` when there is no text. `finishReason` reports why generation stopped; it does not guarantee deployment success. A streamed error or abort fails the call and triggers workflow cleanup.

The final response contains one readable `content` text block with the answer. `structuredContent` contains the compact result, including the app/run/thread IDs for continuing with `edit_app`. The response has no additional serialized JSON text block. Render `progress.message` for live progress and read `structuredContent.answer` for the final answer. The backend's `onProgress` callback accepts internal `AppAgentMcpEvent` events, which the MCP adapter reduces before transmission.

For example, connect an MCP client and render progress events while the agent edits an app:

```ts
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const { url: platformMcpUrl, headers } = await patchsmith.mcp.transport({
  scopes,
  subjectId,
});
const client = new Client(
  { name: "host-agent", version: "1.0.0" },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } }
);
await client.connect(
  new StreamableHTTPClientTransport(new URL(platformMcpUrl), {
    // URL and headers from await patchsmith.mcp.transport({ scopes, subjectId }).
    requestInit: { headers },
  })
);
const result = await client.callTool(
  { name: "edit_app", arguments: { appId, prompt: "Add a calendar view" } },
  {
    signal,
    timeout: 35 * 60_000,
    resetTimeoutOnProgress: true,
    onprogress: (progress) => {
      if (progress.message !== undefined) {
        renderAgentProgress(progress.message);
      }
    },
  }
);
```

The AI SDK MCP client currently does not expose `onprogress`; its standard tool adapter receives only the final result. Use an MCP client with progress support and forward updates into the host chat stream to display live builds. Keep the URL and headers returned by `mcp.transport` on the server.

The [current transport specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) does not support resumable SSE or `Last-Event-ID`. Closing a stream cancels the request. The platform attempts to stop the agent, delete its sandbox, and clear its resume state, then revokes its grant.

Stream and progress failures use the same cleanup. If sandbox deletion fails, its idle timeout releases it; process interruption can leave cleanup to the grant expiry and sandbox timeout.

Successful calls wait for workflow cleanup before the terminal result. A cancelled create may leave an app installation, and published changes are not rolled back. Use `list_apps` to inspect the app before starting a deliberate new call.
