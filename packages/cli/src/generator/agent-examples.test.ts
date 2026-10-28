import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire, findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { primitives } from "@patchsmith/core/primitives/zod";
import { createPatchsmithSchema } from "@patchsmith/core/schema";
import {
  discoverFunctionFiles,
  discoverHooks,
  generateFunctionTypes,
} from "@patchsmith/vite/builder";
import { build } from "vite";
import { expect, it } from "vite-plus/test";
import { z } from "zod";

import { generateApp } from "./generate";
import { renderGeneratedReferences, renderGeneratedTypes } from "./types";
import type { PatchsmithSchemaFile } from "./types";

const primitiveSchema = createPatchsmithSchema({
  components: primitives({
    breakpoints: { md: "768px" },
    tokens: { background: { accent: "blue", surface: "white" } },
  }),
}).serialize();

const schema: PatchsmithSchemaFile = {
  components: {
    ...primitiveSchema.components,
    Button: {
      callbacks: { onClick: {} },
      children: true,
      fields: { properties: { disabled: { type: "boolean" } }, type: "object" },
    },
    EmptyContainer: { children: true },
    Input: {
      callbacks: {
        onValueChange: {
          input: {
            properties: { value: { type: "string" } },
            required: ["value"],
            type: "object",
          },
        },
      },
      children: false,
      fields: {
        properties: {
          disabled: { type: "boolean" },
          value: { type: "string" },
        },
        type: "object",
      },
    },
    RequiredText: {
      children: false,
      fields: {
        properties: {
          count: { maximum: 200, minimum: 1, type: "integer" },
          label: { type: "string" },
        },
        required: ["label"],
        type: "object",
      },
    },
    "badge-control": {
      children: false,
      fields: {
        properties: { label: { type: "string" } },
        required: ["label"],
        type: "object",
      },
    },
  },
  hooks: {
    notify: {},
    recordChanged: {
      input: {
        properties: {
          record: {
            properties: { title: { type: "string" } },
            required: ["title"],
            type: "object",
          },
        },
        required: ["record"],
        type: "object",
      },
    },
    "records.created": {
      input: { type: "string" },
      inputOptional: true,
      output: { type: "boolean" },
      outputOptional: true,
    },
    sync: { input: { type: "string" }, output: { type: "number" } },
  },
  slots: {
    panel: { views: ["/", "/records/detail"] },
    tile: { multiple: true, views: ["/"] },
  },
  tools: {
    members: {
      read: {
        input: {
          properties: { memberId: { type: "string" } },
          required: ["memberId"],
          type: "object",
        },
        kind: "server",
        output: {
          properties: { name: { type: "string" } },
          required: ["name"],
          type: "object",
        },
      },
    },
    "unusual-group": { "no-input": { kind: "client" } },
  },
  views: {
    "/": { context: { type: "object" } },
    "/records/detail": {
      context: {
        properties: { recordId: { type: "string" } },
        required: ["recordId"],
        type: "object",
      },
    },
  },
};

const fileExample =
  /<!-- (?<mode>example|continue): (?<filename>[^ ]+) -->\s*```tsx?\n(?<source>[\s\S]*?)```/gu;

const codeBlock = /```(?<language>tsx?)\n(?<source>[\s\S]*?)```/gu;
const externalPackage = /^(?:patchsmith|preact|valibot)(?:\/|$)/u;

const declaration = (specifier: string) =>
  fileURLToPath(import.meta.resolve(specifier)).replace(
    /\.(?<kind>[cm]?)js$/u,
    ".d.$<kind>ts"
  );

it("typechecks and bundles examples with scaffold imports and the public SDK", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-agent-examples-"));

  try {
    await generateApp({
      bare: true,
      force: false,
      hostUrl: "https://host.test",
      packageName: "agent-examples",
      packageVersions: {
        patchsmith: "0.1.0-beta.49",
        preact: "11.0.1",
        typescript: "7.0.2",
        vite: "8.0.0",
      },
      schema,
      targetDirectory: root,
      tooling: "vite",
    });

    const documents = await Promise.all(
      [
        "../../../agent-fx/src/skills/database.md",
        "../../../agent-fx/src/skills/functions.md",
        "../../../agent-fx/src/skills/hooks.md",
        "../../../agent-fx/src/skills/frontend.md",
        "../../../agent-fx/src/skills/views.md",
        "../../../agent/src/skills/references/drafts.md",
        "../../../agent/src/skills/references/local-state.md",
      ].map(
        async (filename) =>
          await readFile(new URL(filename, import.meta.url), "utf-8")
      )
    );

    const sources: Record<string, string> = {};

    for (const document of documents) {
      for (const match of document.matchAll(fileExample)) {
        const { filename, mode, source } = match.groups ?? {};

        if (filename === undefined || source === undefined) {
          throw new Error("Invalid example marker.");
        }

        if (mode === "continue") {
          if (sources[filename] === undefined) {
            throw new Error(`Missing initial snippet: ${filename}`);
          }

          sources[filename] += `\n${source}`;
          continue;
        }

        if (sources[filename] !== undefined) {
          throw new Error(`Duplicate example: ${filename}`);
        }

        sources[filename] = source;
      }
    }

    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(10);
    sources["examples/source-aliases.ts"] =
      'export { NoteEditor } from "#components/note-editor";\nexport { Empty } from "#components/empty";\nexport { default as notes } from "#functions/notes.router";';
    sources["components/empty/index.tsx"] = "export const Empty = () => null;";
    // Legacy form examples call api.todos; reuse the notes router under that namespace.
    sources["functions/todos.router.ts"] =
      'export { default } from "#functions/notes.router";';
    sources["patchsmith.gen.ts"] = renderGeneratedTypes(schema, {
      functionsModule: "./patchsmith.functions.gen",
    });

    const references = renderGeneratedReferences(schema, {
      bindingsPath: "../patchsmith.gen.ts",
    });

    expect(references["components/RequiredText.md"]).toContain(
      "| label | yes |"
    );
    expect(references["components/RequiredText.md"]).toContain("maximum: 200");
    let count = 0;

    for (const reference of Object.values(references)) {
      for (const match of reference.matchAll(codeBlock)) {
        const { language, source } = match.groups ?? {};

        if (language === undefined || source === undefined) {
          throw new Error("Invalid generated code block.");
        }

        sources[`examples/generated-${count}.${language}`] = source;
        count += 1;
      }
    }

    expect(count).toBeGreaterThanOrEqual(8);
    await Promise.all(
      Object.entries(sources).map(async ([filename, content]) => {
        const destination = path.resolve(root, filename);

        if (!destination.startsWith(`${root}${path.sep}`)) {
          throw new Error(
            `Example path leaves the temporary workspace: ${filename}`
          );
        }

        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, content);
      })
    );
    await generateFunctionTypes(root, await discoverFunctionFiles(root));
    expect(await discoverHooks(root)).toEqual([
      {
        filename: path.join(root, "hooks/recordChanged.hook.ts"),
        name: "recordChanged",
      },
    ]);

    const require = createRequire(import.meta.url);
    const preact = path.dirname(require.resolve("preact/package.json"));
    const appServer = import.meta.resolve("@patchsmith/app/server");
    const database = findPackageJSON("@patchsmith/app-db", appServer);

    if (database === undefined) {
      throw new Error("Missing public database package.");
    }

    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "preact",
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          paths: {
            "patchsmith/app/config": [declaration("@patchsmith/vite/config")],
            "patchsmith/client": [declaration("@patchsmith/app/client")],
            "patchsmith/db": [
              path.join(path.dirname(database), "dist/index.d.ts"),
            ],
            "patchsmith/server": [declaration("@patchsmith/app/server")],
            "patchsmith/vite": [declaration("@patchsmith/vite")],
            preact: [path.join(preact, "src/index.d.ts")],
            "preact/hooks": [path.join(preact, "hooks/src/index.d.ts")],
            "preact/jsx-runtime": [
              path.join(preact, "jsx-runtime/src/index.d.ts"),
            ],
            valibot: [declaration("valibot")],
            vite: [declaration("vite")],
          },
          skipLibCheck: true,
          strict: true,
          target: "ESNext",
          types: [],
        },
        include: ["."],
      })
    );

    const compiler = path.join(
      path.dirname(require.resolve("typescript/package.json")),
      "bin/tsc"
    );

    // oxlint-disable-next-line typescript/strict-void-return -- promisify uses execFile's completion callback, not its ChildProcess return value.
    const result = await promisify(execFile)(process.execPath, [
      compiler,
      "-p",
      path.join(root, "tsconfig.json"),
    ]).catch((error: ErrorOptions["cause"]) => {
      const detail = z
        .object({ stderr: z.string(), stdout: z.string() })
        .parse(error);

      throw new Error(detail.stdout + detail.stderr, { cause: error });
    });

    expect(result.stdout).toBe("");
    await build({
      build: {
        lib: {
          entry: path.join(root, "examples/source-aliases.ts"),
          formats: ["es"],
        },
        rolldownOptions: { external: [externalPackage] },
        write: false,
      },
      configFile: false,
      root,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
