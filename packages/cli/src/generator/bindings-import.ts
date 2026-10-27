import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { getTsconfig } from "get-tsconfig";
import { BuildEnvironment, createIdResolver, resolveConfig } from "vite";
import { z } from "zod";

import { isMissingFile } from "#utils/fs-errors";

type ImportTarget =
  | string
  | null
  | ImportTarget[]
  | { [key: string]: ImportTarget };

const importTarget: z.ZodType<ImportTarget> = z.lazy(() =>
  z.union([
    z.string(),
    z.null(),
    z.array(importTarget),
    z.record(z.string(), importTarget),
  ])
);

const packageSchema = z.object({
  imports: z.optional(z.record(z.string(), importTarget)),
});

const sourceExtension = /\.[cm]?[jt]sx?$/u;

const posixPath = (value: string): string => value.split(path.sep).join("/");

const targetStrings = (target: ImportTarget): string[] => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The package boundary parses ImportTarget; distinguish string leaves from condition maps and arrays.
  if (typeof target === "string") {
    return [target];
  }

  if (target === null) {
    return [];
  }

  return Object.values(target).flatMap(targetStrings);
};

const addCandidates = (
  candidates: Set<string>,
  mappings: Record<string, ImportTarget>,
  base: string,
  bindingsFile: string
): void => {
  const filenames = [bindingsFile, bindingsFile.replace(sourceExtension, "")];

  for (const [specifier, target] of Object.entries(mappings)) {
    if (!specifier.includes("*")) {
      candidates.add(specifier);
      continue;
    }

    for (const value of targetStrings(target)) {
      const absolute = posixPath(path.resolve(base, value));
      const [prefix, suffix] = absolute.split("*");

      for (const filename of filenames) {
        const normalized = posixPath(filename);

        if (suffix === undefined) {
          continue;
        }

        if (
          prefix !== undefined &&
          normalized.startsWith(prefix) &&
          normalized.endsWith(suffix) &&
          normalized.length >= prefix.length + suffix.length
        ) {
          const matched = normalized.slice(
            prefix.length,
            normalized.length - suffix.length
          );

          candidates.add(specifier.replaceAll("*", matched));
        }
      }
    }
  }
};

/** Import examples are written for files directly inside the app source root. */
export const resolveBindingsImport = async (
  root: string,
  sourceRoot: string,
  bindingsFile: string
): Promise<string> => {
  const relative = posixPath(path.relative(sourceRoot, bindingsFile)).replace(
    sourceExtension,
    ""
  );

  const fallback = relative.startsWith(".") ? relative : `./${relative}`;

  try {
    const candidates = new Set<string>();

    const packageJson = await readFile(
      path.join(root, "package.json"),
      "utf-8"
    ).catch((error: ErrorOptions["cause"]) => {
      if (isMissingFile(error)) {
        return "{}";
      }

      throw error;
    });

    const pkg = packageSchema.parse(JSON.parse(packageJson));
    addCandidates(candidates, pkg.imports ?? {}, root, bindingsFile);

    const tsconfig = getTsconfig(sourceRoot);

    if (tsconfig !== null) {
      const options = tsconfig.config.compilerOptions;

      const base = path.resolve(
        path.dirname(tsconfig.path),
        options?.baseUrl ?? "."
      );

      addCandidates(candidates, options?.paths ?? {}, base, bindingsFile);
    }

    if (candidates.size === 0) {
      return fallback;
    }

    const hasViteConfig = ["js", "mjs", "ts", "cjs", "mts", "cts"].some(
      (extension) => existsSync(path.join(root, `vite.config.${extension}`))
    );

    if (hasViteConfig) {
      // Fresh scaffolds can have a config before their dependencies are installed.
      // Avoid loading it, and printing bundler warnings, until Vite is available.
      createRequire(path.join(root, "package.json")).resolve("vite");
    }

    const config = await resolveConfig({ logLevel: "silent", root }, "build");
    const environment = new BuildEnvironment("client", config);
    const resolve = createIdResolver(config);
    const importer = path.join(sourceRoot, "patchsmith-import-example.tsx");
    const destination = await realpath(bindingsFile);

    const sorted = [...candidates].toSorted((left, right) => {
      if (left === "#patchsmith") {
        return -1;
      }

      if (right === "#patchsmith") {
        return 1;
      }

      return left.length - right.length || left.localeCompare(right);
    });

    for (const candidate of sorted) {
      // oxlint-disable-next-line no-await-in-loop -- Stop at the first verified candidate in preference order.
      const resolved = await resolve(environment, candidate, importer).catch(
        () => null
      );

      if (resolved === undefined || resolved === null) {
        continue;
      }

      // oxlint-disable-next-line no-await-in-loop -- Compare this candidate before trying the next one.
      if ((await realpath(resolved).catch(() => null)) === destination) {
        return candidate;
      }
    }
  } catch {
    // Import discovery is optional, including before a scaffold's dependencies are installed.
    return fallback;
  }

  return fallback;
};
