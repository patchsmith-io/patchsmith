import { existsSync } from "node:fs";
import path from "node:path";

const sourceDirectories = ["slots", "functions", "hooks", "db"];

const hasSource = (directory: string) =>
  sourceDirectories.some((name) => existsSync(path.join(directory, name)));

/** Select one app source tree; mixing root and src registrations is ambiguous. */
export const resolveAppSourceRoot = (root: string): string => {
  const source = path.join(root, "src");

  const rootSources = hasSource(root);
  const nestedSources = hasSource(source);

  if (rootSources && nestedSources) {
    throw new Error(
      "Patchsmith app source directories must live together at the project root or under src/, not both."
    );
  }

  return !rootSources && existsSync(source) ? source : root;
};
