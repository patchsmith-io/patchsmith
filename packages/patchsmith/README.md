# Patchsmith

Patchsmith lets users, AI, and partners build extensions inside your SaaS. Those extensions run in a sandbox and use the components, data, and actions you choose to expose.

## Configure the app builder

Set `agent.model` in your `createServer` options to choose the model used for CLI and MCP app-building runs:

```ts
import { createServer } from "patchsmith/server";

export const patchsmith = createServer({
  contract,
  baseUrl: "https://your-app.com/api/patchsmith",
  projectKey,
  agent: {
    model: "anthropic/claude-sonnet-5.5",
    instructions: "Use compact layouts and our purple palette.",
  },
});
```

Use your existing contract and project key. Supported model IDs are:

- `openai/gpt-6.1-sol` (default)
- `openai/gpt-6.1-sol-fast`
- `anthropic/claude-sonnet-5.5`
- `anthropic/claude-opus-5.5`
- `openai/gpt-6-astra`
- `deepseek/deepseek-v4.1-flash`

`deepseek/deepseek-v4.1-flash` runs the pinned `deepseek/deepseek-v4.1-flash-1017` Gateway snapshot.

Omit `agent.model` to keep the default. The host controls the model; CLI callers cannot override it. Reconnecting to a running turn continues that turn's original model.
