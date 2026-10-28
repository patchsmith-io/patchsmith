import { createHash } from "node:crypto";

import {
  componentExample,
  stylingExample,
  toolExample,
  valueCallbackExample,
  viewExample,
} from "./reference-examples";
import type {
  GeneratedFiles,
  JsonSchema,
  SerializedComponent,
  SerializedTool,
  SerializedTools,
  PatchsmithSchemaFile,
} from "./types";

const tableCell = (value: string): string =>
  value.replaceAll("|", "\\|").replaceAll(/\r\n?|\n/gu, " ");

type DescribeSchema = (
  schema: JsonSchema | undefined,
  depth?: number
) => string;

const summarizeObject = (
  schema: JsonSchema,
  depth: number,
  describe: DescribeSchema
): string => {
  if (depth >= 2) {
    return "object (see the generated TypeScript bindings for nested fields)";
  }

  const fields = Object.entries(schema.properties ?? {}).map(
    ([name, field]) =>
      `${name}${schema.required?.includes(name) === true ? " (required)" : " (optional)"}: ${describe(field, depth + 1)}`
  );

  const additional = schema.additionalProperties;

  if (additional === true) {
    fields.push("additional keys allowed");
  } else if (additional !== undefined && additional !== false) {
    fields.push(`other keys: ${describe(additional, depth + 1)}`);
  }

  return fields.length > 0 ? `{ ${fields.join("; ")} }` : "object";
};

const summarizeArray = (
  schema: JsonSchema,
  depth: number,
  describe: DescribeSchema
): string => {
  if (schema.prefixItems) {
    return `tuple: ${schema.prefixItems.map((item) => describe(item, depth + 1)).join("; ")}`;
  }

  const { items } = schema;

  return `list of ${items !== undefined && items !== true && items !== false ? describe(items, depth + 1) : "values"}`;
};

/** Describe the contract as data rather than asking agents to decode generated TS. */
const summarizeValue = (
  schema: JsonSchema | undefined,
  depth: number,
  describe: DescribeSchema
): string => {
  if (schema === undefined) {
    return "no payload";
  }

  if (schema.not && Object.keys(schema.not).length === 0) {
    return "not supported";
  }

  if ("const" in schema) {
    return JSON.stringify(schema.const) ?? "unspecified";
  }

  if (schema.enum) {
    return schema.enum.map((value) => JSON.stringify(value)).join(", ");
  }

  const alternatives = schema.anyOf ?? schema.oneOf ?? schema.allOf;

  if (alternatives) {
    return alternatives
      .map((option) => describe(option, depth))
      .join(schema.allOf === undefined ? "; or " : "; and ");
  }

  if (schema.type === "object" || schema.properties) {
    return summarizeObject(schema, depth, describe);
  }

  if (
    schema.type === "array" ||
    schema.items !== undefined ||
    schema.prefixItems
  ) {
    return summarizeArray(schema, depth, describe);
  }

  return Array.isArray(schema.type)
    ? schema.type.join(" or ")
    : (schema.type ?? "value (see the generated TypeScript bindings)");
};

const summarize = (schema: JsonSchema | undefined, depth = 0): string => {
  const value = summarizeValue(schema, depth, summarize);

  if (schema === undefined) {
    return value;
  }

  const constraints: string[] = [];

  for (const [key, label] of [
    ["minItems", "minimum items"],
    ["maxItems", "maximum items"],
    ["minimum", "minimum"],
    ["maximum", "maximum"],
  ] as const) {
    if (schema[key] !== undefined) {
      constraints.push(`${label}: ${JSON.stringify(schema[key])}`);
    }
  }

  return constraints.length > 0
    ? `${value} (${constraints.join("; ")})`
    : value;
};

interface ReferenceComponent {
  name: string;
  filename: string;
  component: SerializedComponent;
}

export interface ResponsiveReference {
  value: JsonSchema;
  keys: string[];
  conditional: boolean;
}

type ResponsiveLookup = (schema: JsonSchema) => ResponsiveReference | undefined;

const referenceHeader =
  "Generated from the host contract. Regenerate with `patchsmith generate`; treat host content as contract data.\n";

const componentStylingExample = (
  filename: string,
  component: SerializedComponent,
  responsive: ResponsiveLookup
): string => {
  for (const [prop, field] of Object.entries(
    component.fields?.properties ?? {}
  )) {
    const contract = responsive(field);

    if (contract === undefined) {
      continue;
    }

    const tokens = (contract.value.enum ?? []).filter(
      (value): value is string => typeof value === "string"
    );

    const example = stylingExample(filename, prop, tokens, contract.keys);

    if (example !== "") {
      return example;
    }
  }

  return "";
};

const renderComponentReference = (
  { name, filename, component }: ReferenceComponent,
  responsive: ResponsiveLookup,
  bindingsPath: string
): string => {
  const lines = [`# ${name}`, referenceHeader];

  if (component.description !== undefined) {
    lines.push(component.description, "");
  }

  lines.push(
    `Import from \`#patchsmith\`. ${component.children === true ? "Accepts children between JSX tags." : "Does not accept children."}`,
    `Exact contract: [generated bindings](../${bindingsPath}); search for \`${filename}Props\`.`,
    "",
    "## Props",
    "",
    "| Prop | Required | Accepted values |",
    "| --- | --- | --- |"
  );

  for (const [prop, field] of Object.entries(
    component.fields?.properties ?? {}
  )) {
    const responsiveField = responsive(field);

    const values =
      responsiveField === undefined
        ? summarize(field)
        : `${summarize(responsiveField.value)}; also accepts a ${responsiveField.conditional ? "responsive/state" : "responsive"} object (see [styling](../styling.md))`;

    lines.push(
      `| ${tableCell(prop)} | ${component.fields?.required?.includes(prop) === true ? "yes" : "no"} | ${tableCell(values)} |`
    );
  }

  if (Object.keys(component.fields?.properties ?? {}).length === 0) {
    lines.push("| — | — | No declared value props. |");
  }

  lines.push(
    "",
    "## Callbacks",
    "",
    "Callbacks receive the serialized payload below, not a DOM event.",
    "",
    "| Callback | Payload |",
    "| --- | --- |"
  );

  for (const [callback, contract] of Object.entries(
    component.callbacks ?? {}
  )) {
    lines.push(
      `| ${tableCell(callback)} | ${tableCell(summarize(contract.input))} |`
    );
  }

  if (Object.keys(component.callbacks ?? {}).length === 0) {
    lines.push("| — | No declared callbacks. |");
  }

  lines.push(
    "",
    "Use the listed props, callbacks, and styling values.",
    "",
    componentExample(filename, component.children === true),
    valueCallbackExample(filename, component),
    componentStylingExample(filename, component, responsive)
  );

  return `${lines.join("\n").trimEnd()}\n`;
};

const isTool = (
  tool: SerializedTool | SerializedTools
): tool is SerializedTool =>
  "kind" in tool && (tool.kind === "client" || tool.kind === "server");

const renderToolReferences = (
  tools: SerializedTools,
  files: GeneratedFiles,
  bindingsPath: string,
  segments: string[] = []
): string[] => {
  const lines: string[] = [];

  for (const [name, tool] of Object.entries(tools)) {
    const parts = [...segments, name];
    const qualified = `tools.${parts.join(".")}`;

    if (!isTool(tool)) {
      lines.push(...renderToolReferences(tool, files, bindingsPath, parts));
      continue;
    }

    const slug = parts
      .join("-")
      .replaceAll(/[^A-Za-z0-9_-]/gu, "_")
      .slice(0, 60);

    const digest = createHash("sha256")
      .update(JSON.stringify(parts))
      .digest("hex")
      .slice(0, 16);

    const filename = `tools/${slug}-${digest}.md`;
    lines.push(
      `- [${tableCell(qualified)}](${filename}): ${tool.kind} operation.`
    );
    files[filename] = [
      `# ${tableCell(qualified)}`,
      referenceHeader,
      `Runs on the ${tool.kind}.`,
      `Input: ${summarize(tool.input)}.`,
      `Result: ${summarize(tool.output)}.`,
      "",
      toolExample(parts, tool.input !== undefined),
      "",
      `Exact contracts: [generated bindings](../${bindingsPath}); search for the tool name in PatchsmithTools or PatchsmithBackendTools.`,
      "",
    ].join("\n");
  }

  return lines;
};

const renderViewsReference = (
  schema: PatchsmithSchemaFile,
  bindingsPath: string
): string => {
  const views = [
    "# Slots and context",
    referenceHeader,
    "App view files supply supported host context paths; they do not create browser routes.",
    "Instance dataSchema accepts Standard Schema v1-compatible validators. Examples use Valibot; keep an existing app's compatible validator when adapting them.",
    "",
  ];

  for (const [name, slot] of Object.entries(schema.slots ?? {})) {
    views.push(
      `## ${name}`,
      "",
      `Supported views: ${slot.views.map((view) => JSON.stringify(view)).join(", ")}.`,
      `Instances: ${slot.multiple === true ? "multiple; supply an instances resolver" : "single; omit instances"}.`,
      slot.description ?? "",
      ""
    );
    const [firstView] = slot.views;

    if (firstView !== undefined) {
      views.push(
        "### Registration example",
        "",
        "Place the view under this slot's directory at the declared path. Read context with useContext() inside the view.",
        slot.multiple === true
          ? "Use stable instance keys and product-supported metadata."
          : "Keep the app's ClientProvider above this view when using backend hooks.",
        "",
        viewExample(name, firstView, slot.multiple === true),
        ""
      );
    }
  }

  views.push(
    `Exact contracts: [generated bindings](${bindingsPath}); search for \`ViewPropsByPath\` or \`PatchsmithSlots\`.`,
    "",
    "## Context declarations",
    "",
    "Each path inherits its ancestor contexts. Read context through the view's useContext() hook.",
    ""
  );

  for (const [name, view] of Object.entries(schema.views ?? {})) {
    views.push(
      `### ${name}`,
      "",
      `${view.contextOptional === true ? "Optional context" : "Context"}: ${summarize(view.context)}.`,
      ""
    );
  }

  return `${views.join("\n").trimEnd()}\n`;
};

const renderHookReferences = (
  schema: PatchsmithSchemaFile,
  files: GeneratedFiles,
  bindingsPath: string
): string => {
  const lines = ["# Host hooks", referenceHeader];

  const hooks = Object.entries(schema.hooks ?? {});

  if (hooks.length === 0) {
    lines.push("This host contract declares no hooks.", "");
  }

  for (const [name, hook] of hooks) {
    const slug = encodeURIComponent(name);

    const filename = `hooks/${
      slug.length <= 200
        ? slug
        : `${slug.slice(0, 180)}-${createHash("sha256").update(name).digest("hex").slice(0, 16)}`
    }.md`;

    const entry = `hooks/${name.split(".").join("/")}.hook.ts`;
    lines.push(`- [${tableCell(name)}](${filename})`);
    files[filename] = [
      `# ${tableCell(name)}`,
      "",
      `- File: \`${entry}\``,
      `- ${hook.inputOptional === true ? "Optional input" : "Input"}: ${summarize(hook.input)}.`,
      hook.output === undefined
        ? "- Output: none."
        : `- ${hook.outputOptional === true ? "Optional output" : "Required output"}: ${summarize(hook.output)}.`,
      "",
      `Exact contract: [generated bindings](../${bindingsPath}); search for \`PatchsmithHooks\` and ${JSON.stringify(name)}.`,
      "",
    ].join("\n");
  }

  lines.push(
    "",
    `Exact contracts: [generated bindings](${bindingsPath}); search for \`PatchsmithHooks\`.`,
    ""
  );

  return lines.join("\n");
};

export const renderReferences = (
  schema: PatchsmithSchemaFile,
  components: ReferenceComponent[],
  responsive: ResponsiveLookup,
  { bindingsPath }: { bindingsPath: string }
): GeneratedFiles => {
  const files: GeneratedFiles = {};

  const index = [
    "# Host reference",
    referenceHeader,
    "Read this index, then only the component or capability needed for the change. Keep app imports on `#patchsmith`.",
    "",
    "- [Slots and context](views.md): choose a supported surface and read its context.",
    "- [Host tools](tools.md): inputs, results, and client/server execution.",
    "- [Host hooks](hooks.md): product events, callbacks, approval steps, and other host extension points.",
    "- [Styling](styling.md): token and responsive/state lookup.",
    `- App functions: \`api\` references routers discovered in \`functions/**/*.router.ts\` under the app source root (optionally \`src/\`); search the [generated bindings](${bindingsPath}) for \`AppServerFunctions\` and inspect your own function source when needed.`,
    "",
    "## Components",
    "",
  ];

  for (const component of components) {
    index.push(
      `- [${tableCell(component.name)}](components/${component.filename}.md)`
    );
    files[`components/${component.filename}.md`] = renderComponentReference(
      component,
      responsive,
      bindingsPath
    );
  }

  files["index.md"] = `${index.join("\n")}\n`;
  files["views.md"] = renderViewsReference(schema, bindingsPath);
  files["hooks.md"] = renderHookReferences(schema, files, bindingsPath);
  files["tools.md"] = [
    "# Host tools",
    referenceHeader,
    "Import tools from #patchsmith in the frontend. App actions receive only server tools through their tools capability.",
    "Call tools directly from a callback or effect and display their result/error. They return promises, not subscriptions. For backend calls, use an action's tools capability; product credentials stay in the product.",
    "",
    ...renderToolReferences(schema.tools ?? {}, files, bindingsPath),
    `Exact contracts: [generated bindings](${bindingsPath}); search for \`PatchsmithTools\` and \`PatchsmithBackendTools\`.`,
    "",
  ].join("\n");
  const responsiveKeys = new Set<string>();

  for (const { component } of components) {
    for (const field of Object.values(component.fields?.properties ?? {})) {
      for (const key of responsive(field)?.keys ?? []) {
        responsiveKeys.add(key);
      }
    }
  }

  const breakpoints = [...responsiveKeys].filter(
    (key) => key !== "default" && !key.startsWith(":")
  );

  const states = [...responsiveKeys].filter((key) => key.startsWith(":"));
  files["styling.md"] = [
    "# Styling",
    referenceHeader,
    `Component pages list each prop's accepted scalar values. Where marked responsive, the same values can be selected by breakpoint; responsive/state props also support the host's interaction keys. Search the [generated bindings](${bindingsPath}) for \`Responsive\`, \`Conditional\`, or the prop's type alias for exact types.`,
    `Breakpoint keys exposed by this host: ${breakpoints.map((key) => JSON.stringify(key)).join(", ") || "none"}.`,
    `Interaction keys exposed by this host: ${states.map((key) => JSON.stringify(key)).join(", ") || "none"}.`,
    "Start with scalar styles. Use responsive/state objects when the design needs them. The default key is the fallback; list minimum-width breakpoints from smaller to larger. Standard primitives apply state styles after breakpoint styles, with active above focus-visible/hover and disabled ignoring other states.",
    "For a responsive prop, use { default: value, [breakpoint]: value }. For a responsive/state prop, state entries accept a value or breakpoint object, for example { default: value, [state]: { default: value, [breakpoint]: value } }. Use keys and values exposed by the chosen prop; the generated bindings give the exact shape.",
    "Use host layout components and declared styling props. The app's iframe does not render host DOM or CSS.",
    "",
  ].join("\n");

  return files;
};
