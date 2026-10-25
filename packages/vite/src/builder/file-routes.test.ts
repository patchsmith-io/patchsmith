import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  readFile,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { build } from "vite";
import { assert, expect, it } from "vite-plus/test";

import { patchsmith } from "#index";
import { linkTestDependencies } from "#test-utils";

import { readClientManifest } from "./client-views";
import {
  discoverFileRoutes,
  inferFileView,
  getClientSourceFiles,
  fileViewLocation,
} from "./file-routes";

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

it.each([
  ["index", "/"],
  ["members/index", "/members"],
  ["members.index", "/members"],
  ["members/details", "/members/details"],
  ["members.details.index", "/members/details"],
  ["index.details", "/index/details"],
  ["index.index", "/index"],
  ["home", "/home"],
])("maps %s.view.tsx to %s", (name, view) => {
  expect(
    fileViewLocation(`/app/src/slots/panel/${name}.view.tsx`, "/app")
  ).toEqual({ path: view, slot: "panel" });
});

it("infers dotted paths and literal slot names while checking explicit declarations", () => {
  const filename = "/app/src/slots/panel.links/customers.details.view.tsx";

  const source =
    'import { defineView as view } from "patchsmith/client"; export default view({ component: () => null });';

  const inferred = inferFileView(source, filename, "/app");
  expect(inferred).toContain('slot: "panel.links"');
  expect(inferred).toContain('view: "/customers/details"');
  expect(inferFileView(inferred, filename, "/app")).toBe(inferred);

  const explicit = source.replace(
    "component:",
    'slot: "panel.links", view: "/customers/details", component:'
  );

  expect(inferFileView(explicit, filename, "/app")).toBe(explicit);
  expect(inferFileView(source, "/app/src/slots/panel/card.tsx", "/app")).toBe(
    source
  );
  expect(() =>
    inferFileView(source, "/app/src/slots/panel/a..b.view.tsx", "/app")
  ).toThrow("empty route segment");
});

it.each([
  ['view: "/"', 'view must be "/customers/details"'],
  ['view: "/customers"', 'view must be "/customers/details"'],
  ['slot: "other"', 'slot must be "panel"'],
  ["view: contextPath", 'view must be "/customers/details"'],
  ['view: "/customers/details", ...options', "use named defineView properties"],
  ['[field]: "/"', "use named defineView properties"],
  ['get view() { return "/"; }', 'view must be "/customers/details"'],
  ['["view"]: "/"', 'view must be "/customers/details"'],
])("rejects file route declarations with %s", (properties, message) => {
  expect(() =>
    inferFileView(
      `import { defineView } from "patchsmith/client"; export default defineView({ ${properties}, component: () => null });`,
      "/app/src/slots/panel/customers.details.view.tsx",
      "/app"
    )
  ).toThrow(message);
});

it.each([
  "patchsmith/client",
  "patchsmith/app",
  "patchsmith/app/client",
  "@patchsmith/app/client",
  "@patchsmith/app",
])("infers namespace defineView calls imported from %s", (module) => {
  const filename = "/app/src/slots/panel/customers.details.view.tsx";

  for (const call of ["client.defineView", 'client["defineView"]']) {
    const source = `import * as client from ${JSON.stringify(module)}; export default ${call}({ component: () => null });`;
    const inferred = inferFileView(source, filename, "/app");
    expect(inferred).toContain('slot: "panel"');
    expect(inferred).toContain('view: "/customers/details"');
    expect(inferFileView(inferred, filename, "/app")).toBe(inferred);

    const explicit = source.replace(
      "component:",
      'slot: "panel", view: "/customers/details", component:'
    );

    expect(inferFileView(explicit, filename, "/app")).toBe(explicit);
    expect(() =>
      inferFileView(
        source.replace("{ component: () => null }", "options"),
        filename,
        "/app"
      )
    ).toThrow("inline options object");
  }

  const unrelated =
    'import * as client from "./other-client"; export default client.defineView({ component: () => null });';

  expect(inferFileView(unrelated, filename, "/app")).toBe(unrelated);
  const otherMethod = `import * as client from ${JSON.stringify(module)}; export default client.defineRoute({ shellComponent: () => null });`;
  expect(inferFileView(otherMethod, filename, "/app")).toBe(otherMethod);
});

it.each([
  ["parameter", "function unrelated($name) { return $call(options); }"],
  [
    "destructured parameter",
    "function unrelated({ $name }) { return $call(options); }",
  ],
  ["arrow parameter", "const unrelated = ($name) => $call(options);"],
  [
    "block",
    "function unrelated() { { const $name = other; return $call(options); } }",
  ],
  [
    "hoisted var",
    "function unrelated() { $call(options); if (true) { var $name = other; } }",
  ],
  [
    "hoisted function",
    "function unrelated() { $call(options); function $name() {} }",
  ],
  ["catch", "try { other(); } catch ($name) { $call(options); }"],
  ["loop", "for (const $name of others) { $call(options); }"],
  [
    "switch",
    "switch (choice) { case 1: $call(options); break; case 2: const $name = other; }",
  ],
  [
    "function name",
    "const unrelated = function $name() { return $call(options); };",
  ],
  [
    "class name",
    "const unrelated = class $name { static run() { return $call(options); } };",
  ],
])("ignores imported defineView names shadowed by a %s", (_scope, body) => {
  const filename = "/app/src/slots/panel/index.view.tsx";

  for (const [imports, name, call] of [
    ['import { defineView as view } from "patchsmith/client";', "view", "view"],
    [
      'import * as client from "patchsmith/client";',
      "client",
      "client.defineView",
    ],
  ] as const) {
    const unrelated = body.replaceAll("$name", name).replaceAll("$call", call);
    const source = `${imports}\n${unrelated}\nexport default ${call}({ component: () => null });`;
    const inferred = inferFileView(source, filename, "/app");
    expect(inferred).toContain(unrelated);
    expect(inferred.match(/slot:/gu)).toHaveLength(1);
    expect(inferred).toContain('slot: "panel"');
    expect(inferred).toContain('view: "/"');
  }
});

it("keeps SDK references in closures and parameter defaults outside body declarations", () => {
  const source = `import * as client from "patchsmith/client";
    function helper(options = client.defineView({ component: () => null })) { var client = other; }
    const view = () => client.defineView({ component: () => null });
    export default view();`;

  const inferred = inferFileView(
    source,
    "/app/src/slots/panel/index.view.tsx",
    "/app"
  );

  expect(inferred.match(/slot:/gu)).toHaveLength(2);
});

it("discovers only view and layout files, supports roots, and checks the same sources on deploy", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-file-discovery-"));

  try {
    await mkdir(path.join(root, "src/slots/panel.links/components"), {
      recursive: true,
    });
    await Promise.all(
      [
        "root.tsx",
        "slots/panel.links/root.tsx",
        "slots/panel.links/layout.tsx",
        "slots/panel.links/customers.layout.tsx",
        "slots/panel.links/customers.details.view.tsx",
        "slots/panel.links/components/card.tsx",
      ].map(async (file) => {
        await writeFile(path.join(root, "src", file), "export default {}; ");
      })
    );
    const discovered = await discoverFileRoutes(root);
    expect(
      discovered.views.map(({ slot, filename }) => [
        slot,
        path.basename(filename),
      ])
    ).toEqual([["panel.links", "customers.details.view.tsx"]]);
    expect(discovered.layouts.map(({ path: route }) => route)).toEqual([
      "/customers",
      "/",
    ]);
    expect(discovered.roots.map(({ slot }) => slot)).toEqual(["panel.links"]);
    expect(await getClientSourceFiles(root)).toHaveLength(5);
    await writeFile(path.join(root, "src/client.ts"), "export default {};");
    expect(await getClientSourceFiles(root)).toHaveLength(5);
    expect(await getClientSourceFiles(root)).not.toContain(
      path.join(root, "src/client.ts")
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

const withFileRouteApp = async (check: (root: string) => Promise<void>) => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-file-build-"));

  try {
    await linkTestDependencies(root);
    await mkdir(path.join(root, "src/slots/page"), { recursive: true });
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { name: "Test App", slug: "test-app", host: "https://host.example.com" };'
    );
    await writeFile(
      path.join(root, "src/root.tsx"),
      'import { defineRoute, ClientProvider } from "patchsmith/client"; export default defineRoute({ shellComponent: ClientProvider });'
    );
    await writeFile(
      path.join(root, "src/slots/page/root.tsx"),
      'import { defineRoute, Route } from "patchsmith/client"; export default defineRoute({ shellComponent: () => <Route /> });'
    );
    await writeFile(
      path.join(root, "src/slots/page/layout.tsx"),
      'import { Route } from "patchsmith/client"; export default () => <Route />;'
    );
    await writeFile(
      path.join(root, "src/slots/page/index.view.tsx"),
      `import * as client from "patchsmith/client"; import { z } from "zod";
      export default client.defineView({ view: "/", component: () => "leaf", instances: { dataSchema: z.object({}), resolve: () => [{ key: "all", metadata: { title: "PRIVATE_RESOLVER" }, data: {} }] } });`
    );
    await writeFile(
      path.join(root, "src/slots/page/card.tsx"),
      'throw new Error("Ordinary components are not routes");'
    );
    await check(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

it("builds file routes with extracted private instance resolvers", async () => {
  await withFileRouteApp(async (root) => {
    await buildFixture({ cwd: root });
    const manifestFile = path.join(root, ".patchsmith/client/client.js");
    const manifest = await readClientManifest(manifestFile);
    expect(manifest.views).toEqual([
      { instances: true, path: "/", slot: "page" },
    ]);
    expect(await readFile(manifestFile, "utf-8")).not.toContain(
      "PRIVATE_RESOLVER"
    );
    expect(
      await readFile(path.join(root, ".patchsmith/server/server.js"), "utf-8")
    ).toContain("PRIVATE_RESOLVER");
  });
});

it.each(["add", "rename", "remove"] as const)(
  "discovers a file route %s in watch mode",
  async (change) => {
    await withFileRouteApp(async (root) => {
      const next = path.join(root, "src/slots/page/customers.details.view.tsx");

      const renamed = path.join(
        root,
        "src/slots/page/customers.summary.view.tsx"
      );

      const viewSource =
        'import * as client from "patchsmith/client"; import { z } from "zod"; export default client["defineView"]({ component: () => "details", instances: { dataSchema: z.object({}), resolve: () => [{ key: "details", metadata: { title: "INFERRED_RESOLVER" }, data: {} }] } });';

      if (change === "rename") {
        await writeFile(next, viewSource);
      }

      if (change === "remove") {
        await writeFile(renamed, viewSource);
      }

      const watcher = await buildFixture({ cwd: root, watch: true });
      assert("on" in watcher);

      try {
        const paths = async () => {
          const current = await readClientManifest(
            path.join(root, ".patchsmith/client/client.js")
          );

          return current.views.map((view) => view.path).toSorted();
        };

        if (change === "add") {
          await writeFile(next, viewSource);
          await expect.poll(paths).toEqual(["/", "/customers/details"]);

          return;
        }

        if (change === "rename") {
          await rename(next, renamed);
          await expect.poll(paths).toEqual(["/", "/customers/summary"]);

          return;
        }

        await rm(path.join(root, "src/slots/page/index.view.tsx"));
        await expect.poll(paths).toEqual(["/customers/summary"]);
        await expect
          .poll(async () => {
            const server = await readFile(
              path.join(root, ".patchsmith/server/server.js"),
              "utf-8"
            );

            return server.includes("PRIVATE_RESOLVER");
          })
          .toBe(false);
      } finally {
        await watcher.close();
      }
    });
  }
);

it.each([
  ['view: "/index"', 'view must be "/"'],
  ['slot: "other"', 'slot must be "panel"'],
])(
  "fails the build for a mismatched file route: %s",
  async (declaration, message) => {
    const root = await mkdtemp(
      path.join(tmpdir(), "patchsmith-invalid-route-")
    );

    try {
      await linkTestDependencies(root);
      await mkdir(path.join(root, "src/slots/panel"), { recursive: true });
      await writeFile(path.join(root, "package.json"), '{"type":"module"}');
      await writeFile(
        path.join(root, "patchsmith.config.mjs"),
        'export default { name: "Test App", slug: "test-app", host: "https://host.example.com" };'
      );
      await writeFile(
        path.join(root, "src/slots/panel/index.view.tsx"),
        `import { defineView } from "patchsmith/client"; export default defineView({ ${declaration}, component: () => "home" });`
      );
      await expect(buildFixture({ cwd: root })).rejects.toThrow(message);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);

it("checks re-exported view paths against their file locations during the build", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-reexport-route-"));

  try {
    await linkTestDependencies(root);
    await mkdir(path.join(root, "src/slots/panel"), { recursive: true });
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { name: "Test App", slug: "test-app", host: "https://host.example.com" };'
    );
    const card = path.join(root, "src/slots/panel/card.tsx");

    const source =
      'import { defineView } from "patchsmith/client"; export default defineView({ slot: "panel", view: "/", component: () => "home" });';

    await writeFile(card, source);
    await writeFile(
      path.join(root, "src/slots/panel/index.view.tsx"),
      'export { default } from "./card";'
    );
    await buildFixture({ cwd: root });
    await writeFile(card, source.replace('view: "/"', 'view: "/wrong"'));
    await expect(buildFixture({ cwd: root })).rejects.toThrow(
      "Unable to read app views"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it("resolves client and server runtimes from the app when build output is outside the project", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-file-client-"));

  const output = await mkdtemp(
    path.join(tmpdir(), "patchsmith-external-output-")
  );

  try {
    await linkTestDependencies(root);
    await mkdir(path.join(root, "src/slots/panel"), { recursive: true });
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { name: "Test App", slug: "test-app", host: "https://host.example.com" };'
    );
    await writeFile(
      path.join(root, "src/slots/panel/index.view.tsx"),
      'import { defineView } from "patchsmith/client"; export default defineView({ view: "/", component: () => "home" });'
    );
    await buildFixture({ cwd: root, outDir: output });

    const manifest = await readClientManifest(
      path.join(output, "client/client.js")
    );

    expect(manifest.views).toEqual([{ path: "/", slot: "panel" }]);
    expect(
      await readFile(path.join(output, "server/server.js"), "utf-8")
    ).toContain("runtimeManifest");
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(output, { force: true, recursive: true });
  }
});
