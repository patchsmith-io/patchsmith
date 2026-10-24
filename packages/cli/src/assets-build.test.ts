import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vite-plus/test";

import { buildProject } from "./build";
import { linkTestDependencies } from "./test-utils";

declare global {
  var __patchsmithAssetTestUrls: string[] | undefined;
}

it("builds assetUrl and ?url references into a portable client with hashed external files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-assets-build-"));

  try {
    await linkTestDependencies(root);
    await mkdir(path.join(root, "src/slots/page"), { recursive: true });
    await mkdir(path.join(root, "assets/game"), { recursive: true });
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { name: "Game", slug: "game", host: "https://host.test" };'
    );
    await writeFile(
      path.join(root, "vite.config.mjs"),
      'import { patchsmith } from "patchsmith/vite"; export default { plugins: [patchsmith({ configPath: "patchsmith.config.mjs" })] };'
    );
    const content = Buffer.from("BINARY_GAME_FILE");
    const hash = createHash("sha256").update(content).digest("hex");
    await writeFile(path.join(root, "assets/game/doom.wad"), content);
    await writeFile(
      path.join(root, "src/slots/page/index.view.tsx"),
      `import { assetUrl, defineView } from "patchsmith/client";
      import importedUrl from "../../../assets/game/doom.wad?url";
      const url = assetUrl("game/doom.wad");
      globalThis.__patchsmithAssetTestUrls = [url, importedUrl];
      export default defineView({ component: () => null });`
    );
    const { outDir } = await buildProject({ cwd: root });

    const source = await readFile(
      path.join(outDir, "client/client.js"),
      "utf-8"
    );

    expect(source).not.toContain("BINARY_GAME_FILE");
    expect(source).toContain(hash);
    expect(await readFile(path.join(outDir, "assets/game/doom.wad"))).toEqual(
      content
    );

    const manifest = await readFile(
      path.join(outDir, "patchsmith-upload.json"),
      "utf-8"
    );

    expect(JSON.parse(manifest)).toMatchObject({
      assets: {
        static: [
          {
            checksum: hash,
            contentLength: content.byteLength,
            path: "game/doom.wad",
          },
        ],
      },
    });
    globalThis.__patchsmithAppUrl =
      "https://proj00000001.tailorkit.app/a/app000000001/d/deploy000001/client/client.js";
    await import(
      `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    );
    const expected = `https://proj00000001.tailorkit.app/a/app000000001/assets/${hash}/game/doom.wad`;
    expect(globalThis.__patchsmithAssetTestUrls).toEqual([expected, expected]);
  } finally {
    delete globalThis.__patchsmithAssetTestUrls;
    delete globalThis.__patchsmithAppUrl;
    delete globalThis.__patchsmithAssets;
    await rm(root, { force: true, recursive: true });
  }
});
