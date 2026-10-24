import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vite-plus/test";

import { buildProject } from "./build";
import { linkTestDependencies } from "./test-utils";

it("builds the app's Vite config with custom plugins, aliases, constants and output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-vite-config-"));

  try {
    await linkTestDependencies(root);
    await mkdir(path.join(root, "src/functions"), { recursive: true });
    await mkdir(path.join(root, "config"));
    await mkdir(path.join(root, "assets"));

    const logo =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>';

    await writeFile(path.join(root, "assets/logo.svg"), logo);
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      path.join(root, "config/patchsmith.config.mjs"),
      'export default { name: "Test App", slug: "test-app", host: "https://host.test", logos: { dark: "logo.svg", light: "logo.svg" } };'
    );
    await writeFile(
      path.join(root, "src/message.ts"),
      'export const message = "CUSTOM_ALIAS";'
    );
    await writeFile(
      path.join(root, "src/root.tsx"),
      `
      import { defineRoute } from "patchsmith/client";
      import { message } from "@/message";
      import value from "virtual:example";
      export default defineRoute({ shellComponent: () => message + value + CUSTOM_CONSTANT });
    `
    );
    await writeFile(
      path.join(root, "src/functions/example.router.ts"),
      `
      import { defineRouter, fn } from "patchsmith/server";
      import { message } from "@/message";
      import value from "virtual:example";
      export default defineRouter({ read: fn.query.handler(() => message + value + CUSTOM_CONSTANT) });
    `
    );
    await writeFile(
      path.join(root, "vite.config.mjs"),
      `
      import { patchsmith } from "patchsmith/vite";
      export default {
        plugins: [patchsmith({ configPath: "./config/patchsmith.config.mjs" }), {
          name: "example-transform",
          resolveId(id) { if (id === "virtual:example") return "\\0example"; },
          load(id) { if (id === "\\0example") return 'export default "CUSTOM_PLUGIN";'; },
        }],
        resolve: { alias: { "@": import.meta.dirname + "/src" } },
        define: { CUSTOM_CONSTANT: JSON.stringify("CUSTOM_DEFINE") },
        build: { outDir: "artifacts", sourcemap: true },
      };
    `
    );
    const { outDir } = await buildProject({ cwd: root });
    expect(outDir).toBe(path.join(await realpath(root), "artifacts"));
    await Promise.all(
      ["client/client.js", "server/server.js"].map(async (filename) => {
        const source = await readFile(path.join(outDir, filename), "utf-8");
        expect(source).toContain("CUSTOM_ALIAS");
        expect(source).toContain("CUSTOM_PLUGIN");
        expect(source).toContain("CUSTOM_DEFINE");
      })
    );
    expect(
      JSON.parse(
        await readFile(path.join(outDir, "patchsmith-upload.json"), "utf-8")
      )
    ).toMatchObject({
      assets: {
        client: "client/client.js",
        logos: { dark: "logo.svg", light: "logo.svg" },
        server: "server/server.js",
        static: [{ contentLength: Buffer.byteLength(logo), path: "logo.svg" }],
      },
    });
    expect(await readFile(path.join(outDir, "assets/logo.svg"), "utf-8")).toBe(
      logo
    );
    await expect(
      readFile(path.join(outDir, "client/logo-light.svg"))
    ).rejects.toThrow();
    expect(
      await readFile(path.join(outDir, "client/client.js.map"), "utf-8")
    ).toBeTruthy();
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it("requires the Patchsmith plugin when deploying", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-missing-plugin-"));

  try {
    await linkTestDependencies(root);
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(path.join(root, "vite.config.mjs"), "export default {};");
    await expect(buildProject({ cwd: root })).rejects.toThrow(
      "Add patchsmith()"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
