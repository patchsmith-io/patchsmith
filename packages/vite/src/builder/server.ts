import {
  mkdir,
  mkdtemp,
  writeFile,
  cp,
  rm,
  realpath,
  readFile,
} from "node:fs/promises";
import path from "node:path";

import type { RuntimeManifest } from "@patchsmith/app/server";
import * as v from "valibot";
import { build } from "vite";
import type { UserConfig } from "vite";

import type { LoadedPatchsmithConfig } from "#config/loader";

import { appDatabasePaths } from "./database-paths";
import { isMissingFile } from "./fs-errors";
import { discoverHooks, hookFilesPlugin } from "./hooks";
import type { HookFile } from "./hooks";
import {
  instanceServerBindings,
  instanceServerImports,
  instanceServerPlugin,
} from "./instances";
import type { InstanceModule, InstanceRegistration } from "./instances";
import { readAppMigrations } from "./migrations";
import { checkAppSchema } from "./schema-check";
import { patchsmithUploadManifestSchema } from "./upload-manifest";

const containsImplementation = (parent: string, child: string) => {
  const relative = path.relative(parent, child);

  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
};

const overlaps = (source: string, destination: string) => {
  const contains = containsImplementation;

  return contains(source, destination) || contains(destination, source);
};

const canonicalBuildPath = async (filename: string): Promise<string> => {
  try {
    return await realpath(filename);
  } catch (error) {
    const parent = path.dirname(filename);

    if (!isMissingFile(error) || parent === filename) {
      throw error;
    }

    return path.join(await canonicalBuildPath(parent), path.basename(filename));
  }
};

/** Check before either build can empty an output directory. */
export const validateServerBuildOutput = async (
  loaded: LoadedPatchsmithConfig,
  output: string
) => {
  const [canonicalOutput, migrationsDirectory, configPath, protectedPaths] =
    await Promise.all([
      canonicalBuildPath(path.resolve(output)),
      canonicalBuildPath(
        appDatabasePaths(loaded.root, loaded.config.server?.migrations)
          .migrations
      ),
      canonicalBuildPath(path.resolve(loaded.filepath)),
      Promise.all(
        ["src", "assets", "node_modules"].map(
          async (name) =>
            await canonicalBuildPath(path.resolve(loaded.root, name))
        )
      ),
    ]);

  if (overlaps(migrationsDirectory, canonicalOutput)) {
    throw new Error("App build output must not overlap migration source");
  }

  for (const protectedPath of protectedPaths) {
    if (overlaps(protectedPath, canonicalOutput)) {
      throw new Error(
        "App build output must not overlap source or dependency directories"
      );
    }
  }

  if (overlaps(configPath, canonicalOutput)) {
    throw new Error("App build output must not overlap the app config");
  }
};

/** Emitted by this SDK's builder; breaking interface changes increment apiVersion. */
export const runtimeManifest = {
  apiVersion: 1,
  requires: [
    "database",
    "actions",
    "database-relations",
    "tools",
    "internal-functions",
    "nested-actions",
  ],
} as const satisfies RuntimeManifest;

/** Bundle the private app backend and migrations. */
export const buildServer = async (
  loaded: LoadedPatchsmithConfig,
  functionsEntry: string,
  watch = false,
  buildOutDir?: string,
  instances: InstanceModule[] = [],
  registrations: InstanceRegistration[] = [],
  viteConfig: UserConfig = {}
) => {
  const output = buildOutDir ?? path.resolve(loaded.root, ".patchsmith");
  const directory = path.join(output, "server");

  const migrationsDirectory = appDatabasePaths(
    loaded.root,
    loaded.config.server?.migrations
  ).migrations;

  const migrationsOutput = path.join(output, "migrations");
  const temporaryRoot = path.join(output, "tmp");
  await validateServerBuildOutput(loaded, output);
  await rm(directory, { force: true, recursive: true });
  await mkdir(directory, { recursive: true });
  await mkdir(temporaryRoot, { recursive: true });
  const temporary = await mkdtemp(path.join(temporaryRoot, "server-"));
  const entry = path.join(temporary, "entry.mjs");
  let watching = false;
  let ready: (() => void) | undefined;

  const initialBuild = watch
    ? (async () => {
        const {
          promise: pendingPromise,
          resolve,
          reject: rejectPending,
        } = Promise.withResolvers<ReturnType<() => void>>();

        try {
          ready = resolve;
        } catch (error) {
          rejectPending(error);
        }

        await pendingPromise;
      })()
    : undefined;

  try {
    const sourceRoot = await realpath(loaded.root);

    const renderEntry = (hooks: HookFile[]) => {
      const app = instances.length
        ? `withInstanceResolvers(app, ${instanceServerBindings(instances, registrations)})`
        : "app";

      return `import app from ${JSON.stringify(functionsEntry)};
import { withHooks } from "patchsmith/internal/server";
import { withInstanceResolvers } from "patchsmith/server";
${instanceServerImports(instances)}
${hooks.map((file, index) => `import hook${index} from ${JSON.stringify(file.filename)};`).join("\n")}
export default ${hooks.length ? `withHooks(${app}, [${hooks.map((file, index) => `{ name: ${JSON.stringify(file.name)}, definition: hook${index} }`).join(",")}])` : app};
export { default as migrations } from "patchsmith:migrations";
export const runtimeManifest = ${JSON.stringify({ ...runtimeManifest, requires: [...runtimeManifest.requires, ...(hooks.length ? ["hooks"] : [])] })};
`;
    };

    await writeFile(entry, renderEntry(await discoverHooks(loaded.root)));

    const result = await build({
      build: {
        emptyOutDir: false,
        minify: "oxc",
        outDir: directory,
        rolldownOptions: {
          external: [],
          output: {
            entryFileNames: "server.js",
            inlineDynamicImports: true,
            minify: true,
            minifyInternalExports: true,
          },
        },
        ssr: entry,
        target: "es2022",
        watch: watch ? {} : null,
      },
      configFile: false,
      define: viteConfig.define,
      mode: viteConfig.mode,
      plugins: [
        ...(viteConfig.plugins ?? []),
        {
          name: "patchsmith-server-runtime",
          async resolveId(id) {
            if (
              id !== "patchsmith/server" &&
              id !== "patchsmith/internal/server"
            ) {
              return null;
            }

            // Generated entries can live outside the app's dependency tree.
            return await this.resolve(
              id,
              path.join(loaded.root, "package.json"),
              {
                skipSelf: true,
              }
            );
          },
        },
        instanceServerPlugin(loaded.root, instances),
        hookFilesPlugin(sourceRoot, entry, renderEntry, watch),
        {
          closeWatcher: async () => {
            await rm(temporary, { force: true, recursive: true });
          },
          async load(id): Promise<string | undefined> {
            if (id !== "\0patchsmith:migrations") {
              return undefined;
            }

            const { migrations, files } = await readAppMigrations(
              migrationsDirectory,
              loaded.config.server?.migrations === undefined
            );

            await checkAppSchema(loaded.root, migrationsDirectory);
            this.addWatchFile(appDatabasePaths(loaded.root).schema);

            for (const file of files) {
              this.addWatchFile(file);
            }

            await rm(migrationsOutput, { force: true, recursive: true });
            await mkdir(migrationsOutput, { recursive: true });
            await cp(migrationsDirectory, migrationsOutput, {
              recursive: true,
            }).catch((error: ErrorOptions["cause"]) => {
              if (
                loaded.config.server?.migrations === undefined &&
                isMissingFile(error)
              ) {
                return;
              }

              throw error;
            });

            return `export default ${JSON.stringify(migrations)};`;
          },
          name: "patchsmith-app-migrations",
          resolveId: (id) =>
            id === "patchsmith:migrations"
              ? "\0patchsmith:migrations"
              : undefined,
          async writeBundle() {
            const manifestPath = path.join(output, "patchsmith-upload.json");

            const source = await readFile(manifestPath, "utf-8").catch(
              (error: ErrorOptions["cause"]) => {
                if (isMissingFile(error)) {
                  return null;
                }

                throw error;
              }
            );

            if (source === null) {
              return;
            }

            const manifest = v.parse(
              patchsmithUploadManifestSchema,
              JSON.parse(source)
            );

            const hookFiles = await discoverHooks(sourceRoot);

            manifest.hooks = hookFiles.map(({ name }) => name);
            await writeFile(
              manifestPath,
              `${JSON.stringify(manifest, null, 2)}\n`
            );
          },
        },
      ],
      resolve: viteConfig.resolve,
      root: loaded.root,
      ssr: { noExternal: true },
    });

    watching = watch;

    if (watch && "on" in result && initialBuild) {
      try {
        await Promise.race([
          initialBuild,
          (async () => {
            const {
              promise: pendingPromise,
              resolve: _,
              reject,
            } = Promise.withResolvers<never>();

            try {
              result.on("event", (event) => {
                if (event.code === "ERROR") {
                  reject(event.error);
                }

                if (event.code === "END") {
                  ready?.();
                }
              });
            } catch (error) {
              reject(error);
            }

            return await pendingPromise;
          })(),
        ]);
      } catch (error) {
        await result.close();
        throw error;
      }
    }

    return result;
  } finally {
    if (!watching) {
      await rm(temporary, { force: true, recursive: true });
    }
  }
};
