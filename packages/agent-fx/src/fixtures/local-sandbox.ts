import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { promisify } from "node:util";

import type { Experimental_SandboxSession } from "ai";

const { dirname } = nodePath;

// oxlint-disable-next-line typescript/strict-void-return -- promisify consumes execFile's completion callback, not its ChildProcess return value.
const execute = promisify(execFile);
const bytes = async (path: string) => await readFile(path).catch(() => null);

const write = async (path: string, content: Uint8Array | string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

/** The real fx adapter talks to this disposable filesystem and shell. */
export const localSession = (
  workspace: string,
  sessionHome: string
): Experimental_SandboxSession => ({
  description: "Disposable fx integration fixture",
  readBinaryFile: async ({ path }) => await bytes(path),
  readFile: async ({ path }) => {
    const content = await bytes(path);

    return content
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(content);
            controller.close();
          },
        })
      : null;
  },
  readTextFile: async ({ path }) => {
    const content = await bytes(path);

    return content?.toString("utf-8") ?? null;
  },
  run: async ({ command, env: commandEnv, workingDirectory, abortSignal }) => {
    if (command === `printf '%s' "$HOME" | base64 -w0`) {
      return {
        exitCode: 0,
        stderr: "",
        stdout: Buffer.from(sessionHome).toString("base64"),
      };
    }

    const gnu = "/opt/homebrew/opt/coreutils/libexec/gnubin";
    const path = existsSync(gnu) ? `${gnu}:/usr/bin:/bin` : "/usr/bin:/bin";

    const { stdout, stderr } = await execute("bash", ["-c", command], {
      cwd: workingDirectory ?? workspace,
      env: { PATH: path, ...commandEnv },
      signal: abortSignal,
    });

    return { exitCode: 0, stderr, stdout };
  },
  spawn: () => {
    throw new Error("fx must not spawn a sandbox bridge.");
  },
  writeBinaryFile: async ({ path, content }) => {
    await write(path, content);
  },
  writeFile: async ({ path, content }) => {
    const chunks: Uint8Array[] = [];

    for await (const chunk of content) {
      chunks.push(chunk);
    }

    await write(path, Buffer.concat(chunks));
  },
  writeTextFile: async ({ path, content }) => {
    await write(path, content);
  },
});
