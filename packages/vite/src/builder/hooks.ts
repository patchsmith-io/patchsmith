import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseSync } from "vite";
import type { Plugin, ESTree } from "vite";

import { resolveAppSourceRoot } from "#source-root";

import { childNodes, createDefineHookMatcher } from "./define-view";
import { isMissingFile } from "./fs-errors";
import { watchSourceDirectory } from "./watch-source-directory";

export interface HookFile {
  filename: string;
  name: string;
}

const hookSegment = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/u;

/** Discover only hook entry files; supporting modules remain ordinary imports. */
export const discoverHooks = async (root: string): Promise<HookFile[]> => {
  const directory = path.join(resolveAppSourceRoot(root), "hooks");
  const files: HookFile[] = [];
  const names = new Set<string>();

  const scan = async (current: string) => {
    const entries = await readdir(current, { withFileTypes: true }).catch(
      (error: ErrorOptions["cause"]) => {
        if (isMissingFile(error)) {
          return [];
        }

        throw error;
      }
    );

    for (const entry of entries.toSorted((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const filename = path.join(current, entry.name);

      if (entry.isDirectory()) {
        // oxlint-disable-next-line no-await-in-loop -- Discovery walks directories in deterministic order and reports the first invalid registration.
        await scan(filename);
      } else if (entry.isFile() && entry.name.endsWith(".hook.ts")) {
        const segments = path
          .relative(directory, filename)
          .slice(0, -".hook.ts".length)
          .split(/[./\\]/u);

        const name = segments.join(".");

        if (
          name.length > 255 ||
          segments.some(
            (segment) =>
              !hookSegment.test(segment) ||
              ["constructor", "prototype", "__proto__"].includes(segment)
          )
        ) {
          throw new Error(`Invalid hook file path: ${filename}`);
        }

        if (names.has(name)) {
          throw new Error(`Duplicate hook "${name}".`);
        }

        names.add(name);
        files.push({ filename, name });
      }
    }
  };

  await scan(directory);

  return files;
};

/** Rebuild the server entry when hook files are added, removed or renamed. */
export const hookFilesPlugin = (
  root: string,
  entry: string,
  render: (hooks: HookFile[]) => string,
  watching: boolean
): Plugin => {
  let source = "";
  let pending = Promise.resolve();
  let watcher: ReturnType<typeof watchSourceDirectory> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const refresh = async () => {
    if (closed) {
      return;
    }

    let next: string;

    try {
      next = render(await discoverHooks(root));
    } catch (error) {
      next = `throw new Error(${JSON.stringify(error instanceof Error ? error.message : String(error))});`;
    }

    if (next !== source) {
      source = next;
      await writeFile(entry, source);
    }
  };

  return {
    buildStart: () => {
      if (watching && !watcher) {
        watcher = watchSourceDirectory(
          resolveAppSourceRoot(root),
          "hooks",
          () => {
            if (timer) {
              clearTimeout(timer);
            }

            timer = setTimeout(() => {
              pending = (async () => {
                await pending;
                await refresh();
              })();
            }, 25);
          }
        );
      }
    },
    closeWatcher: async () => {
      closed = true;
      clearTimeout(timer);
      watcher?.close();
      await pending;
    },
    enforce: "pre",
    name: "patchsmith-hook-files",
    transform: (sourceCode, filename) => {
      if (!filename.endsWith(".hook.ts")) {
        return;
      }

      const relative = path.relative(
        path.join(resolveAppSourceRoot(root), "hooks"),
        filename
      );

      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return;
      }

      const expected = relative
        .slice(0, -".hook.ts".length)
        .split(/[./\\]/u)
        .join(".");

      const parsed = parseSync(filename, sourceCode);

      if (parsed.errors.length) {
        throw new Error(`${filename}: ${parsed.errors[0]?.message}`);
      }

      const matches = createDefineHookMatcher(parsed.program);
      let found = false;

      const visit = (node: ESTree.Node) => {
        if (matches(node)) {
          const [definition] = node.arguments;

          if (
            definition?.type !== "ObjectExpression" ||
            definition.properties.some(
              (property) =>
                property.type !== "Property" ||
                property.computed ||
                property.kind !== "init"
            )
          ) {
            throw new Error(
              `${filename}: use defineHook with inline named properties.`
            );
          }

          const name = definition.properties.find(
            (property) =>
              property.type === "Property" &&
              (property.key.type === "Identifier"
                ? property.key.name === "hook"
                : property.key.type === "Literal" &&
                  property.key.value === "hook")
          );

          if (
            name?.type !== "Property" ||
            name.value.type !== "Literal" ||
            name.value.value !== expected
          ) {
            throw new Error(
              `${filename}: defineHook hook must be ${JSON.stringify(expected)} to match the file location.`
            );
          }

          found = true;
        }

        for (const child of childNodes(node)) {
          visit(child);
        }
      };

      visit(parsed.program);

      if (!found) {
        throw new Error(
          `${filename}: hook files must define a handler with defineHook from patchsmith/server.`
        );
      }
    },
  };
};
