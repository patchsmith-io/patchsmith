import type { SerializedComponent } from "./types";

const identifierPattern = /^[A-Za-z_$][\w$]*$/u;

/** Examples use generated types for caller-supplied values instead of guessing required data. */
export const componentExample = (
  identifier: string,
  children: boolean
): string => {
  const tag = /^[a-z]/u.test(identifier) ? "Component" : identifier;
  const imported = tag === identifier ? identifier : `${identifier} as ${tag}`;

  return [
    "## Usage",
    "",
    children
      ? "Supply the required props listed above. Use supported children between tags."
      : "Supply the required props listed above. This component does not accept children.",
    "",
    "```tsx",
    `import { ${imported} } from "#patchsmith";`,
    `import type { ${identifier}Props } from "#patchsmith";`,
    "",
    `export const Example = (props: ${identifier}Props) => (`,
    children
      ? `  <${tag} {...props}>Example content</${tag}>`
      : `  <${tag} {...props} />`,
    ");",
    "```",
  ].join("\n");
};

export const valueCallbackExample = (
  identifier: string,
  component: SerializedComponent
): string => {
  const value = component.fields?.properties?.value;

  if (
    value?.type !== "string" ||
    value.enum !== undefined ||
    "const" in value
  ) {
    return "";
  }

  const callback = Object.entries(component.callbacks ?? {}).find(
    ([, contract]) =>
      contract.input?.properties?.value?.type === "string" &&
      contract.input.required?.includes("value") === true
  );

  if (callback === undefined) {
    return "";
  }

  const [name] = callback;

  if (!identifierPattern.test(name)) {
    return "";
  }

  const tag = /^[a-z]/u.test(identifier) ? "Component" : identifier;
  const imported = tag === identifier ? identifier : `${identifier} as ${tag}`;

  return [
    "",
    "### Local value and callback",
    "",
    "Keep the field value in component state and use the declared callback payload.",
    "",
    "```tsx",
    'import { useState } from "preact/hooks";',
    `import { ${imported} } from "#patchsmith";`,
    `import type { ${identifier}Props } from "#patchsmith";`,
    "",
    `export const ValueExample = (props: ${identifier}Props) => {`,
    '  const [value, setValue] = useState(props.value ?? "");',
    `  return <${tag} {...props} value={value} ${name}={({ value }) => setValue(value)} />;`,
    "};",
    "```",
  ].join("\n");
};

export const stylingExample = (
  identifier: string,
  prop: string,
  tokens: string[],
  keys: string[]
): string => {
  const [base, alternate = base] = tokens;

  if (base === undefined || !keys.includes("default")) {
    return "";
  }

  const breakpoint = keys.find(
    (key) => key !== "default" && !key.startsWith(":")
  );

  const state = keys.find((key) => key.startsWith(":"));
  const values = [`default: ${JSON.stringify(base)}`];

  if (breakpoint !== undefined) {
    values.push(`${JSON.stringify(breakpoint)}: ${JSON.stringify(alternate)}`);
  }

  if (state !== undefined) {
    values.push(`${JSON.stringify(state)}: ${JSON.stringify(alternate)}`);
  }

  return [
    "",
    "### Responsive styling example",
    "",
    "These tokens and keys come from this prop's schema; other props may accept different values.",
    "",
    "```ts",
    `import type { ${identifier}Props } from "#patchsmith";`,
    `export const styles: Pick<${identifier}Props, ${JSON.stringify(prop)}> = {`,
    `  ${JSON.stringify(prop)}: { ${values.join(", ")} },`,
    "};",
    "```",
  ].join("\n");
};

export const toolExample = (segments: string[], hasInput: boolean): string => {
  const reference = `tools${segments.map((segment) => (identifierPattern.test(segment) ? `.${segment}` : `[${JSON.stringify(segment)}]`)).join("")}`;
  const parameter = hasInput ? `input: Parameters<typeof ${reference}>[0]` : "";

  return [
    "```ts",
    'import { tools } from "#patchsmith";',
    "",
    `export const run = async (${parameter}) =>`,
    `  await ${reference}(${hasInput ? "input" : ""});`,
    "```",
  ].join("\n");
};

export const viewExample = (
  slot: string,
  view: string,
  multiple: boolean
): string => {
  const lines = [
    "```tsx",
    'import "#patchsmith";',
    'import { defineView } from "patchsmith/client";',
  ];

  if (multiple) {
    lines.push(
      'import type { ComponentChildren } from "preact";',
      'import * as v from "valibot";',
      "",
      "const Content = (): ComponentChildren => {",
      "  const { data } = definition.useInstance();",
      "  return data.title;",
      "};"
    );
  } else {
    lines.push("", 'const Content = () => "App content";');
  }

  lines.push(
    "",
    "const definition = defineView({",
    `  slot: ${JSON.stringify(slot)},`,
    `  view: ${JSON.stringify(view)},`,
    "  component: Content,"
  );

  if (multiple) {
    lines.push(
      "  instances: {",
      "    dataSchema: v.object({ title: v.string() }),",
      "    resolve: () => [",
      '      { key: "overview", metadata: {}, data: { title: "Overview" } },',
      "    ],",
      "  },"
    );
  }

  lines.push("});", "", "export default definition;", "```");

  return lines.join("\n");
};
