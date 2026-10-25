/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access -- This integration fixture loads workspace or generated modules dynamically and supplies minimal platform doubles; its assertions validate the observed runtime contract. */
import {
  cp,
  readFile,
  writeFile,
  rm,
  readdir,
  rename,
  mkdtemp,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  PatchsmithClientWithMeta,
  ViewDefinition,
  ViewInstance,
} from "@patchsmith/app/client";
import type {
  ApplicationModule,
  FunctionDefinition,
} from "@patchsmith/app/server";
import { Window } from "happy-dom";
import type { VNode } from "preact";
import * as v from "valibot";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { patchsmith } from "#index";
import { linkTestDependencies, createDatabaseTestApp } from "#test-utils";

import { readClientManifest } from "./client-views";
import { runtimeManifest } from "./server";

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error("Expected a defined value.");
  }

  return value;
};

const buildFixture = async (options: {
  cwd: string;
  configPath?: string;
  outDir?: string;
  watch?: boolean;
}) => {
  const result = await build({
    build: {
      outDir: options.outDir,
      watch: options.watch === true ? {} : null,
    },
    configFile: false,
    plugins: [
      patchsmith({
        configPath: path.resolve(
          options.cwd,
          options.configPath ?? "patchsmith.config.mjs"
        ),
      }),
    ],
    root: options.cwd,
  });

  if ("on" in result) {
    const initialBuild = Promise.withResolvers<ReturnType<() => void>>();
    result.on("event", (event) => {
      if (event.code === "END") {
        initialBuild.resolve();
      }

      if (event.code === "ERROR") {
        initialBuild.reject(event.error);
      }
    });
    await initialBuild.promise;
  }

  return result;
};

declare module "@patchsmith/app/client" {
  interface PatchsmithViews {
    "/": { context: { workspaceId: string } };
  }
}

const router = (
  keys: string
) => `import { defineRouter, fn } from "patchsmith/server";
      const read = fn.query.handler(() => { throw new Error("HANDLERS_MUST_NOT_RUN_DURING_BUILDS"); });
      export default defineRouter({ ${keys} });`;

it.each([
  {
    error: undefined,
    first: "get: { children: read }",
    second: "parents: read",
  },
  {
    error: "Duplicate function: api.family.get.children",
    first: "get: { children: read }",
    second: "children: read",
  },
  {
    error: "Function/namespace conflict: api.family.get",
    first: "get: read",
    second: "parents: read",
  },
])(
  "validates merged routers when loading the bundle: $first / $second",
  async ({ first, second, error }) => {
    const root = await mkdtemp(
      path.join(tmpdir(), "patchsmith-function-build-")
    );

    try {
      await linkTestDependencies(root);
      await mkdir(path.join(root, "src/functions/family"), { recursive: true });
      await writeFile(path.join(root, "package.json"), '{"type":"module"}');
      await writeFile(
        path.join(root, "patchsmith.config.mjs"),
        'export default { name: "Test App", slug: "test-app", host: "https://host.test" };'
      );
      await mkdir(path.join(root, "src/slots"), { recursive: true });
      await writeFile(
        path.join(root, "src/slots/root.tsx"),
        'import { defineRoute } from "patchsmith/client"; export default defineRoute({ shellComponent: () => "client" });'
      );

      await writeFile(
        path.join(root, "src/functions/family.router.ts"),
        router(first)
      );
      await writeFile(
        path.join(root, "src/functions/family/get.router.ts"),
        router(second)
      );

      await buildFixture({ cwd: root });

      const loaded = import(
        pathToFileURL(path.join(root, ".patchsmith/server/server.js")).href
      );

      if (error !== undefined) {
        await expect(loaded).rejects.toThrow(error);
        await expect(loaded).rejects.toThrow("src/functions/family.router.ts");
        await expect(loaded).rejects.toThrow(
          "src/functions/family/get.router.ts"
        );

        return;
      }

      const application: ApplicationModule = await loaded;

      expect(application.default.functions).toMatchObject({
        family: {
          get: { children: { kind: "query" }, parents: { kind: "query" } },
        },
      });
      expect(
        await readFile(path.join(root, ".patchsmith/client/client.js"), "utf-8")
      ).not.toContain("HANDLERS_MUST_NOT_RUN");

      const watcher = await buildFixture({ cwd: root, watch: true });

      if (!("close" in watcher)) {
        throw new Error("Expected a build watcher");
      }

      const artifact = path.join(root, ".patchsmith/server/server.js");
      const types = path.join(root, "src/patchsmith.functions.gen.ts");

      try {
        const extra = path.join(root, "src/functions/extra.router.ts");
        await writeFile(extra, router("added: read"));
        await expect
          .poll(async () => await readFile(artifact, "utf-8"), {
            timeout: 5000,
          })
          .toContain("src/functions/extra.router.ts");
        await expect
          .poll(async () => await readFile(types, "utf-8"))
          .toContain("./functions/extra.router");
        await rename(extra, path.join(root, "src/functions/renamed.router.ts"));
        await expect
          .poll(async () => await readFile(artifact, "utf-8"), {
            timeout: 5000,
          })
          .toContain("src/functions/renamed.router.ts");
        await rm(path.join(root, "src/functions/renamed.router.ts"));
        await expect
          .poll(async () => await readFile(artifact, "utf-8"), {
            timeout: 5000,
          })
          .not.toContain("src/functions/renamed.router.ts");
        await expect
          .poll(async () => await readFile(types, "utf-8"))
          .not.toContain("renamed.router");
      } finally {
        await watcher.close();
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);

it.each([
  {
    marker: "SERVER_MODULE_SCOPE_EXECUTED",
    source: 'throw new Error("SERVER_MODULE_SCOPE_EXECUTED");',
  },
  {
    marker: "WebSocketPair",
    source: "globalThis.workerSockets = new WebSocketPair();",
  },
])(
  "builds without evaluating backend module-scope code: $marker",
  async ({ marker, source }) => {
    const root = await mkdtemp(path.join(tmpdir(), "patchsmith-server-scope-"));

    try {
      await linkTestDependencies(root);
      await mkdir(path.join(root, "src/functions"), { recursive: true });
      await writeFile(path.join(root, "package.json"), '{"type":"module"}');
      await writeFile(
        path.join(root, "patchsmith.config.mjs"),
        'export default { name: "Test App", slug: "test-app", host: "https://host.test" };'
      );
      await mkdir(path.join(root, "src/slots"), { recursive: true });
      await writeFile(
        path.join(root, "src/slots/root.tsx"),
        'import { defineRoute } from "patchsmith/client"; export default defineRoute({ shellComponent: () => "client" });'
      );
      await writeFile(
        path.join(root, "src/functions/example.router.ts"),
        `${source}\n${router("read")}`
      );

      await buildFixture({ cwd: root });

      const server = await readFile(
        path.join(root, ".patchsmith/server/server.js"),
        "utf-8"
      );

      expect(server).toContain(marker);
      expect(
        await readFile(path.join(root, ".patchsmith/client/client.js"), "utf-8")
      ).not.toContain(marker);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);

it("builds file routes with discovered functions and blocks server imports from the browser", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-custom-entries-"));

  try {
    await linkTestDependencies(root);
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { appId: "configured-app", name: "Test App", slug: "test-app", host: "https://host.example.com" };'
    );
    await Promise.all(
      ["src/functions"].map(async (directory) => {
        await mkdir(path.join(root, directory), { recursive: true });
      })
    );

    const client =
      'import { defineRoute } from "patchsmith/client"; export default defineRoute({ shellComponent: () => "Configured client loaded" });';

    await mkdir(path.join(root, "src/slots"), { recursive: true });
    await writeFile(path.join(root, "src/slots/root.tsx"), client);
    await writeFile(
      path.join(root, "src/functions/helper.ts"),
      'export const value = "Lazy server helper";'
    );
    await writeFile(
      path.join(root, "src/functions/example.router.ts"),
      'import { defineRouter, fn } from "patchsmith/server"; export default defineRouter({ configured: fn.query.handler(() => "Configured server loaded"), hidden: fn.query.internal().handler(() => "Internal server result"), lazy: fn.action.handler(async () => (await import("./helper")).value) });'
    );
    await buildFixture({ cwd: root });
    expect(await readdir(path.join(root, ".patchsmith/server"))).toEqual([
      "server.js",
    ]);
    expect(await readdir(path.join(root, ".patchsmith/tmp"))).toEqual([]);

    const browser = await readFile(
      path.join(root, ".patchsmith/client/client.js"),
      "utf-8"
    );

    const server = await readFile(
      path.join(root, ".patchsmith/server/server.js"),
      "utf-8"
    );

    expect(browser).toContain("Configured client loaded");
    expect(server).toContain("Configured server loaded");
    expect(server).toContain("Lazy server helper");
    expect(server).not.toContain("./assets/");

    const application: ApplicationModule = await import(
      pathToFileURL(path.join(root, ".patchsmith/server/server.js")).href
    );

    expect(application.runtimeManifest).toEqual(runtimeManifest);
    expect(application.runtimeManifest.requires).toContain("nested-actions");
    expect(application.runtimeManifest.requires).not.toContain("hooks");
    expect(application.runtimeManifest.requires).toContain(
      "internal-functions"
    );
    expect(application.default.functions).toMatchObject({
      example: {
        configured: { kind: "query", visibility: "public" },
        hidden: { kind: "query", visibility: "internal" },
      },
    });
    expect(application.migrations).toEqual([]);
    expect(browser).not.toContain("Configured server loaded");
    expect(browser).not.toContain("Internal server result");
    // The host deployment tool must build beneath the app so the generated
    // temporary server entry can resolve patchsmith/server from node_modules.
    const deploymentOutput = path.join(root, ".patchsmith/agent-deployment");
    await buildFixture({ cwd: root, outDir: deploymentOutput });
    expect(
      await readFile(path.join(deploymentOutput, "server/server.js"), "utf-8")
    ).toContain("Configured server loaded");
    expect(
      JSON.parse(
        await readFile(
          path.join(deploymentOutput, "patchsmith-upload.json"),
          "utf-8"
        )
      )
    ).toMatchObject({
      appId: "configured-app",
      assets: { client: "client/client.js", server: "server/server.js" },
    });
    await mkdir(path.join(root, "src/slots"), { recursive: true });
    await writeFile(
      path.join(root, "src/slots/root.tsx"),
      `import type app from "../functions/example.router";\n${client}`
    );
    await expect(buildFixture({ cwd: root })).resolves.toBeDefined();
    await mkdir(path.join(root, "src/slots"), { recursive: true });
    await writeFile(
      path.join(root, "src/slots/root.tsx"),
      `import "../functions/example.router";\n${client}`
    );
    await expect(buildFixture({ cwd: root })).rejects.toThrow(
      "cannot be imported into a browser bundle"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it.each(
  ["fn", "router"].flatMap((suffix) => [
    { specifier: `../functions/private.${suffix}.ts`, suffix },
    { specifier: `#functions/private.${suffix}`, suffix },
  ])
)(
  "blocks browser imports of plain server modules through $specifier",
  async ({ suffix, specifier }) => {
    const root = await mkdtemp(path.join(tmpdir(), "patchsmith-server-only-"));

    try {
      await linkTestDependencies(root);
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          imports: { "#functions/*": "./src/functions/*.ts" },
          type: "module",
        })
      );
      await writeFile(
        path.join(root, "patchsmith.config.mjs"),
        'export default { name: "Test App", slug: "test-app", host: "https://host.example.com" };'
      );
      await mkdir(path.join(root, "src/functions"), { recursive: true });
      await writeFile(
        path.join(root, `src/functions/private.${suffix}.ts`),
        'export const secret = "Server-only literal";'
      );

      await mkdir(path.join(root, "src/slots"), { recursive: true });
      await writeFile(
        path.join(root, "src/slots/root.tsx"),
        `import { defineRoute } from "patchsmith/client"; import { secret } from ${JSON.stringify(specifier)}; export default defineRoute({ shellComponent: () => secret });`
      );
      await expect(buildFixture({ cwd: root })).rejects.toThrow(
        "cannot be imported into a browser bundle"
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);

it("builds and declares an empty backend without server configuration", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-empty-backend-"));

  try {
    await linkTestDependencies(root);
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { name: "Test App", slug: "test-app", host: "https://host.test" };'
    );
    await mkdir(path.join(root, "src/slots"), { recursive: true });
    await writeFile(
      path.join(root, "src/slots/root.tsx"),
      'import { defineRoute } from "patchsmith/client"; export default defineRoute({ shellComponent: () => "client" });'
    );

    await buildFixture({ cwd: root });

    const application: ApplicationModule = await import(
      pathToFileURL(path.join(root, ".patchsmith/server/server.js")).href
    );

    expect(application.default.functions).toEqual({});
    expect(application.migrations).toEqual([]);
    expect(application.runtimeManifest).toEqual(runtimeManifest);
    expect(
      await readFile(
        path.join(root, "src/patchsmith.functions.gen.ts"),
        "utf-8"
      )
    ).toContain("Record<never, never>");
    expect(
      JSON.parse(
        await readFile(
          path.join(root, ".patchsmith/patchsmith-upload.json"),
          "utf-8"
        )
      )
    ).toMatchObject({
      assets: { client: "client/client.js", server: "server/server.js" },
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

describe("database app builds", () => {
  let template: string | undefined;

  beforeAll(async () => {
    template = await mkdtemp(
      path.join(tmpdir(), "patchsmith-database-template-")
    );
    await createDatabaseTestApp(template);
  });
  afterAll(async () => {
    if (template !== undefined) {
      await rm(template, { force: true, recursive: true });
    }
  });

  const withDatabaseApp = async (check: (root: string) => Promise<void>) => {
    const source = requireValue(template);
    const root = await mkdtemp(path.join(tmpdir(), "patchsmith-server-build-"));

    try {
      // Generate migrations once, then give each build its own sources and outputs.
      await Promise.all(
        ["package.json", "patchsmith.config.mjs", "src"].map(
          async (filename) => {
            await cp(path.join(source, filename), path.join(root, filename), {
              recursive: true,
            });
          }
        )
      );
      await linkTestDependencies(root);
      await check(root);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  };

  it.each([".", "src"])(
    "builds %s source without exposing server code to the browser",
    async (directory) => {
      await withDatabaseApp(async (root) => {
        if (directory === ".") {
          for (const name of await readdir(path.join(root, "src"))) {
            // oxlint-disable-next-line no-await-in-loop -- Move each fixture source before removing its old directory.
            await rename(path.join(root, "src", name), path.join(root, name));
          }

          await rm(path.join(root, "src"), { recursive: true });
        }

        const source = path.join(root, directory);

        const readSources = async () => {
          const directories = await Promise.all(
            ["slots", "functions", "db"].map(async (folder) => {
              const files = await readdir(path.join(source, folder), {
                recursive: true,
              });

              return files.map((name) => path.join(folder, name));
            })
          );

          return directories.flat().toSorted();
        };

        const sourceFiles = await readSources();

        await buildFixture({ cwd: root });

        const browser = await readFile(
          path.join(root, ".patchsmith/client/client.js"),
          "utf-8"
        );

        const server = await readFile(
          path.join(root, ".patchsmith/server/server.js"),
          "utf-8"
        );

        // Keep a small app below this budget, including its schemas and ORM.
        expect(Buffer.byteLength(server)).toBeLessThan(150_000);
        expect(server).not.toContain("patchsmith_receipts");
        expect(server).not.toContain("cloudflare:workers");
        expect(server).not.toContain("node:async_hooks");
        expect(server).not.toContain(
          "CREATE TABLE IF NOT EXISTS patchsmith_migrations"
        );
        expect(server).toContain("CREATE TABLE `todos`");
        expect(browser).not.toContain("patchsmith_migrations");
        expect(browser).not.toContain("CREATE TABLE `todos`");
        expect(browser).not.toContain("patchsmith_receipts");
        expect(browser).not.toContain("PRIVATE_DATABASE_TEST");
        expect(browser).not.toContain("cloudflare:workers");
        expect(browser).not.toContain("jwtVerify");
        expect(browser).not.toContain("SignJWT");
        expect(await readSources()).toEqual(sourceFiles);
        expect(
          await readFile(
            path.join(source, "patchsmith.functions.gen.ts"),
            "utf-8"
          )
        ).toContain("./functions/todos.router");
        expect(
          JSON.parse(
            await readFile(
              path.join(root, ".patchsmith/patchsmith-upload.json"),
              "utf-8"
            )
          ).assets
        ).toEqual({ client: "client/client.js", server: "server/server.js" });

        const migrationFiles = await readdir(
          path.join(source, "db/migrations"),
          {
            recursive: true,
          }
        );

        expect(
          await readdir(path.join(root, ".patchsmith/migrations"), {
            recursive: true,
          })
        ).toEqual(migrationFiles);
        await Promise.all(
          migrationFiles
            .filter((filename) => filename.endsWith("migration.sql"))
            .map(async (file) => {
              expect(
                await readFile(
                  path.join(root, ".patchsmith/migrations", file),
                  "utf-8"
                )
              ).toBe(
                await readFile(
                  path.join(source, "db/migrations", file),
                  "utf-8"
                )
              );
            })
        );
      });
    }
  );

  it("preserves the client bundle and migrations with custom output", async () => {
    await withDatabaseApp(async (root) => {
      await buildFixture({ cwd: root });

      const browser = await readFile(
        path.join(root, ".patchsmith/client/client.js"),
        "utf-8"
      );

      const migrationFiles = await readdir(
        path.join(root, "src/db/migrations"),
        {
          recursive: true,
        }
      );

      await buildFixture({ cwd: root, outDir: ".patchsmith/custom" });
      expect(
        await readFile(
          path.join(root, ".patchsmith/custom/client/client.js"),
          "utf-8"
        )
      ).toBe(browser);

      const customServer = await readFile(
        path.join(root, ".patchsmith/custom/server/server.js"),
        "utf-8"
      );

      expect(customServer).not.toContain(
        "CREATE TABLE IF NOT EXISTS patchsmith_migrations"
      );
      expect(customServer).toContain("CREATE TABLE `todos`");
      expect(
        await readdir(path.join(root, ".patchsmith/custom/migrations"), {
          recursive: true,
        })
      ).toEqual(migrationFiles);
    });
  });

  it.each([
    "../functions/todos.router",
    "patchsmith/server",
    "patchsmith/internal/server",
    "@patchsmith/app/internal/server",
    "patchsmith/db",
    "@patchsmith/app-db",
    "effect",
  ])("rejects the browser's accidental import of %s", async (specifier) => {
    await withDatabaseApp(async (root) => {
      const clientPath = path.join(root, "src/slots/root.tsx");
      const client = await readFile(clientPath, "utf-8");
      await writeFile(
        clientPath,
        `import ${JSON.stringify(specifier)};\n${client}`
      );
      await expect(buildFixture({ cwd: root })).rejects.toThrow(
        "cannot be imported into a browser bundle"
      );
    });
  });

  it("rejects build output overlapping the migration source", async () => {
    await withDatabaseApp(async (root) => {
      await expect(
        buildFixture({ cwd: root, outDir: "src/db/migrations" })
      ).rejects.toThrow("must not overlap migration source");
    });
  });
});

it("builds colocated instance resolvers as query-only server actions", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "patchsmith-instances-build-")
  );

  try {
    await linkTestDependencies(root);
    await mkdir(path.join(root, "src/slots/page"), { recursive: true });
    await mkdir(path.join(root, "src/slots/panel.links"), { recursive: true });
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { name: "Test App", slug: "test-app", host: "https://host.example.com" };'
    );
    await mkdir(path.join(root, "src/functions"), { recursive: true });
    await writeFile(
      path.join(root, "src/functions/reports.router.ts"),
      `
      import { defineRouter, fn } from "patchsmith/server";
      export default defineRouter({
        list: fn.query.handler(() => [{ id: "report_123" }]),
        write: fn.mutation.handler(() => "never"),
        external: fn.action.handler(() => Promise.resolve("never")),
      });
    `
    );
    await writeFile(
      path.join(root, "src/private.ts"),
      'export function title(id: string) { return "PRIVATE_SERVER_ONLY:" + id; }'
    );

    const viewSource = `
      import { defineView } from "patchsmith/client";
      import { z } from "zod";
      import { title } from "../../private";
      const privatePrefix = (() => "PRIVATE_INITIALIZER")();
      const view = defineView({ slot: "page", view: "/",
        instances: {
          dataSchema: z.object({ id: z.string().transform(v => v.toUpperCase()) }),
          resolve: async ({ queries, context, identity, signal, ...other }) => {
            if (Object.keys(other).length) throw new Error("Unexpected resolver capabilities");
            if (Object.keys(queries.reports).join() !== "list") throw new Error("Unexpected query capabilities");
            const reports = await queries.reports.list();
            return reports.map(report => ({ key: report.id, metadata: { title: title(context.userId) + privatePrefix }, data: { id: report.id } }));
          },
        },
        component: () => "BROWSER_COMPONENT_MUST_NOT_RUN:" + view.useInstance().data.id,
      });
      export default view;
    `;

    await writeFile(
      path.join(root, "src/slots/page/index.view.tsx"),
      viewSource
    );
    await writeFile(
      path.join(root, "src/slots/panel.links/index.view.tsx"),
      'import view from "../page/index.view"; export default { ...view, slot: "panel.links" };'
    );
    await buildFixture({ cwd: root });

    const browser = await readFile(
      path.join(root, ".patchsmith/client/client.js"),
      "utf-8"
    );

    const server = await readFile(
      path.join(root, ".patchsmith/server/server.js"),
      "utf-8"
    );

    expect(browser).not.toContain("PRIVATE_SERVER_ONLY");
    expect(browser).not.toContain("PRIVATE_INITIALIZER");
    expect(browser).not.toContain("Unexpected resolver capabilities");
    expect(browser).toContain("BROWSER_COMPONENT_MUST_NOT_RUN");
    expect(server).toContain("PRIVATE_SERVER_ONLY");
    expect(server).not.toContain("BROWSER_COMPONENT_MUST_NOT_RUN");

    const application: ApplicationModule = await import(
      pathToFileURL(path.join(root, ".patchsmith/server/server.js")).href
    );

    // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This controlled fixture supplies only the platform members exercised by the test, or deliberately invalid input for runtime validation.
    const internal = application.default.functions._patchsmith as Record<
      string,
      Record<
        string,
        FunctionDefinition<
          "action",
          v.GenericSchema,
          v.InferOutput<v.GenericSchema>,
          ApplicationModule["default"]["functions"]
        > & { functions: ApplicationModule["default"]["functions"] }
      >
    >;

    const manifest = await readClientManifest(
      path.join(root, ".patchsmith/client/client.js")
    );

    const names = [
      ...new Set(manifest.instanceResolvers.map((entry) => entry.resolver)),
    ];

    expect(names).toHaveLength(1);
    expect(Object.keys(requireValue(internal.instances))).toEqual(["resolve"]);
    expect(manifest.views).toEqual([
      { instances: true, path: "/", slot: "page" },
      { instances: true, path: "/", slot: "panel.links" },
    ]);
    const fn = requireValue(requireValue(internal.instances).resolve);
    expect(fn.kind).toBe("action");
    expect(browser).toContain(requireValue(names[0]));
    expect(Object.keys(requireValue(fn.functions.reports))).toEqual(["list"]);
    // SAFETY: This test deliberately crosses the static type boundary to verify that runtime validation rejects the invalid input.

    const resolved = await fn.handler(
      /* oxlint-disable typescript/no-unsafe-type-assertion -- This test deliberately crosses the static type boundary to verify that runtime validation rejects the invalid input. */
      {
        args: v.parse(fn.args, {
          context: { userId: "user_123" },
          path: "/",
          slot: "page",
        }),
        identity: { userId: "user_123" },
        mutations: {},
        queries: {
          reports: { list: vi.fn().mockResolvedValue([{ id: "report_123" }]) },
        },
        signal: new AbortController().signal,
      } as never
      /* oxlint-enable typescript/no-unsafe-type-assertion */
    );

    expect(resolved).toEqual([
      {
        data: { id: "REPORT_123" },
        key: "report_123",
        metadata: { title: "PRIVATE_SERVER_ONLY:user_123PRIVATE_INITIALIZER" },
      },
    ]);
    // SAFETY: This test deliberately crosses the static type boundary to verify that runtime validation rejects the invalid input.

    const shared = await fn.handler(
      /* oxlint-disable typescript/no-unsafe-type-assertion -- This test deliberately crosses the static type boundary to verify that runtime validation rejects the invalid input. */
      {
        args: v.parse(fn.args, {
          context: { userId: "user_123" },
          path: "/",
          slot: "panel.links",
        }),
        identity: { userId: "user_123" },
        queries: {
          reports: { list: vi.fn().mockResolvedValue([{ id: "report_123" }]) },
        },
        signal: new AbortController().signal,
      } as never
      /* oxlint-enable typescript/no-unsafe-type-assertion */
    );

    expect(shared).toEqual(resolved);
    const window = new Window();
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: window.document,
    });

    try {
      const module = await import(
        `data:text/javascript;base64,${Buffer.from(browser).toString("base64")}`
      );

      // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
      const client =
        /* oxlint-disable typescript/no-unsafe-type-assertion -- The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below. */
        module.default as PatchsmithClientWithMeta;

      /* oxlint-enable typescript/no-unsafe-type-assertion */
      // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
      const component = (
        client.slots as Record<string, Record<string, ViewDefinition>>
      ).page?.["/"];

      expect(component).toBeTruthy();

      if (!component) {
        throw new Error("Missing compiled view");
      }

      const container = document.createElement("div");

      // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
      const show = (instance: ViewInstance) => {
        client.$runtime.render(
          /* oxlint-disable typescript/no-unsafe-type-assertion -- The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below. */
          // SAFETY: This fixture controls the asserted value and verifies the runtime boundary below.
          client.$runtime.h(component.component, {
            context: { workspaceId: "w1" },
            instance,
            status: "ready",
            view: "/",
          }) as VNode,
          /* oxlint-enable typescript/no-unsafe-type-assertion */
          container
        );
      };

      const instances = v.parse(
        v.array(
          v.object({
            data: v.unknown(),
            key: v.string(),
            metadata: v.record(v.string(), v.unknown()),
          })
        ),
        resolved
      );

      show(requireValue(instances[0]));
      expect(container.textContent).toBe(
        "BROWSER_COMPONENT_MUST_NOT_RUN:REPORT_123"
      );
      show({ data: { id: "SUMMARY" }, key: "summary", metadata: {} });
      expect(container.textContent).toBe(
        "BROWSER_COMPONENT_MUST_NOT_RUN:SUMMARY"
      );
      // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
      client.$runtime.render(
        /* oxlint-disable typescript/no-unsafe-type-assertion -- The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below. */
        client.$runtime.h(component.component, {
          status: "loading",
          view: "/",
        }) as VNode,
        /* oxlint-enable typescript/no-unsafe-type-assertion */
        container
      );
      expect(container.textContent).toBe("");
      client.$runtime.render(null, container);
    } finally {
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: previousDocument,
        });
      }

      await window.happyDOM.close();
    }

    await buildFixture({ cwd: root, outDir: ".patchsmith/custom" });
    expect(
      await readFile(
        path.join(root, ".patchsmith/custom/client/client.js"),
        "utf-8"
      )
    ).toBe(browser);

    const watcher = await buildFixture({
      cwd: root,
      outDir: ".patchsmith/watched",
      watch: true,
    });

    if (!("close" in watcher)) {
      throw new TypeError("Expected a Vite watcher");
    }

    const watchedServer = path.join(
      root,
      ".patchsmith/watched/server/server.js"
    );

    try {
      expect(await readFile(watchedServer, "utf-8")).toContain(
        "PRIVATE_SERVER_ONLY"
      );
      await writeFile(
        path.join(root, "src/private.ts"),
        'export function title(id: string) { return "PRIVATE_UPDATED:" + id; }'
      );
      await expect
        .poll(async () => {
          const awaitedResult1 = await readFile(watchedServer, "utf-8");

          return awaitedResult1.includes("PRIVATE_UPDATED");
        })
        .toBe(true);
      await writeFile(
        path.join(root, "src/slots/page/index.view.tsx"),
        viewSource.replace("PRIVATE_INITIALIZER", "RESOLVER_UPDATED")
      );
      await expect
        .poll(async () => {
          const awaitedResult2 = await readFile(watchedServer, "utf-8").catch(
            () => ""
          );

          return awaitedResult2.includes("RESOLVER_UPDATED");
        })
        .toBe(true);
      // The server watcher can finish while the client watcher is still
      // rebuilding and has temporarily cleared its output directory.
      await expect
        .poll(
          async () =>
            await readFile(
              path.join(root, ".patchsmith/watched/client/client.js"),
              "utf-8"
            ).catch(() => "")
        )
        .toContain(requireValue(names[0]));
      await rm(path.join(root, "src/slots/page/index.view.tsx"));
      await rm(path.join(root, "src/slots/panel.links/index.view.tsx"));
      await expect
        .poll(async () => {
          const output = await readFile(watchedServer, "utf-8").catch(() => "");

          return !!output && !output.includes("RESOLVER_UPDATED");
        })
        .toBe(true);

      const withoutInstances: ApplicationModule = await import(
        `${pathToFileURL(watchedServer).href}?instances-removed`
      );

      expect(
        Object.hasOwn(withoutInstances.default.functions, "_patchsmith")
      ).toBe(false);
    } finally {
      await watcher.close();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
