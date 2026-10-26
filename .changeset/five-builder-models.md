---
"patchsmith": patch
"@patchsmith/core": patch
"@patchsmith/client-platform": patch
---

Add the optional `agent.model` server setting for CLI and MCP app-building runs. Choose GPT-6.1 Sol, Claude Sonnet 5.5, Claude Opus 5.5, GPT-6 Astra, or DeepSeek V4.1 Flash. Omitting the setting keeps GPT-6.1 Sol as the default. Unsupported model IDs are rejected. The public DeepSeek option resolves to the pinned `deepseek/deepseek-v4.1-flash-1017` Gateway snapshot.
