import { watch } from "node:fs";
import type { WatchListener } from "node:fs";
import path from "node:path";

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
  sourceRoot: string,
  name: "slots" | "functions" | "hooks",
  onChange: () => void,
  watchDirectory: WatchDirectory = watch
): DirectoryWatcher => {
  const directory = path.join(sourceRoot, name);
  let scoped: DirectoryWatcher | undefined;

  const attach = () => {
    scoped?.close();
    scoped = undefined;

    try {
      scoped = watchDirectory(directory, { recursive: true }, onChange);
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
  };

  // Keep this non-recursive so dependency and output trees are never traversed.
  const parent = watchDirectory(
    sourceRoot,
    { recursive: false },
    (_event, filename) => {
      if (filename !== null && filename !== name) {
        return;
      }

      attach();
      onChange();
    }
  );

  try {
    attach();
  } catch (error) {
    parent.close();
    throw error;
  }

  return {
    close: () => {
      parent.close();
      scoped?.close();
    },
  };
};
