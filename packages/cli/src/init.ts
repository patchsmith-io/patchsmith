import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { CANCEL_SYMBOL } from "@clack/prompts";
import {
  cancel,
  confirm,
  isCancel,
  select,
  spinner,
  text,
} from "@clack/prompts";
import pc from "picocolors";

import { generateApp, resolveTemplatePackageVersions } from "./generator";
import { fetchSchemaFromHost, readSchemaFile } from "./generator/types";
import { normalizeHostUrl } from "./utils/url";

export interface InitOptions {
  bare?: boolean;
  srcDir?: boolean;
  cwd: string;
  directory?: string;
  force?: boolean;
  host?: string;
  install?: boolean;
  name?: string;
  packageManager?: string;
  schemaPath?: string;
  tooling?: string;
}

const PACKAGE_MANAGERS = ["pnpm", "yarn", "npm", "bun"] as const;

type PackageManager = (typeof PACKAGE_MANAGERS)[number];

const isPackageManager = (value: string): value is PackageManager =>
  PACKAGE_MANAGERS.some((manager) => manager === value);

const normalizePackageName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._/-]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");

const isPromptValue = <T extends string | boolean>(
  value: T | typeof CANCEL_SYMBOL
): value is T => !isCancel(value);

const abortIfCancelled = <T extends string | boolean>(
  value: T | typeof CANCEL_SYMBOL
): T => {
  if (!isPromptValue(value)) {
    cancel("Init cancelled.");
    process.exit(0);
  }

  return value;
};

const promptDirectory = (given: string | undefined, cwd: string): string =>
  path.resolve(cwd, given ?? ".");

const promptPackageName = async (
  given: string | undefined,
  baseDir: string
): Promise<string> => {
  const defaultName =
    normalizePackageName(path.basename(baseDir)) || "patchsmith-app";

  if (given !== undefined) {
    return normalizePackageName(given);
  }

  const answer = abortIfCancelled(
    await text({
      defaultValue: defaultName,
      message: "Package name",
      placeholder: defaultName,
      validate: (value) =>
        normalizePackageName(value ?? "").length === 0
          ? "Enter a package name."
          : undefined,
    })
  );

  return normalizePackageName(answer);
};

const promptPackageManager = async (
  given: string | undefined
): Promise<PackageManager> => {
  if (given !== undefined) {
    if (isPackageManager(given)) {
      return given;
    }

    throw new Error(
      `--package-manager must be one of: ${PACKAGE_MANAGERS.join(", ")}.`
    );
  }

  const answer = abortIfCancelled(
    await select<PackageManager>({
      initialValue: "pnpm",
      message: "Package manager",
      options: PACKAGE_MANAGERS.map((value) => ({ label: value, value })),
    })
  );

  return answer;
};

const promptTooling = async (
  given: string | undefined
): Promise<"vite-plus" | "vite"> => {
  if (given !== undefined) {
    if (given === "vite-plus" || given === "vite") {
      return given;
    }

    throw new Error("--tooling must be vite-plus or vite.");
  }

  return abortIfCancelled(
    await select<"vite-plus" | "vite">({
      initialValue: "vite-plus",
      message: "App tooling",
      options: [
        {
          hint: "Build, lint, format and test",
          label: "Vite+ (recommended)",
          value: "vite-plus" as const,
        },
        {
          hint: "Minimal setup; bring your own tools",
          label: "Vite (build only)",
          value: "vite" as const,
        },
      ],
    })
  );
};

const validateHostUrl = (value: string | undefined): string | undefined => {
  try {
    normalizeHostUrl(value ?? "");

    return undefined;
  } catch {
    return "Enter a valid host URL.";
  }
};

const promptHostUrl = async (given: string | undefined): Promise<string> => {
  if (given !== undefined) {
    const error = validateHostUrl(given);

    if (error !== undefined) {
      throw new Error(error);
    }

    return normalizeHostUrl(given);
  }

  const defaultValue = "https://example.com/api/patchsmith";

  const answer = abortIfCancelled(
    await text({
      defaultValue,
      message: "Host URL",
      placeholder: defaultValue,
      validate: validateHostUrl,
    })
  );

  return normalizeHostUrl(answer);
};

const promptInstall = async (given: boolean | undefined): Promise<boolean> => {
  if (given !== undefined) {
    return given;
  }

  return abortIfCancelled(
    await confirm({ initialValue: true, message: "Install dependencies?" })
  );
};

const promptForce = async (
  targetDir: string,
  given: boolean
): Promise<boolean> => {
  if (given || !existsSync(targetDir)) {
    return given;
  }

  return abortIfCancelled(
    await confirm({
      initialValue: false,
      message: `${pc.cyan(targetDir)} already exists. Overwrite matching files?`,
    })
  );
};

const exec = async (
  cmd: string,
  args: string[],
  cwd: string
): Promise<number> =>
  await (async () => {
    const {
      promise: pendingPromise,
      resolve,
      reject,
    } = Promise.withResolvers<number>();

    try {
      const proc = spawn(cmd, args, { cwd, stdio: "inherit" });
      proc.on("close", resolve);
      proc.on("error", reject);
    } catch (error) {
      reject(error);
    }

    return await pendingPromise;
  })();

const runInstall = async (
  targetDir: string,
  packageManager: PackageManager
): Promise<void> => {
  const s = spinner();
  s.start(`Installing dependencies with ${packageManager}`);
  const code = await exec(packageManager, ["install"], targetDir);

  if (code !== 0) {
    s.stop("Install failed.");
    throw new Error(`${packageManager} install exited with code ${code}.`);
  }

  s.stop("Installed dependencies.");
};

const runFormat = async (
  targetDir: string,
  packageManager: PackageManager
): Promise<void> => {
  const s = spinner();
  s.start("Formatting project");
  const code = await exec(packageManager, ["run", "format:fix"], targetDir);

  if (code !== 0) {
    s.stop("Formatting failed.");
    throw new Error(
      `${packageManager} run format:fix exited with code ${code}.`
    );
  }

  s.stop("Formatted project.");
};

export const runInit = async (options: InitOptions): Promise<string> => {
  const baseDir = promptDirectory(options.directory, options.cwd);
  const packageName = await promptPackageName(options.name, baseDir);
  const targetDirectory = path.join(baseDir, packageName);

  const force = await promptForce(targetDirectory, options.force ?? false);
  const packageManager = await promptPackageManager(options.packageManager);
  const hostUrl = await promptHostUrl(options.host);
  const tooling = await promptTooling(options.tooling);
  const install = await promptInstall(options.install);

  const s = spinner();
  s.start(
    options.schemaPath === undefined
      ? "Fetching host schema"
      : "Reading host schema"
  );
  let schema;

  try {
    schema =
      options.schemaPath === undefined
        ? await fetchSchemaFromHost(hostUrl)
        : await readSchemaFile(path.resolve(options.cwd, options.schemaPath));
    s.stop("Loaded host schema.");
  } catch (error) {
    s.stop("Unable to load host schema.");
    throw error;
  }

  s.start("Resolving package versions");
  const packageVersions = await resolveTemplatePackageVersions(tooling);
  s.stop("Resolved package versions.");

  await mkdir(targetDirectory, { recursive: true });

  await generateApp({
    bare: options.bare,
    force,
    hostUrl,
    packageManager,
    packageName,
    packageVersions,
    schema,
    srcDir: options.srcDir,
    targetDirectory,
    tooling,
  });

  if (install) {
    await runInstall(targetDirectory, packageManager);

    if (tooling === "vite-plus") {
      await runFormat(targetDirectory, packageManager);
    }
  }

  return targetDirectory;
};
