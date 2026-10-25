import { execFile } from "node:child_process";
import { promisify } from "node:util";

import * as v from "valibot";

import { patchsmithUploadManifestSchema } from "./upload-manifest";

// Inspect the developer's bundled client in a short-lived build process, never on the platform.
const inspectClient = `
import { readFile } from "node:fs/promises";
const source = await readFile(process.argv[1], "utf8");
globalThis.__patchsmithAppUrl = "https://build.invalid/a/000000000000/d/000000000000/client/client.js";
const { default: client } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
if (!client?.slots || typeof client.slots !== "object") throw new Error("Invalid generated app client: missing slots");
const instanceResolvers = [];
const views = Object.entries(client.slots).flatMap(([slot, definitions]) =>
  Object.entries(definitions).flatMap(([path, view]) => {
    if (view === false) return [{ slot, path, disabled: true }];
    const resolver = view?.instances?.resolver;
    if (resolver !== undefined) instanceResolvers.push({ slot, path, resolver, ...(view.instances.cache === "static" ? { cache: "static" } : {}) });
    return [{ slot, path, ...(resolver !== undefined ? { instances: true } : {}) }];
  })
);
process.stdout.write("\\nPATCHSMITH_VIEWS=" + JSON.stringify({ views, instanceResolvers }));
process.exit(0);
`;

export const readClientManifest = async (filename: string) => {
  try {
    // oxlint-disable-next-line typescript/strict-void-return -- Node explicitly supports promisify(execFile); its ChildProcess return is intentionally ignored by the callback-to-Promise adapter.
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--input-type=module", "--eval", inspectClient, filename],
      { maxBuffer: 2 * 1024 * 1024, timeout: 10_000 }
    );

    const result = stdout.slice(
      stdout.lastIndexOf("\nPATCHSMITH_VIEWS=") + "\nPATCHSMITH_VIEWS=".length
    );

    const manifest = v.parse(
      v.object({
        instanceResolvers: v.array(
          v.object({
            cache: v.optional(v.literal("static")),
            path: v.string(),
            resolver: v.pipe(v.string(), v.regex(/^i[0-9a-f]{24}$/u)),
            slot: v.string(),
          })
        ),
        views: v.unwrap(patchsmithUploadManifestSchema.entries.views),
      }),
      JSON.parse(result)
    );

    return manifest;
  } catch (error) {
    throw new Error(
      "Unable to read app views during the build. Keep browser-only side effects inside components or effects. Check the default exports of your roots, layouts and .view.tsx files.",
      { cause: error }
    );
  }
};

export const readClientViews = async (filename: string) => {
  const awaitedResult1 = await readClientManifest(filename);

  return awaitedResult1.views.filter((view) => !view.disabled);
};
