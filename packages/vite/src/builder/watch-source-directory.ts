import { watch } from "node:fs";
import type { WatchListener } from "node:fs";
import path from "node:path";

import { resolveAppSourceRoot, sourceDirectories } from "#source-root";

import { isMissingFile } from "./fs-errors";

interface DirectoryWatcher {
  close: () => void;
}

type WatchDirectory = (
  directory: string,
  options: { recursive: boolean },
  listener: WatchListener<string>
) => DirectoryWatcher;

/** Recurse only into app source; the parent watch tracks directory lifecycle. */
export const watchSourceDirectory = (
  root: string,
  name: "slots" | "functions" | "hooks",
  onChange: () => void,
  watchDirectory: WatchDirectory = watch
): DirectoryWatcher => {
  const nestedRoot = path.join(root, "src");
  let nestedParent: DirectoryWatcher | undefined;
  let scoped: DirectoryWatcher | undefined;

  const attach = () => {
    scoped?.close();
    scoped = undefined;

    let sourceRoot: string;

    try {
      sourceRoot = resolveAppSourceRoot(root);
    } catch {
      // Discovery reports mixed layouts; parent watches remain active for recovery.
      return;
    }

    try {
      scoped = watchDirectory(
        path.join(sourceRoot, name),
        { recursive: true },
        onChange
      );
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
  };

  const sourceChanged: WatchListener<string> = (_event, filename) => {
    if (filename !== null && !sourceDirectories.includes(filename)) {
      return;
    }

    attach();
    onChange();
  };

  const attachNestedParent = () => {
    nestedParent?.close();
    nestedParent = undefined;

    try {
      nestedParent = watchDirectory(
        nestedRoot,
        { recursive: false },
        sourceChanged
      );
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
  };

  // Observe both candidate roots without traversing dependencies or build output.
  const parent = watchDirectory(
    root,
    { recursive: false },
    (event, filename) => {
      if (filename === null || filename === "src") {
        attachNestedParent();
        attach();
        onChange();

        return;
      }

      sourceChanged(event, filename);
    }
  );

  try {
    attachNestedParent();
    attach();
    // Reconcile changes made between initial discovery and watcher registration.
    onChange();
  } catch (error) {
    parent.close();
    nestedParent?.close();
    scoped?.close();
    throw error;
  }

  return {
    close: () => {
      parent.close();
      nestedParent?.close();
      scoped?.close();
    },
  };
};
