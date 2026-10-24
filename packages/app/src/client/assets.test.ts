import { afterEach, expect, it } from "vite-plus/test";

import { assetUrl } from "./assets";

afterEach(() => {
  delete globalThis.__patchsmithAppUrl;
  delete globalThis.__patchsmithAssets;
});

it("resolves the same immutable URL across deployments and source-app installations", () => {
  const hash = "a".repeat(64);
  globalThis.__patchsmithAssets = { "game/doom1.wad": hash };
  const expected = `https://proj00000001.tailorkit.app/a/app000000001/assets/${hash}/game/doom1.wad`;

  globalThis.__patchsmithAppUrl =
    "https://proj00000001.tailorkit.app/a/app000000001/d/deploy000001/client/client.js";
  expect(assetUrl("game/doom1.wad")).toBe(expected);
  globalThis.__patchsmithAppUrl =
    "https://proj00000001.tailorkit.app/a/app000000001/d/deploy000002/client/client.js";
  expect(assetUrl("game/doom1.wad")).toBe(expected);
  globalThis.__patchsmithAppUrl =
    "http://localhost:3000/api/assets/p/proj00000001/a/app000000001/d/deploy000001/client/client.js";
  expect(assetUrl("game/doom1.wad")).toBe(
    `http://localhost:3000/api/assets/p/proj00000001/a/app000000001/assets/${hash}/game/doom1.wad`
  );
  expect(() => assetUrl("toString")).toThrow("Unknown app asset");
  expect(() => assetUrl("../secret")).toThrow("Unknown app asset");
});
