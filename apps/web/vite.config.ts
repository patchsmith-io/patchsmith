import { rm } from "node:fs/promises";
import nodePath from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { build, createNitro, prepare } from "nitro/builder";
import type { Nitro, NitroModule } from "nitro/types";
import { nitro } from "nitro/vite";
import { defineConfig, lazyPlugins } from "vite-plus";
import { workflow } from "workflow/vite";

import { env } from "#env";

const { resolve } = nodePath;

interface ServerFunction {
  name: string;
  destination: string;
  maxDuration?: number;
  queueTopic?: string;
}

interface ApiFunction extends ServerFunction {
  route: string;
  source: string;
}

const apiFunctions: ApiFunction[] = [
  {
    name: "libfx",
    route: "/api/libfx/wake",
    source: "^/api/libfx/wake/?$",
    destination: "api/libfx/wake",
    maxDuration: 800,
    queueTopic: "__libfx_wkf_workflow_session",
  },
  {
    name: "reconcile",
    route: "/api/libfx/reconcile",
    source: "^/api/libfx/reconcile/?$",
    destination: "api/libfx/reconcile",
  },
  {
    name: "mcp",
    route: "/api/platform/app-agent/mcp",
    source: "^/api/platform/app-agent/mcp/?$",
    destination: "api/platform/app-agent/mcp",
    // MCP streams stay open for the entire durable agent turn.
    maxDuration: 1800,
  },
  {
    name: "platform",
    route: "/api/platform/**",
    source: "^/api/platform(?:/.*)?$",
    destination: "api/platform/[...]",
  },
  {
    name: "auth",
    route: "/api/auth/**",
    source: "^/api/auth(?:/.*)?$",
    destination: "api/auth/[...]",
  },
  {
    name: "rpc",
    route: "/api/rpc/**",
    source: "^/api/rpc(?:/.*)?$",
    destination: "api/rpc/[...]",
  },
  {
    name: "assets",
    route: "/api/assets/**",
    source: "^/api/assets(?:/.*)?$",
    destination: "api/assets/[...]",
  },
];

const buildServerFunction = async (
  server: Nitro,
  entry: ServerFunction,
  service: string
) => {
  const outputDir = resolve(
    server.options.buildDir,
    "server-functions",
    entry.name,
    "output"
  );

  const functions = { ...server.options.vercel?.functions };

  const destination = resolve(
    server.options.output.dir,
    "functions",
    `${entry.destination}.func`
  );

  if (entry.maxDuration !== undefined) {
    functions.maxDuration = entry.maxDuration;
  }

  if (entry.queueTopic !== undefined) {
    functions.experimentalTriggers = [
      { type: "queue/v2beta", topic: entry.queueTopic, retryAfterSeconds: 5 },
    ];
  }

  // Compile each Vite service separately; functionRules copy the shared output.
  const isolated = await createNitro({
    builder: "rolldown",
    buildDir: resolve(outputDir, "../build"),
    compatibilityDate: server.options.compatibilityDate,
    inlineDynamicImports: false,
    minify: true,
    output: {
      dir: outputDir,
      publicDir: resolve(outputDir, "static"),
      serverDir: destination,
    },
    preset: "vercel",
    rootDir: server.options.rootDir,
    rolldownConfig: { output: { codeSplitting: true } },
    routeRules: server.options.routeRules,
    serverDir: false,
    serverEntry: {
      handler: resolve(
        server.options.buildDir,
        "vite/services",
        service,
        "index.js"
      ),
    },
    // Keep libfx's runtime-relative native addons and durable store modules.
    traceDeps: ["libfx*"],
    vercel: {
      functions,
    },
    workspaceDir: server.options.workspaceDir,
  });

  try {
    // Nitro can emit a symlink to the shared bundle for these routes.
    // Remove it before building directly into the function directory.
    await rm(destination, { force: true, recursive: true });
    await prepare(isolated);
    await build(isolated);
  } finally {
    await isolated.close();
  }
};

const buildServerFunctions = async (server: Nitro) => {
  if (server.options.dev || server.options.preset !== "vercel") {
    return;
  }

  for (const entry of apiFunctions) {
    // oxlint-disable-next-line no-await-in-loop -- Each build runs a bundler; keep them sequential to bound build memory and worker usage.
    await buildServerFunction(server, entry, `api_${entry.name}`);
  }

  // Workflow's callback functions have already copied the shared execution
  // bundle. Replace only the UI fallback with its own SSR dependency graph.
  await buildServerFunction(
    server,
    { name: "ssr", destination: "__server" },
    "ssr"
  );
};

const isolatedServerFunctions: NitroModule = {
  name: "isolated-server-functions",
  setup(server) {
    server.hooks.hook("build:before", () => {
      if (server.options.dev) {
        return;
      }

      // Workflow registers its execution handlers eagerly.
      for (const handler of server.options.handlers) {
        if (handler.route?.startsWith("/.well-known/workflow/")) {
          handler.lazy = true;
        }
      }
    });
    server.hooks.hook("compiled", buildServerFunctions);
  },
};

const serverPackages = [
  "@patchsmith/api",
  "@patchsmith/api-utils",
  "@patchsmith/auth",
  "@patchsmith/db",
  "@patchsmith/env",
  "@patchsmith/observability",
  "libfx",
];

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";
  const isTest = mode === "test";
  const reactPlugin = viteReact({ compiler: true });

  return {
    define: {
      "import.meta.env.VITE_ORG_CREATION_MANAGED": JSON.stringify(
        env.VERCEL_ENV === "production"
      ),
      "import.meta.env.VITE_VERCEL_DEPLOYMENT_ID": JSON.stringify(
        env.VERCEL_DEPLOYMENT_ID ?? ""
      ),
      "import.meta.env.VITE_VERCEL_SKEW_PROTECTION_ENABLED": JSON.stringify(
        env.VERCEL_SKEW_PROTECTION_ENABLED === "1"
      ),
    },
    plugins: isTest
      ? [reactPlugin]
      : lazyPlugins(() => [
          workflow({
            dirs: [resolve(import.meta.dirname, "workflows")],
            runtime: "nodejs24.x",
          }),
          devtools(),
          tailwindcss(),
          tanstackStart({}),
          nitro({
            // Compile API services through Vite so Workflow transforms still apply.
            experimental: {
              vite: {
                services: Object.fromEntries(
                  apiFunctions.map(({ name }) => [
                    `api_${name}`,
                    {
                      entry: resolve(
                        import.meta.dirname,
                        `src/server/api/${name}.ts`
                      ),
                    },
                  ])
                ),
              },
            },
            // Keep libfx beside its native addons and include all platform assets.
            traceDeps: ["libfx*"],
            // Workflow 5 still reads Nitro's legacy externals option when bundling steps.
            // oxlint-disable-next-line unicorn/no-useless-spread -- Workflow 5 reads this Nitro v2 option; Nitro v3 types omit it.
            ...{ externals: { external: ["libfx"] } },
            routes: Object.fromEntries(
              apiFunctions.map(({ name, route }) => [
                route,
                {
                  format: "web",
                  handler: resolve(
                    import.meta.dirname,
                    `src/server/api/${name}.ts`
                  ),
                  lazy: true,
                },
              ])
            ),

            // Split server code into chunks and minify every generated function.
            inlineDynamicImports: false,
            minify: true,
            rolldownConfig: { output: { codeSplitting: true } },
            modules: [isolatedServerFunctions],

            routeRules: {
              "/sign-in": {
                redirect: {
                  status: 308,
                  to: "/login",
                },
              },
              "/signin": {
                redirect: {
                  status: 308,
                  to: "/login",
                },
              },
              "/signup": {
                redirect: {
                  status: 308,
                  to: "/sign-up",
                },
              },
            },

            serverDir: false,

            vercel: {
              config: {
                version: 3,
                routes: apiFunctions.map(({ source, destination }) => ({
                  src: source,
                  dest: `/${destination}`,
                })),
              },
            },

            // Workflow's Nitro builder must resolve package IDs from the same
            // app root as its Vite transform, rather than the monorepo root.
            workspaceDir: import.meta.dirname,
          }),
          reactPlugin,
        ]),
    server: {
      port: 3000,
    },
    ssr: {
      external: isDev ? undefined : serverPackages,
      noExternal: [
        "@patchsmith/api-platform",
        "@patchsmith/agent",
        "@patchsmith/agent-fx",
      ],
    },
  };
});
