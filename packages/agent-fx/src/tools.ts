import nodePath from "node:path";

import { issueAgentToken } from "@patchsmith/api-utils/agent-token";
import type { FxAgentTool, FxToolContext } from "libfx";
import { z } from "zod";

import { env } from "#env";

import { deployTool } from "./deploy";
import { toolContextSchema } from "./native-state";
import { assertSessionOwnership } from "./ownership";
import { getSandbox, sandboxName } from "./sandbox";
import type { AppSandboxSession } from "./sandbox-session";

const { posix } = nodePath;
const workspace = "/workspace/app";
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const fileSchema = z.strictObject({ file_path: z.string().min(1) });
const writeSchema = fileSchema.extend({ content: z.string() });

const editSchema = fileSchema.extend({
  new_string: z.string(),
  old_string: z.string().min(1),
});

const bashSchema = z.strictObject({
  command: z.string().min(1),
  timeout: z.number().positive().max(300).optional(),
});

interface ToolDependencies {
  session: (context: FxToolContext) => Promise<AppSandboxSession>;
  deploy: (
    context: FxToolContext
  ) => Promise<{ agentToken: string; sandboxName: string }>;
}

const defaultToolDependencies: ToolDependencies = {
  deploy: async (execution) => {
    const context = toolContextSchema.parse(execution.context);
    await assertSessionOwnership(context, execution.sessionId);

    if (env.AUTH_SECRET === undefined) {
      throw new Error("Agent deployment authorization is unavailable.");
    }

    const agentToken = await issueAgentToken(
      context.grant,
      env.AUTH_SECRET,
      env.OPENAPI_SERVER_URL ?? "https://patchsmith.io/api/platform"
    );

    return { agentToken, sandboxName: sandboxName(context.threadId) };
  },
  session: async (execution) => {
    const context = toolContextSchema.parse(execution.context);
    await assertSessionOwnership(context, execution.sessionId);

    const sandbox = await getSandbox(sandboxName(context.threadId));

    return sandbox.currentSession();
  },
};

export const createSandboxTools = (
  dependencies: ToolDependencies = defaultToolDependencies
): FxAgentTool[] => {
  const run = async (context: FxToolContext, command: string, timeout = 60) => {
    const session = await dependencies.session(context);

    const result = await session.runCommand({
      args: ["-o", "pipefail", "-c", command],
      cmd: "bash",
      cwd: workspace,
      signal: context.signal,
      timeoutMs: timeout * 1000,
    });

    const [stdout, stderr] = await Promise.all([
      result.stdout(),
      result.stderr(),
    ]);

    return { exitCode: result.exitCode, stderr, stdout };
  };

  const resolvePath = async (context: FxToolContext, path: string) => {
    const target = posix.resolve(workspace, path);

    if (!target.startsWith("/workspace/")) {
      throw new Error("File paths must stay inside the sandbox workspace.");
    }

    const result = await run(context, `realpath -m -- ${shellQuote(target)}`);
    const canonical = result.stdout.trim();

    if (result.exitCode !== 0 || !canonical.startsWith("/workspace/")) {
      throw new Error("File paths must stay inside the sandbox workspace.");
    }

    return canonical;
  };

  const read = async (path: string, context: FxToolContext) => {
    const session = await dependencies.session(context);
    const canonical = await resolvePath(context, path);

    const content = await session.readFileToBuffer(
      { path: canonical },
      { signal: context.signal }
    );

    if (!content) {
      throw new Error(`File not found: ${path}`);
    }

    return content.toString("utf-8");
  };

  const write = async (
    path: string,
    content: string,
    context: FxToolContext
  ) => {
    const canonical = await resolvePath(context, path);

    const directory = await run(
      context,
      `mkdir -p -- ${shellQuote(posix.dirname(canonical))}`
    );

    if (directory.exitCode !== 0) {
      throw new Error(directory.stderr);
    }

    const session = await dependencies.session(context);
    await session.writeFiles([
      { content: Buffer.from(content), path: canonical },
    ]);

    return `Wrote ${path}`;
  };

  return [
    {
      description:
        "Read a UTF-8 file in the sandbox, including the provisioned skill guides.",
      execute: async (input: z.input<typeof fileSchema>, context) =>
        await read(fileSchema.parse(input).file_path, context),
      idempotent: true,
      inputSchema: z.toJSONSchema(fileSchema),
      name: "read",
    },
    {
      description: "Write a UTF-8 file in the sandbox.",
      execute: async (input: z.input<typeof writeSchema>, context) => {
        const parsed = writeSchema.parse(input);

        return await write(parsed.file_path, parsed.content, context);
      },
      idempotent: false,
      inputSchema: z.toJSONSchema(writeSchema),
      name: "write",
      writes: true,
    },
    {
      description:
        "Replace one unique occurrence of old_string in a sandbox file.",
      execute: async (input: z.input<typeof editSchema>, context) => {
        const parsed = editSchema.parse(input);
        const content = await read(parsed.file_path, context);
        const index = content.indexOf(parsed.old_string);

        if (
          index === -1 ||
          content.includes(parsed.old_string, index + parsed.old_string.length)
        ) {
          throw new Error(
            "old_string must match exactly once. Read the file and include more context."
          );
        }

        return await write(
          parsed.file_path,
          content.slice(0, index) +
            parsed.new_string +
            content.slice(index + parsed.old_string.length),
          context
        );
      },
      idempotent: false,
      inputSchema: z.toJSONSchema(editSchema),
      name: "edit",
      writes: true,
    },
    {
      description:
        "Run a shell command in /workspace/app inside the sandbox. Also use for ls, grep and file searches. Inspect the workspace before retrying an interrupted command.",
      execute: async (input: z.input<typeof bashSchema>, context) => {
        const parsed = bashSchema.parse(input);

        return await run(context, parsed.command, parsed.timeout);
      },
      idempotent: false,
      inputSchema: z.toJSONSchema(bashSchema),
      name: "bash",
      writes: true,
    },
    {
      description:
        "Format, test, build and publish the app. Inspect deployment status before retrying an interrupted publication.",
      execute: async (_input: Record<string, never>, context) =>
        await deployTool.execute(
          {},
          {
            abortSignal: context.signal,
            context: await dependencies.deploy(context),
            messages: [],
            toolCallId: context.executionId,
          }
        ),
      idempotent: false,
      inputSchema: {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
      name: "deploy",
      writes: true,
    },
  ];
};
