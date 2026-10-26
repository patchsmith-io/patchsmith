import { readFileSync } from "node:fs";

import { defineConfig } from "vite-plus";

import packageJson from "./package.json" with { type: "json" };

export default defineConfig({
  pack: {
    deps: { neverBundle: Object.keys(packageJson.dependencies) },
    dts: true,
    entry: ["src/index.ts", "src/workflows.ts", "src/server.ts"],
    format: "esm",
    plugins: [
      {
        load: (id) =>
          id.endsWith(".md?raw")
            ? `export default ${JSON.stringify(readFileSync(id.slice(0, -4), "utf-8"))};`
            : undefined,
        name: "instructions-raw",
      },
    ],
    target: "node24",
  },
});
