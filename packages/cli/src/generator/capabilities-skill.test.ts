import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { primitives } from "@patchsmith/core/primitives/zod";
import { createPatchsmithSchema } from "@patchsmith/core/schema";
import { expect, it } from "vite-plus/test";
import { z } from "zod";

import {
  generateTypes,
  renderGeneratedReferences,
  renderGeneratedTypes,
} from "./types";
import type { PatchsmithSchemaFile } from "./types";

const schema: PatchsmithSchemaFile = {
  components: {
    Button: {
      callbacks: { onPress: {}, onValidate: { output: { type: "boolean" } } },
      children: true,
      description:
        "Activates on pointer or keyboard input. Disabled buttons do not emit onPress.",
      fields: {
        properties: { variant: { enum: ["primary", "secondary"] } },
        type: "object",
      },
    },
    Input: {
      callbacks: {
        onChange: {
          input: {
            properties: { value: { type: "string" } },
            required: ["value"],
            type: "object",
          },
        },
      },
      children: false,
      fields: { properties: { value: { type: "string" } }, type: "object" },
    },
  },
  hooks: {
    notify: {},
    recordChanged: {
      input: {
        properties: {
          record: {
            properties: { id: { type: "string" }, title: { type: "string" } },
            required: ["id", "title"],
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
    page: { description: "Main content area.", multiple: true, views: ["/"] },
  },
  tools: {
    todos: {
      add: {
        input: { type: "string" },
        kind: "server",
        output: { type: "boolean" },
      },
    },
  },
  views: {
    "/": {
      context: {
        properties: { teamId: { type: "string" } },
        required: ["teamId"],
        type: "object",
      },
    },
  },
};

const markdownLink = /\]\((?<target>[^)]+)\)/gu;
const fencedCode = /```[\s\S]*?```/gu;

it("generates a discoverable skill with working reference links, including custom output paths", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "patchsmith-capabilities-skill-")
  );

  try {
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { name: "Example", slug: "example", host: "https://host.test" };'
    );
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src/unused-server.ts"),
      'throw new Error("Never evaluate server code");'
    );

    const skillPath = path.join(
      root,
      ".agents/skills/patchsmith-capabilities/SKILL.md"
    );

    for (const outFile of [undefined, "src/custom contracts/host.ts"]) {
      // oxlint-disable-next-line no-await-in-loop -- Each generation must replace the preceding skill's links.
      await generateTypes({ cwd: root, outFile, schema });
      // oxlint-disable-next-line no-await-in-loop -- Verify the artifact produced by this generation before replacing it.
      const skill = await readFile(skillPath, "utf-8");
      expect(skill).toMatch(
        /^---\nname: patchsmith-capabilities\ndescription: .+\n---\n/u
      );
      expect(skill.length).toBeLessThan(2200);
      const links = [...skill.matchAll(markdownLink)];
      expect(links).toHaveLength(5);
      // oxlint-disable-next-line no-await-in-loop -- Check this generation before the next generation replaces its references.
      await Promise.all(
        links.map(async (link) => {
          const target = link.groups?.target;

          if (target === undefined) {
            throw new Error("Missing skill reference target.");
          }

          const reference = await readFile(
            path.resolve(path.dirname(skillPath), decodeURIComponent(target)),
            "utf-8"
          );

          expect(reference.length).toBeGreaterThan(0);
        })
      );

      // oxlint-disable-next-line no-await-in-loop -- Verify links for this output path before generating the next one.
      const component = await readFile(
        path.join(path.dirname(skillPath), "references/components/Button.md"),
        "utf-8"
      );

      expect(component).toContain(schema.components?.Button?.description);

      if (outFile !== undefined) {
        expect(component).toContain("custom%20contracts/host.ts");
      }

      const pending = [skillPath];
      const visited = new Set<string>();

      while (pending.length > 0) {
        const document = pending.pop();

        if (document === undefined || visited.has(document)) {
          continue;
        }

        visited.add(document);
        // oxlint-disable-next-line no-await-in-loop -- Follow the generated link graph after discovering each document's targets.
        const markdown = await readFile(document, "utf-8");
        // oxlint-disable-next-line no-await-in-loop -- Each document supplies the next set of references to verify.
        await Promise.all(
          [...markdown.replaceAll(fencedCode, "").matchAll(markdownLink)].map(
            async (link) => {
              const target = link.groups?.target;

              if (target === undefined) {
                throw new Error("Missing reference target.");
              }

              const destination = path.resolve(
                path.dirname(document),
                decodeURIComponent(target)
              );

              const reference = await readFile(destination, "utf-8");
              expect(reference.length).toBeGreaterThan(0);

              if (destination.endsWith(".md")) {
                pending.push(destination);
              }
            }
          )
        );
      }
    }

    await writeFile(
      skillPath,
      "---\nname: patchsmith-capabilities\ndescription: Custom project guidance.\n---\nKeep this guidance.\n"
    );

    const userReference = path.join(
      path.dirname(skillPath),
      "references/index.md"
    );

    await writeFile(userReference, "Custom reference.");
    await generateTypes({ cwd: root, schema });
    expect(await readFile(skillPath, "utf-8")).toContain("Keep this guidance.");
    expect(await readFile(userReference, "utf-8")).toBe("Custom reference.");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it("typechecks components, callbacks, tools, hooks and context from one bindings file", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "patchsmith-single-bindings-")
  );

  try {
    await writeFile(path.join(root, "host.ts"), renderGeneratedTypes(schema));
    await writeFile(
      path.join(root, "consumer.ts"),
      `
import { Button, Input, tools } from "./host";
import { defineHook } from "patchsmith/server";
defineHook({ hook: "sync", handler: ({ input }) => input.length });
defineHook({ hook: "notify", handler: () => {} });
// @ts-expect-error Hook output stays typed through generated module augmentation.
defineHook({ hook: "sync", handler: () => "wrong" });
// @ts-expect-error Hook names must be declared by the host.
defineHook({ hook: "missing", handler: () => {} });
import type { ButtonProps, InputProps, ViewProps, PatchsmithBackendTools } from "./host";
const button: ButtonProps = { variant: "primary", onPress: () => {} };
const input: InputProps = { onChange: ({ value }) => { value.toUpperCase(); } };
const syncResult: ButtonProps = { onValidate: () => true };
const asyncResult: ButtonProps = { onValidate: async () => true };
const asyncVoid: ButtonProps = { onPress: async () => {} };
// @ts-expect-error Callback output schemas reject incompatible synchronous results.
const invalidResult: ButtonProps = { onValidate: () => "yes" };
// @ts-expect-error Callback output schemas reject incompatible promised results.
const invalidAsyncResult: ButtonProps = { onValidate: async () => "yes" };
const context: ViewProps<"/">["context"] = { teamId: "team-1" };
const backend: PatchsmithBackendTools = tools;
const added: Promise<boolean> = backend.todos.add("title");
// @ts-expect-error Unsupported component variants remain rejected.
const invalidButton: ButtonProps = { variant: "danger" };
// @ts-expect-error Callback payloads are serialized objects, not strings.
const invalidInput: InputProps = { onChange: (value: string) => {} };
// @ts-expect-error Required context stays required through module augmentation.
const invalidContext: ViewProps<"/">["context"] = {};
// @ts-expect-error Host tool inputs stay typed.
tools.todos.add(123);
`
    );
    const require = createRequire(import.meta.url);

    const client = fileURLToPath(
      import.meta.resolve("@patchsmith/app/client")
    ).replace(/\.js$/u, ".d.ts");

    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          paths: {
            "patchsmith/client": [client],
            "patchsmith/server": [
              fileURLToPath(
                import.meta.resolve("@patchsmith/app/server")
              ).replace(/\.js$/u, ".d.ts"),
            ],
          },
          skipLibCheck: true,
          strict: true,
          target: "ESNext",
          types: [],
        },
        files: ["consumer.ts"],
      })
    );

    const compiler = path.join(
      path.dirname(require.resolve("typescript/package.json")),
      "bin/tsc"
    );

    // oxlint-disable-next-line typescript/strict-void-return -- Node's callback API intentionally returns a ChildProcess when promisified.
    const result = await promisify(execFile)(process.execPath, [
      compiler,
      "-p",
      path.join(root, "tsconfig.json"),
    ]);

    expect(result.stdout).toBe("");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it("generates targeted human-readable references from the same component and slot contracts", () => {
  const files = renderGeneratedReferences(schema, {
    bindingsPath: "../../../src/patchsmith.gen.ts",
  });

  expect(files["components/Button.md"]).toContain('"primary", "secondary"');
  expect(files["components/Button.md"]).toContain(
    schema.components?.Button?.description
  );
  expect(files["components/Button.md"]).toContain("onPress | no payload");
  expect(files["components/Button.md"]).not.toContain("onChange");
  expect(files["components/Input.md"]).toContain("value (required): string");
  expect(files["components/Input.md"]).toContain("Does not accept children");
  expect(files["views.md"]).toContain("Main content area.");
  expect(files["views.md"]).toContain("teamId (required): string");
  expect(files["index.md"]?.length).toBeLessThan(1500);
});

it("carries component and slot descriptions from a host contract into skill references", () => {
  const contract = createPatchsmithSchema({
    components: {
      Form: {
        children: true,
        description:
          "disabled blocks submission only.\nInputs remain editable.",
      },
      Input: {},
    },
    slots: { panel: { description: "Compact workspace panel.", views: ["/"] } },
    views: { "/": z.object({}) },
  }).serialize();

  const files = renderGeneratedReferences(contract, {
    bindingsPath: "../../../src/patchsmith.gen.ts",
  });

  expect(files["components/Form.md"]).toContain(
    "disabled blocks submission only.\nInputs remain editable."
  );
  expect(files["views.md"]).toContain("Compact workspace panel.");
  expect(files["components/Input.md"]).not.toContain("undefined");
});

it("exposes every host hook with its payload, output and registration path", () => {
  const files = renderGeneratedReferences(schema, {
    bindingsPath: "../../../src/patchsmith.gen.ts",
  });

  const hookIndex = files["hooks.md"] ?? "";

  const targets = [...hookIndex.matchAll(markdownLink)].flatMap((link) => {
    const target = link.groups?.target;

    return target?.startsWith("hooks/") === true ? [target] : [];
  });

  expect(targets).toHaveLength(Object.keys(schema.hooks ?? {}).length);

  for (const target of targets) {
    expect(files[target]).toBeDefined();
  }

  expect(files["index.md"]).toContain("](hooks.md)");
  expect(files["hooks/recordChanged.md"]).toContain("record (required)");
  expect(files["hooks/recordChanged.md"]).toContain("id (required): string");
  expect(files["hooks/recordChanged.md"]).toContain(
    "hooks/recordChanged.hook.ts"
  );
  expect(files["hooks/notify.md"]).toContain("Input: no payload");
  expect(files["hooks/notify.md"]).toContain("Output: none");
  expect(files["hooks/sync.md"]).toContain("Input: string");
  expect(files["hooks/sync.md"]).toContain("Required output: number");
  expect(files["hooks/records.created.md"]).toContain("Optional input: string");
  expect(files["hooks/records.created.md"]).toContain(
    "Optional output: boolean"
  );
  expect(files["hooks/records.created.md"]).toContain(
    "hooks/records/created.hook.ts"
  );
});

it("distinguishes a host without hooks from a host with unimplemented hooks", () => {
  for (const contract of [{}, { hooks: {} }]) {
    const files = renderGeneratedReferences(contract, {
      bindingsPath: "../../../patchsmith.gen.ts",
    });

    expect(files["hooks.md"]).toContain("declares no hooks");
    expect(
      Object.keys(files).filter((filename) => filename.startsWith("hooks/"))
    ).toEqual([]);
  }
});

it("keeps references writable and distinct for long host hook names", () => {
  const prefix = ["a".repeat(64), "b".repeat(64), "c".repeat(64)].join(".");
  const names = [`${prefix}.created`, `${prefix}.updated`];

  const files = renderGeneratedReferences(
    { hooks: Object.fromEntries(names.map((name) => [name, {}])) },
    { bindingsPath: "../../../patchsmith.gen.ts" }
  );

  const references = Object.keys(files).filter((filename) =>
    filename.startsWith("hooks/")
  );

  expect(references).toHaveLength(2);

  for (const filename of references) {
    expect(path.basename(filename).length).toBeLessThanOrEqual(255);
    expect(files["hooks.md"]).toContain(`](${filename})`);
  }

  for (const name of names) {
    expect(
      references.some(
        (filename) => files[filename]?.includes(`# ${name}\n`) === true
      )
    ).toBe(true);
  }
});

it("keeps responsive primitive references small without dropping the host's keys or tokens", () => {
  const contract = createPatchsmithSchema({
    components: primitives({
      breakpoints: { lg: "1024px", md: "768px" },
      tokens: { background: { accent: "blue", surface: "white" } },
    }),
  }).serialize();

  const files = renderGeneratedReferences(contract, {
    bindingsPath: "../../../src/patchsmith.gen.ts",
  });

  // Numeric spacing and size tokens expand the contract's literal value lists.
  expect(files["components/Box.md"]?.length).toBeLessThan(8000);
  expect(files["components/Box.md"]).toContain('"accent", "surface"');
  expect(files["components/Box.md"]).toContain("responsive/state object");
  expect(files["styling.md"]).toContain('"md"');
  expect(files["styling.md"]).toContain('":focus-visible"');
});

it("removes obsolete references on regeneration and preserves unrelated source and skill files", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "patchsmith-regenerate-references-")
  );

  try {
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { name: "Example", slug: "example", host: "https://host.test" };'
    );
    await generateTypes({ cwd: root, schema });

    const skillDirectory = path.join(
      root,
      ".agents/skills/patchsmith-capabilities"
    );

    await writeFile(path.join(skillDirectory, "notes.md"), "user content");

    const extensionless = await generateTypes({
      cwd: root,
      outFile: "host",
      schema,
    });

    expect(await readFile(extensionless, "utf-8")).toContain(
      "export const Button"
    );
    await generateTypes({
      cwd: root,
      schema: { ...schema, components: {}, hooks: {} },
    });
    await expect(
      readFile(path.join(skillDirectory, "references/components/Button.md"))
    ).rejects.toThrow();
    await expect(
      readFile(path.join(skillDirectory, "references/hooks/recordChanged.md"))
    ).rejects.toThrow();
    expect(
      await readFile(path.join(root, "patchsmith.gen.ts"), "utf-8")
    ).not.toContain("export const Button");
    expect(await readFile(path.join(skillDirectory, "notes.md"), "utf-8")).toBe(
      "user content"
    );
    await mkdir(path.join(root, "custom"));
    await writeFile(path.join(root, "custom/keep.txt"), "user content");
    await generateTypes({ cwd: root, outFile: "custom.ts", schema });
    expect(await readFile(path.join(root, "custom/keep.txt"), "utf-8")).toBe(
      "user content"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it("preserves an existing references directory without a generated ownership marker", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "patchsmith-user-references-")
  );

  try {
    await writeFile(
      path.join(root, "patchsmith.config.mjs"),
      'export default { name: "Example", slug: "example", host: "https://host.test" };'
    );

    const referencesDirectory = path.join(
      root,
      ".agents/skills/patchsmith-capabilities/references"
    );

    await mkdir(referencesDirectory, { recursive: true });
    await writeFile(path.join(referencesDirectory, "notes.md"), "user content");
    await expect(generateTypes({ cwd: root, schema })).rejects.toThrow(
      "non-generated directory"
    );
    expect(
      await readFile(path.join(referencesDirectory, "notes.md"), "utf-8")
    ).toBe("user content");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
