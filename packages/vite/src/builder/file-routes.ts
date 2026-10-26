import { existsSync } from "node:fs";
import { readdir, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import { parseSync } from "vite";
import type { ESTree, Plugin } from "vite";

import { forEachSequential } from "#for-each-sequential";
import { resolveAppSourceRoot } from "#source-root";

import { childNodes, createDefineViewMatcher } from "./define-view";
import { watchSourceDirectory } from "./watch-source-directory";

const clientRuntimeImport = "patchsmith:file-client-runtime";

const routePath = (name: string, filename: string, indexView = false) => {
  const segments = name.split(/[./]/u);

  if (segments.some((segment) => !segment || segment === "..")) {
    throw new Error(
      `${filename} has an empty route segment. Use route.nested-route.view.tsx.`
    );
  }

  if (indexView && segments.at(-1) === "index") {
    segments.pop();
  }

  return `/${segments.join("/")}`;
};

export const fileViewLocation = (
  filename: string,
  root: string
): { path: string; slot: string } | undefined => {
  const relative = path
    .relative(path.join(resolveAppSourceRoot(root), "slots"), filename)
    .split(path.sep);

  if (
    relative.length < 2 ||
    relative[0] === ".." ||
    !filename.endsWith(".view.tsx")
  ) {
    return undefined;
  }

  const [slot, ...routeSegments] = relative;

  if (!(slot !== undefined && slot !== null && slot !== "")) {
    return undefined;
  }

  const basename = routeSegments.join("/").slice(0, -".view.tsx".length);

  return { path: routePath(basename, filename, true), slot };
};

const validateViewOptions = (
  options: ESTree.ObjectExpression,
  expected: { slot: string; view: string },
  filename: string
) => {
  const properties = new Set<string>();

  for (const property of options.properties) {
    if (
      property.type !== "Property" ||
      (property.computed && property.key.type !== "Literal")
    ) {
      throw new Error(
        `${filename}: use named defineView properties so the build can validate the slot and view against the file location.`
      );
    }

    let key: string | undefined;

    if (property.key.type === "Identifier") {
      key = property.key.name;
    } else if (property.key.type === "Literal") {
      key = String(property.key.value);
    }

    if (
      (key === "slot" || key === "view") &&
      (property.kind !== "init" ||
        property.method ||
        property.value.type !== "Literal" ||
        property.value.value !== expected[key])
    ) {
      throw new Error(
        `${filename}: defineView ${key} must be ${JSON.stringify(expected[key])} to match the file location. Omit ${key} to infer it, or move the file to the matching location.`
      );
    }

    if (key !== undefined) {
      properties.add(key);
    }
  }

  return properties;
};

/** Fill missing defineView options before instance extraction, on both build sides. */
export const inferFileView = (
  initialSource: string,
  filename: string,
  root: string
): string => {
  let source = initialSource;

  const location = fileViewLocation(filename, root);

  if (!location) {
    return source;
  }

  const { slot, path: viewPath } = location;
  const parsed = parseSync(filename, source);

  if (parsed.errors.length) {
    throw new Error(`${filename}: ${parsed.errors[0]?.message}`);
  }

  const isDefineViewCall = createDefineViewMatcher(parsed.program);
  const edits: { position: number; text: string }[] = [];

  const visit = (node: ESTree.Node) => {
    if (isDefineViewCall(node)) {
      const [options] = node.arguments;

      if (options?.type !== "ObjectExpression") {
        throw new Error(
          `${filename}: file views require defineView with an inline options object.`
        );
      }

      const properties = validateViewOptions(
        options,
        { slot, view: viewPath },
        filename
      );

      const defaults = [
        properties.has("slot") ? "" : `slot: ${JSON.stringify(slot)},`,
        properties.has("view") ? "" : `view: ${JSON.stringify(viewPath)},`,
      ].join("");

      if (defaults) {
        edits.push({ position: options.start + 1, text: defaults });
      }
    }

    for (const child of childNodes(node)) {
      visit(child);
    }
  };

  visit(parsed.program);

  for (const edit of edits.toSorted((a, b) => b.position - a.position)) {
    source =
      source.slice(0, edit.position) + edit.text + source.slice(edit.position);
  }

  return source;
};

export const discoverFileRoutes = async (root: string) => {
  const views: { filename: string; slot: string; path: string }[] = [];
  const roots: { filename: string; slot: string }[] = [];
  const layouts: { filename: string; slot: string; path: string }[] = [];
  const slotsDir = path.join(resolveAppSourceRoot(root), "slots");

  const scan = async (directory: string, slot?: string, prefix = "") => {
    const entries = await (async () => {
      try {
        return await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return [];
        }

        throw error;
      }
    })();

    await forEachSequential(
      entries.toSorted((a, b) => a.name.localeCompare(b.name)),
      async (entry) => {
        const filename = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          await scan(
            filename,
            slot ?? entry.name,
            slot !== undefined && slot !== null && slot !== ""
              ? `${prefix}${entry.name}/`
              : ""
          );
        } else if (
          entry.isFile() &&
          slot !== undefined &&
          slot !== null &&
          slot !== ""
        ) {
          if (entry.name.endsWith(".view.tsx")) {
            const location = fileViewLocation(filename, root);

            if (location) {
              views.push({ filename, ...location });
            }
          } else if (entry.name === "root.tsx" && !prefix) {
            roots.push({ filename, slot });
          } else if (
            entry.name === "layout.tsx" ||
            entry.name.endsWith(".layout.tsx")
          ) {
            const name =
              entry.name === "layout.tsx"
                ? prefix.replace(/\/$/u, "")
                : prefix + entry.name.slice(0, -".layout.tsx".length);

            layouts.push({
              filename,
              path: name ? routePath(name, filename) : "/",
              slot,
            });
          }
        }
      }
    );
  };

  await scan(slotsDir);
  const rootFile = path.join(resolveAppSourceRoot(root), "slots/root.tsx");

  return {
    layouts,
    root: existsSync(rootFile) ? { filename: rootFile } : undefined,
    roots,
    views,
  };
};

/** Root, layout, view and binding sources to check before deployment. */
export const getClientSourceFiles = async (root: string) => {
  const discovered = await discoverFileRoutes(root);
  const bindings = path.join(resolveAppSourceRoot(root), "patchsmith.gen.ts");

  return [
    ...(discovered.root ? [discovered.root.filename] : []),
    ...discovered.roots.map((module) => module.filename),
    ...discovered.layouts.map((module) => module.filename),
    ...discovered.views.map((module) => module.filename),
    ...(existsSync(bindings) ? [bindings] : []),
  ];
};

const fileClientSource = async (root: string) => {
  const discovered = await discoverFileRoutes(root);

  const imports = [
    `import { createFileClient } from ${JSON.stringify(clientRuntimeImport)};`,
  ];

  let index = 0;

  const module = (entry: { filename: string }) => {
    const binding = `module${(index += 1) - 1}`;
    imports.push(`import ${binding} from ${JSON.stringify(entry.filename)};`);

    return `{ filename: ${JSON.stringify(path.relative(root, entry.filename))}, definition: ${binding}`;
  };

  const rootModule = discovered.root
    ? `${module(discovered.root)} }`
    : "undefined";

  const roots = discovered.roots.map(
    (entry) => `${module(entry)}, slot: ${JSON.stringify(entry.slot)} }`
  );

  const layouts = discovered.layouts.map(
    (entry) =>
      `${module(entry)}, slot: ${JSON.stringify(entry.slot)}, path: ${JSON.stringify(entry.path)} }`
  );

  const views = discovered.views.map(
    (entry) =>
      `${module(entry)}, slot: ${JSON.stringify(entry.slot)}, path: ${JSON.stringify(entry.path)} }`
  );

  return `${imports.join("\n")}\nexport default createFileClient({ root: ${rootModule}, roots: [${roots.join(",")}], layouts: [${layouts.join(",")}], views: [${views.join(",")}] });`;
};

/** A generated entry in build output lets the bundler track imports normally.
 * Directory watching also covers routes that did not exist at the first build. */
export const createFileRouteEntry = async (
  root: string,
  output: string,
  watching: boolean
) => {
  let source = await fileClientSource(root);
  const temporaryRoot = path.join(output, "tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryRoot, "client-"));
  const entry = path.join(directory, "entry.ts");
  await writeFile(entry, source);
  let pending = Promise.resolve();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const refresh = async () => {
    if (closed) {
      return;
    }

    let next: string;

    try {
      next = await fileClientSource(root);
    } catch (error) {
      // Surface discovery errors through the next bundler build.
      next = `throw new Error(${JSON.stringify(error instanceof Error ? error.message : String(error))});`;
    }

    if (next === source) {
      return;
    }

    source = next;
    await writeFile(entry, next);
  };

  const watcher = watching
    ? watchSourceDirectory(root, "slots", () => {
        if (timer) {
          clearTimeout(timer);
        }

        timer = setTimeout(() => {
          pending = (async () => {
            await pending;
            await refresh();
          })();
        }, 25);
      })
    : undefined;

  return {
    close: async () => {
      closed = true;

      if (timer) {
        clearTimeout(timer);
      }

      watcher?.close();

      try {
        await pending;
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
    },
    entry,
  };
};

export const fileRoutesPlugin = (root: () => string): Plugin => ({
  enforce: "pre",
  name: "patchsmith-file-routes",
  async resolveId(id) {
    if (id !== clientRuntimeImport) {
      /* oxlint-disable-next-line unicorn/no-useless-undefined -- The optional result needs an explicit value on every return path. */
      return undefined;
    }

    // Resolve from the app even when its build output is outside the project.
    const importer = path.join(resolveAppSourceRoot(root()), "slots/root.tsx");

    return await ((await this.resolve("patchsmith/client", importer, {
      skipSelf: true,
    })) ??
      this.resolve("@patchsmith/app/client", importer, { skipSelf: true }));
  },
  transform: (source, filename): { code: string; map: null } | undefined => {
    if (!filename.endsWith(".view.tsx")) {
      return undefined;
    }

    const code = inferFileView(source, filename, root());

    return code === source ? undefined : { code, map: null };
  },
});
