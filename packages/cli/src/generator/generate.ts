import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Liquid } from "liquidjs";
import { z } from "zod";

import {
  DEFAULT_MINIMUM_RELEASE_AGE,
  TEMPLATE_DRIZZLE_VERSION,
} from "./package-versions";
import {
  rootTemplate,
  defaultViewTemplate,
  gitignoreTemplate,
  viteConfigTemplate,
  packageJsonTemplate,
  pnpmWorkspaceTemplate,
  patchsmithConfigTemplate,
  tsconfigTemplate,
  schemaTemplate,
  databaseTemplate,
  relationsTemplate,
  greetingTemplate,
  logoDarkTemplate,
  logoLightTemplate,
} from "./templates/index";
import { generateTypes } from "./types";
import type { PatchsmithSchemaFile } from "./types";

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error("Expected a defined value.");
  }

  return value;
};

export interface GenerateAppOptions {
  bare?: boolean;
  targetDirectory: string;
  force: boolean;
  hostUrl: string;
  schema: PatchsmithSchemaFile;
  tooling: "vite-plus" | "vite";
  packageName: string;
  packageVersions: {
    drizzleKit?: string;
    drizzleOrm?: string;
    vite: string;
    vitePlus?: string;
    preact: string;
    patchsmith: string;
    typescript: string;
    valibot?: string;
  };
  useWorkspaceDependencies?: boolean;
  packageManager?: string;
}

const engine = new Liquid({ strictVariables: true });

const invalidFilenameCharacters = /[<>:"/\\|?*#]/u;

const isFilenameSegment = (segment: string): boolean => {
  if (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    invalidFilenameCharacters.test(segment)
  ) {
    return false;
  }

  for (const character of segment) {
    const code = character.codePointAt(0);

    if (code !== undefined && code < 32) {
      return false;
    }
  }

  return true;
};

const getViewModulePath = (slotName: string, viewPath: string) => {
  const viewSegments =
    viewPath === "/" ? ["index"] : viewPath.slice(1).split("/");

  if (viewPath !== "/" && viewSegments.at(-1) === "index") {
    viewSegments.push("index");
  }

  const routeName = viewSegments.join(".");

  if (
    !viewPath.startsWith("/") ||
    viewSegments.some((segment) => segment.includes(".")) ||
    ![slotName, ...viewSegments, ...routeName.split(".")].every(
      isFilenameSegment
    )
  ) {
    throw new Error(
      "The selected slot and view must have valid file names with no empty dot-separated route segments to generate src/slots."
    );
  }

  return ["slots", slotName, routeName].join("/");
};

const supportsBox = (
  box: NonNullable<PatchsmithSchemaFile["components"]>[string] | undefined
): boolean => {
  const required = box?.fields?.required;

  return (
    box?.children === true && (required === undefined || required.length === 0)
  );
};

const getStarterView = (schema: PatchsmithSchemaFile) => {
  const slots = Object.keys(schema.slots ?? {}).toSorted();

  const viewPath = Object.keys(schema.views ?? {})
    .toSorted()
    .find((view) =>
      slots.some((slot) => schema.slots?.[slot]?.views.includes(view) === true)
    );

  if (viewPath === undefined) {
    throw new Error(
      "The host schema has no views supported by a slot. Add a view and slot before running patchsmith init."
    );
  }

  const slotName = requireValue(
    slots.find(
      (slot) => schema.slots?.[slot]?.views.includes(viewPath) === true
    )
  );

  return {
    multiple: schema.slots?.[slotName]?.multiple === true,
    slotName,
    viewFile: path.join(
      "src",
      `${getViewModulePath(slotName, viewPath)}.view.tsx`
    ),
    viewPath,
  };
};

const getAppSlug = (packageName: string) => {
  const slugBase =
    packageName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, "-")
      .slice(0, 32)
      .replaceAll(/^-+|-+$/gu, "") || "patchsmith-app";

  return slugBase.length < 3 ? `${slugBase}-app` : slugBase;
};

const renderTemplate = async (
  template: string,
  data: Record<string, string | boolean>
): Promise<string> => {
  const output: unknown = await engine.parseAndRender(template, data);

  return z.string().parse(output);
};

const ensureDirectory = async (directory: string): Promise<void> => {
  await (async () => {
    void (await mkdir(directory, { recursive: true }));
    /* Intentionally no action is needed. */
  })();
};

const writeTemplateFile = async (
  filepath: string,
  contents: string,
  force: boolean
): Promise<void> => {
  if (!force && existsSync(filepath)) {
    throw new Error(`${filepath} already exists. Use --force to overwrite it.`);
  }

  await writeFile(filepath, contents, "utf-8");
};

export const generateApp = async (
  options: GenerateAppOptions
): Promise<void> => {
  const {
    bare = false,
    targetDirectory,
    force,
    hostUrl,
    schema,
    tooling,
    packageName,
    packageVersions,
    useWorkspaceDependencies,
  } = options;

  const starter = bare ? undefined : getStarterView(schema);
  const useBox = supportsBox(schema.components?.Box);
  const bindingsPath = path.join(targetDirectory, "src", "patchsmith.gen.ts");

  if (!force && existsSync(bindingsPath)) {
    throw new Error(
      `${bindingsPath} already exists. Use --force to overwrite it.`
    );
  }

  const patchsmithVersion =
    useWorkspaceDependencies === true
      ? "workspace:*"
      : packageVersions.patchsmith;

  const templateData = {
    appName: JSON.stringify(packageName),
    appSlug: JSON.stringify(getAppSlug(packageName)),
    bare,
    drizzleKitVersion: packageVersions.drizzleKit ?? TEMPLATE_DRIZZLE_VERSION,
    drizzleOrmVersion: packageVersions.drizzleOrm ?? TEMPLATE_DRIZZLE_VERSION,
    hostUrl,
    minimumReleaseAge: String(DEFAULT_MINIMUM_RELEASE_AGE),
    multiple: starter?.multiple ?? false,
    packageName,
    patchsmithVersion,
    preactVersion: packageVersions.preact,
    slotName: JSON.stringify(starter?.slotName ?? ""),
    tooling,
    typescriptVersion: packageVersions.typescript,
    useBox,
    valibotVersion: packageVersions.valibot ?? "^1.5.0",
    viewPath: JSON.stringify(starter?.viewPath ?? ""),
    vitePlus: tooling === "vite-plus",
    vitePlusVersion: packageVersions.vitePlus ?? "1.0.0",
    viteVersion: packageVersions.vite,
  };

  if (!bare) {
    await ensureDirectory(
      path.join(targetDirectory, "src", "db", "migrations")
    );
  }

  const files: { template: string; dest: string; condition?: boolean }[] = [
    {
      condition:
        options.packageManager === undefined ||
        options.packageManager === "pnpm",
      dest: "pnpm-workspace.yaml",
      template: pnpmWorkspaceTemplate,
    },
    { dest: "package.json", template: packageJsonTemplate },
    { dest: "tsconfig.json", template: tsconfigTemplate },
    { dest: "patchsmith.config.ts", template: patchsmithConfigTemplate },
    {
      condition: !bare,
      dest: "assets/logo-dark.svg",
      template: logoDarkTemplate,
    },
    {
      condition: !bare,
      dest: "assets/logo-light.svg",
      template: logoLightTemplate,
    },
    { dest: ".gitignore", template: gitignoreTemplate },
    { dest: "vite.config.ts", template: viteConfigTemplate },
    { dest: path.join("src", "root.tsx"), template: rootTemplate },
    ...(starter === undefined
      ? []
      : [{ dest: starter.viewFile, template: defaultViewTemplate }]),
    {
      condition: !bare,
      dest: path.join("src", "db", "schema.ts"),
      template: schemaTemplate,
    },
    {
      condition: !bare,
      dest: path.join("src", "db", "index.ts"),
      template: databaseTemplate,
    },
    {
      condition: !bare,
      dest: path.join("src", "db", "relations.ts"),
      template: relationsTemplate,
    },
    {
      condition: !bare,
      dest: path.join("src", "functions", "greeting.router.ts"),
      template: greetingTemplate,
    },
  ];

  await Promise.all(
    files
      .values()
      .filter((f) => f.condition !== false)
      .map(async ({ template, dest }) => {
        const rendered = await renderTemplate(template, templateData);
        await ensureDirectory(path.dirname(path.join(targetDirectory, dest)));
        await writeTemplateFile(
          path.join(targetDirectory, dest),
          rendered,
          force
        );
      })
      .toArray()
  );

  // Use the same binding generator as `patchsmith generate`, even without installation.
  await generateTypes({ cwd: targetDirectory, schema });
};
