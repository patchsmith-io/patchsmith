import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vite-plus/test";
import { z } from "zod";

const { join } = nodePath;

// oxlint-disable-next-line typescript/strict-void-return -- promisify consumes the callback, not the ChildProcess return value.
const execute = promisify(execFile);

it("preserves source across a killed tool call so a new conversation can inspect and recover without repeating it", async () => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "patchsmith-fx-crash-"))
  );

  const fixture = new URL("fixtures/harness-crash.ts", import.meta.url);

  try {
    await expect(
      execute(process.execPath, [fixture.pathname, directory, "start"], {
        timeout: 15_000,
      })
    ).rejects.toMatchObject({ code: 73 });
    expect(await readFile(join(directory, "app/artifact.txt"), "utf-8")).toBe(
      "saved"
    );

    const { stdout } = await execute(
      process.execPath,
      [fixture.pathname, directory, "recover"],
      { timeout: 15_000 }
    );

    const output = z
      .object({ finishReason: z.literal("stop"), requests: z.literal(2) })
      .parse(JSON.parse(stdout.trim()));

    expect(output.finishReason).toBe("stop");
    expect(await readFile(join(directory, "app/executions.txt"), "utf-8")).toBe(
      "once\n"
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}, 35_000);
