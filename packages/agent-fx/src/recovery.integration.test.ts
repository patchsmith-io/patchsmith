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

const outputSchema = z.object({
  requests: z.array(z.string()),
  result: z.object({ stopReason: z.string() }),
});

it.each(["completed", "interrupted", "idempotent"])(
  "recovers a killed native process with a %s tool call",
  async (scenario) => {
    const directory = await realpath(
      await mkdtemp(join(tmpdir(), "patchsmith-fx-crash-"))
    );

    const fixture = new URL("fixtures/native-crash.mjs", import.meta.url);

    try {
      await expect(
        execute(
          process.execPath,
          [fixture.pathname, directory, scenario, "start"],
          { timeout: 15_000 }
        )
      ).rejects.toMatchObject({ code: 73 });

      const { stdout } = await execute(
        process.execPath,
        [fixture.pathname, directory, scenario, "resume"],
        { timeout: 15_000 }
      );

      const output = outputSchema.parse(JSON.parse(stdout.trim()));
      expect(output.result.stopReason).toBe("end_turn");

      const executionLog = await readFile(
        join(directory, "executions.txt"),
        "utf-8"
      );

      const executions = executionLog.trim().split("\n");
      expect(executions).toHaveLength(scenario === "idempotent" ? 2 : 1);
      expect(new Set(executions).size).toBe(1);
      expect(await readFile(join(directory, "artifact.txt"), "utf-8")).toBe(
        "done"
      );

      if (scenario === "completed") {
        expect(output.requests.join("\n")).toContain("Effect completed");
      }

      if (scenario === "interrupted") {
        expect(output.requests.join("\n")).toContain("interrupt");
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  },
  35_000
);
