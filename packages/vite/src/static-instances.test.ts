import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import * as v from "valibot";
import { build, createLogger } from "vite";
import type { UserConfig } from "vite";
import { expect, it } from "vite-plus/test";

import { patchsmith } from "#index";
import { linkTestDependencies } from "#test-utils";

import { patchsmithUploadManifestSchema } from "./builder/upload-manifest";

const withApp = async (check: (root: string) => Promise<void>) => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-static-build-"));

  try {
    await linkTestDependencies(root);
    await mkdir(path.join(root, "src/slots/page"), { recursive: true });
    await mkdir(path.join(root, "src/slots/panel"), { recursive: true });
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { name: "Static App", slug: "static-app", host: "https://host.test" };'
    );
    await writeFile(
      path.join(root, "src/labels.ts"),
      'export const label = "Reports";'
    );
    await writeFile(
      path.join(root, "src/slots/page/index.view.tsx"),
      `
import { appendFile } from "node:fs/promises";
import { defineView } from "patchsmith/client";
import { z } from "zod";
import { label } from "#labels";
export default defineView({ component: () => "STATIC_COMPONENT", instances: {
  cache: "static",
  dataSchema: z.object({ id: z.string().transform(value => value.toUpperCase()) }),
  resolve: async () => {
    await appendFile(${JSON.stringify(path.join(root, "calls.txt"))}, "resolved\\n");
    return [{ key: "reports", metadata: { label }, data: { id: "STATIC_RESOLVER_ONLY:" + BUILD_LABEL } }];
  },
} });
`
    );
    await writeFile(
      path.join(root, "src/slots/panel/index.view.tsx"),
      'import view from "../page/index.view"; export default { ...view, slot: "panel" };'
    );
    await writeFile(
      path.join(root, "src/slots/page/dynamic.view.tsx"),
      `
import { defineView } from "patchsmith/client";
import { z } from "zod";
export default defineView({ component: () => "DYNAMIC_COMPONENT", instances: {
  cache: "none", dataSchema: z.object({}),
  resolve: () => { throw new Error("DYNAMIC_RESOLVER_MUST_NOT_RUN"); },
} });
`
    );
    await check(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const buildApp = async (
  root: string,
  watch = false,
  overrides: Pick<UserConfig, "plugins" | "resolve"> = {}
) => {
  const result = await build({
    build: { watch: watch ? {} : null },
    configFile: false,
    define: { BUILD_LABEL: JSON.stringify("production") },
    plugins: [
      patchsmith({ configPath: path.join(root, "patchsmith.config.mjs") }),
      ...(overrides.plugins ?? []),
    ],
    resolve: {
      ...overrides.resolve,
      alias: { "#labels": path.join(root, "src/labels.ts") },
    },
    root,
  });

  if ("on" in result) {
    const ready = Promise.withResolvers<ReturnType<() => void>>();
    result.on("event", (event) => {
      if (event.code === "END") {
        ready.resolve();
      }

      if (event.code === "ERROR") {
        ready.reject(event.error);
      }
    });
    await ready.promise;
  }

  return result;
};

const readManifest = async (root: string) =>
  v.parse(
    patchsmithUploadManifestSchema,
    JSON.parse(
      await readFile(
        path.join(root, ".patchsmith/patchsmith-upload.json"),
        "utf-8"
      )
    )
  );

it("preserves aliases supplied by a later client-only post config hook", async () => {
  await withApp(async (root) => {
    const filename = path.join(root, "src/slots/page/index.view.tsx");
    const source = await readFile(filename, "utf-8");
    await writeFile(
      filename,
      source
        .replace("#labels", "#late-labels")
        .replace('"STATIC_COMPONENT"', "label")
    );
    await writeFile(
      path.join(root, "src/labels.ts"),
      'export const label = "LATE_ALIAS_CLIENT_AND_STATIC";'
    );
    await buildApp(root, false, {
      plugins: [
        {
          apply: (_config, env) => env.isSsrBuild !== true,
          config: {
            handler: () => ({
              resolve: {
                alias: { "#late-labels": path.join(root, "src/labels.ts") },
              },
            }),
            order: "post",
          },
          enforce: "post",
          name: "late-client-alias",
        },
      ],
    });
    expect(
      await readFile(path.join(root, ".patchsmith/client/client.js"), "utf-8")
    ).toContain("LATE_ALIAS_CLIENT_AND_STATIC");
    const manifest = await readManifest(root);
    expect(
      manifest.views?.find((view) => view.slot === "page" && view.path === "/")
        ?.staticInstances?.[0]?.metadata.label
    ).toBe("LATE_ALIAS_CLIENT_AND_STATIC");
  });
});

it.each([
  { name: "defaults", resolve: undefined },
  {
    name: "explicit client options",
    resolve: {
      builtins: [/^node:/u],
      conditions: ["custom"],
      mainFields: ["custom"],
    },
  },
])(
  "uses server resolver $name for static instances and backend builds",
  async ({ resolve }) => {
    await withApp(async (root) => {
      await Promise.all(
        ["conditional", "legacy"].map(async (name) => {
          const directory = path.join(root, "node_modules", name);
          await mkdir(directory);
          await writeFile(
            path.join(directory, "package.json"),
            JSON.stringify({
              type: "module",
              ...(name === "conditional"
                ? {
                    exports: Object.fromEntries([
                      ["custom", "./custom.js"],
                      ["browser", "./browser.js"],
                      ["node", "./node.js"],
                      ["default", "./main.js"],
                    ]),
                  }
                : {
                    browser: "./browser.js",
                    custom: "./custom.js",
                    main: "./main.js",
                    module: "./module.js",
                  }),
            })
          );

          await Promise.all(
            ["browser", "node", "custom", "module", "main"].map(
              async (entry) => {
                await writeFile(
                  path.join(directory, `${entry}.js`),
                  `export default ${JSON.stringify(entry.toUpperCase())};`
                );
              }
            )
          );
        })
      );

      await writeFile(
        path.join(root, "src/labels.ts"),
        'import conditional from "conditional"; import legacy from "legacy"; export const label = conditional + ":" + legacy;'
      );
      await mkdir(path.join(root, "src/functions"));
      await writeFile(
        path.join(root, "src/functions/example.router.ts"),
        'import { defineRouter, fn } from "patchsmith/server"; import { label } from "#labels"; export default defineRouter({ read: fn.query.handler(() => label) });'
      );
      const warnings: string[] = [];
      const logger = createLogger("silent");
      logger.warn = (message) => {
        warnings.push(message);
      };

      await buildApp(root, false, {
        plugins: [
          {
            config: (config) => {
              const isServerBuild =
                config.build?.ssr !== undefined &&
                config.build.ssr !== false &&
                config.build.ssr !== "";

              return isServerBuild ? { customLogger: logger } : undefined;
            },
            name: "capture-server-warnings",
          },
        ],
        resolve,
      });
      expect(
        warnings.filter((message) =>
          message.includes("Automatically externalized")
        )
      ).toEqual([]);
      const manifest = await readManifest(root);
      expect(
        manifest.views?.find(
          (view) => view.path === "/" && view.slot === "page"
        )?.staticInstances?.[0]?.metadata.label
      ).toBe("NODE:MODULE");
      expect(
        await readFile(path.join(root, ".patchsmith/server/server.js"), "utf-8")
      ).toContain("NODE:MODULE");
    });
  }
);

it("builds transformed snapshots once per resolver and keeps implementations out of deployed bundles", async () => {
  await withApp(async (root) => {
    await buildApp(root);
    const manifest = await readManifest(root);

    const entries = [
      {
        data: { id: "STATIC_RESOLVER_ONLY:PRODUCTION" },
        key: "reports",
        metadata: { label: "Reports" },
      },
    ];

    expect(manifest.views).toEqual([
      { instances: true, path: "/dynamic", slot: "page" },
      { instances: true, path: "/", slot: "page", staticInstances: entries },
      { instances: true, path: "/", slot: "panel", staticInstances: entries },
    ]);
    expect(await readFile(path.join(root, "calls.txt"), "utf-8")).toBe(
      "resolved\n"
    );

    const client = await readFile(
      path.join(root, ".patchsmith/client/client.js"),
      "utf-8"
    );

    const server = await readFile(
      path.join(root, ".patchsmith/server/server.js"),
      "utf-8"
    );

    expect(client).toContain("STATIC_COMPONENT");
    expect(client).not.toContain("STATIC_RESOLVER_ONLY");
    expect(client).not.toContain("DYNAMIC_RESOLVER_MUST_NOT_RUN");
    expect(server).toContain("DYNAMIC_RESOLVER_MUST_NOT_RUN");
    expect(server).not.toContain("STATIC_RESOLVER_ONLY");
    expect(server).not.toContain("STATIC_COMPONENT");
    expect(
      JSON.parse(
        await readFile(
          path.join(root, ".patchsmith/client/views.json"),
          "utf-8"
        )
      )
    ).toEqual(manifest.views);
  });
});

it("refreshes static snapshots when an extracted dependency changes in watch mode", async () => {
  await withApp(async (root) => {
    const watcher = await buildApp(root, true);

    if (!("close" in watcher)) {
      throw new Error("Expected watch build");
    }

    try {
      await writeFile(
        path.join(root, "src/labels.ts"),
        'export const label = "Updated reports";'
      );
      await expect
        .poll(async () => {
          const manifest = await readManifest(root);

          return manifest.views?.find(
            (view) => view.slot === "page" && view.path === "/"
          )?.staticInstances?.[0]?.metadata.label;
        })
        .toBe("Updated reports");
    } finally {
      await watcher.close();
    }
  });
});

it("fails the build on invalid static output without falling back to runtime resolution", async () => {
  await withApp(async (root) => {
    const filename = path.join(root, "src/slots/page/index.view.tsx");
    const original = await readFile(filename, "utf-8");

    await writeFile(
      filename,
      original.replace('id: "STATIC_RESOLVER_ONLY:" + BUILD_LABEL', "id: 42")
    );
    await expect(buildApp(root)).rejects.toThrow(
      "Unable to build static instances"
    );
  });
});
