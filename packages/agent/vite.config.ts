import { readFileSync } from "node:fs";

import { defineConfig } from "vite-plus";

import packageJson from "./package.json" with { type: "json" };

// oxlint-disable-next-line no-restricted-properties -- Test runner configuration reads CI before application environment validation.
const isCI = process.env.CI === "true" || process.env.CI === "1";

export default defineConfig({
  pack: {
    clean: true,
    deps: { neverBundle: Object.keys(packageJson.dependencies) },
    dts: true,
    entry: [
      "src/threads.ts",
      "src/index.ts",
      "src/workflows.ts",
      "src/mcp.ts",
      "src/source-export.ts",
    ],
    format: "esm",
    minify: false,
    plugins: [
      {
        load: (id) =>
          id.endsWith(".md?raw")
            ? `export default ${JSON.stringify(readFileSync(id.slice(0, -4), "utf-8"))};`
            : undefined,
        name: "instructions-raw",
      },
    ],
    sourcemap: true,
    target: "node24",
  },
  test: {
    // PGlite startup competes with imports in the other files and package tasks.
    maxWorkers: isCI ? 2 : 4,
  },
});
