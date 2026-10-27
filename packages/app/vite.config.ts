import preactPackageJson from "preact/package.json" with { type: "json" };
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    clean: true,
    define: {
      __PREACT_VERSION__: JSON.stringify(preactPackageJson.version),
    },
    dts: false,
    entry: {
      client: "src/client.ts",
      "client-connection": "src/client/connection.ts",
      hooks: "src/hooks.ts",
      index: "src/index.ts",
      protocol: "src/protocol.ts",
      server: "src/server.ts",
      "server-internal": "src/server/internal.ts",
    },
    fixedExtension: false,
    format: "esm",
    target: "node22",
  },
});
