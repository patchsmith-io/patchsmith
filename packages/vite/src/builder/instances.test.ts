import { expect, it } from "vite-plus/test";

import { extractInstances } from "./instances";

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error("Expected a defined value.");
  }

  return value;
};

const source = `
import { defineView as cv } from "patchsmith/client";
import { z } from "zod";
import { serverHelper } from "./server-helper";
import { Widget } from "./widget";
const privateValue = "SERVER_ONLY_SECRET";
const shared = "Shared label";
function format(value) { return serverHelper(value) + privateValue + shared; }
const view = cv({ slot: "page", view: "/",
  instances: {
    dataSchema: z.object({ id: z.string() }),
    resolve: async ({ queries, context }) => {
      const rows = await queries.reports.list({ user: context.user.id });
      return rows.map(row => ({ key: row.id, metadata: { title: format(row.id) }, data: { id: row.id } }));
    },
  },
  component: () => <Widget label={shared} />,
});
export default view;
`;

it("extracts resolver dependencies without executing or retaining the component", async () => {
  const result = await extractInstances("/app/page.tsx", source, "/app");
  expect(result).toBeDefined();
  expect(requireValue(result).server).toContain("SERVER_ONLY_SECRET");
  expect(requireValue(result).server).toContain("./server-helper");
  expect(requireValue(result).server).toContain("queries.reports.list");
  expect(requireValue(result).server).not.toContain("./widget");
  expect(requireValue(result).server).not.toContain("patchsmith/client");
  expect(requireValue(result).server).not.toContain("preact");
  expect(requireValue(result).browser).not.toContain("SERVER_ONLY_SECRET");
  expect(requireValue(result).browser).not.toContain("serverHelper");
  expect(requireValue(result).browser).not.toContain("queries.reports.list");
  expect(requireValue(result).browser).not.toContain('from "zod"');
  expect(requireValue(result).browser).toContain("./widget");
  expect(requireValue(result).browser).toContain("Shared label");
  expect(requireValue(result).server).toContain("Shared label");
  expect(requireValue(result).browser).toContain(
    requireValue(requireValue(result).names[0])
  );
});

it("extracts namespace defineView instances with inferred file routes", async () => {
  const filename = "/app/slots/page/customers.details.view.tsx";
  const named = source.replace('slot: "page", view: "/",', "");

  const namespace = named
    .replace("import { defineView as cv }", "import * as client")
    .replace("cv({", "client.defineView({");

  const result = await extractInstances(filename, namespace, "/app");
  expect(result).toBeDefined();
  expect(result?.server).toContain("SERVER_ONLY_SECRET");
  expect(result?.server).not.toContain("patchsmith/client");
  expect(result?.browser).toContain("client.defineView");
  expect(result?.browser).toContain('slot: "page"');
  expect(result?.browser).toContain('view: "/customers/details"');
  expect(result?.browser).not.toContain("SERVER_ONLY_SECRET");
  expect(result?.browser).not.toContain("queries.reports.list");
  const namedResult = await extractInstances(filename, named, "/app");
  expect(result?.names).toEqual(namedResult?.names);
});

it("ignores instances in calls shadowing the SDK import", async () => {
  const unrelated = `function helper(cv) {
    return cv({ instances: { dataSchema: {}, resolve: () => [] }, component: () => null });
  }`;

  const result = await extractInstances(
    "/app/page.tsx",
    `${source}\n${unrelated}`,
    "/app"
  );

  expect(result?.names).toHaveLength(1);
  expect(result?.server).not.toContain("function helper");
  expect(result?.browser).toContain("function helper");
});

it("keeps resolver references stable when component code or source positions change", async () => {
  const first = await extractInstances("/app/page.tsx", source, "/app");

  const second = await extractInstances(
    "/app/page.tsx",
    `\n// changed\n${source.replace("Shared label", "Other label")}`,
    "/app"
  );

  expect(requireValue(second).names).toEqual(requireValue(first).names);
});

it("handles shadowed variables, destructuring defaults and Unicode source offsets", async () => {
  const code = source
    .replace('"SERVER_ONLY_SECRET"', '"Private 🐈"')
    .replace(
      "const rows = await queries.reports.list",
      "function inner(privateValue) { return privateValue; }\nconst { id = format('x') } = context;\nvoid inner(id);\nconst rows = await queries.reports.list"
    );

  const result = await extractInstances("/app/page.tsx", code, "/app");
  expect(requireValue(result).server).toContain("Private 🐈");
  expect(requireValue(result).browser).not.toContain("Private 🐈");
});

it("rejects browser globals and captured view definitions in server resolvers", async () => {
  await expect(
    extractInstances(
      "/app/page.tsx",
      source.replace("serverHelper(value)", "document.title"),
      "/app"
    )
  ).rejects.toThrow("browser global document");
  await expect(
    extractInstances(
      "/app/page.tsx",
      source.replace("serverHelper(value)", "view.useContext()"),
      "/app"
    )
  ).rejects.toThrow("cannot capture a view definition");
});

it("rejects dynamic definitions rather than leaving a resolver in the browser", async () => {
  await expect(
    extractInstances(
      "/app/page.tsx",
      source.replace("instances: {", "instances: { ...extra,"),
      "/app"
    )
  ).rejects.toThrow("cannot contain spreads");
  await expect(
    extractInstances(
      "/app/page.tsx",
      source.replace('view: "/"', "view: path"),
      "/app"
    )
  ).rejects.toThrow("must be string literals");
  await expect(
    extractInstances("/app/page.tsx", source.replace('view: "/",', ""), "/app")
  ).rejects.toThrow("must be string literals");
  await expect(
    extractInstances(
      "/app/page.tsx",
      `function factory() { ${source.replaceAll(/^import .*$/gmu, "").replace("export default view;", "return view;")} }\nimport { defineView as cv } from "patchsmith/client";`,
      "/app"
    )
  ).rejects.toThrow("module scope");
});

it("extracts an explicit static policy while retaining runtime behavior for none", async () => {
  const staticSource = source
    .replace("dataSchema:", 'cache: "static", dataSchema:')
    .replace("async ({ queries, context }) => {", "async () => {")
    .replace(
      "const rows = await queries.reports.list({ user: context.user.id });",
      'const rows = [{ id: "reports" }];'
    );

  const result = await extractInstances("/app/page.tsx", staticSource, "/app");

  expect(result?.browser).toContain('cache: "static"');
  expect(result?.browser).not.toContain("SERVER_ONLY_SECRET");
  expect(result?.server).toContain("SERVER_ONLY_SECRET");

  const runtime = await extractInstances(
    "/app/page.tsx",
    source.replace("dataSchema:", 'cache: "none", dataSchema:'),
    "/app"
  );

  expect(runtime?.browser).not.toContain("cache:");
  expect(runtime?.server).toContain("queries.reports.list");
});

it.each(['"infinity"', "policy", "{}", "undefined"])(
  "rejects unsupported or nonliteral cache policies: %s",
  async (cache) => {
    await expect(
      extractInstances(
        "/app/page.tsx",
        source.replace("dataSchema:", `cache: ${cache}, dataSchema:`),
        "/app"
      )
    ).rejects.toThrow('instances.cache must be the literal "none" or "static"');
  }
);

it("rejects request arguments in static resolvers", async () => {
  await expect(
    extractInstances(
      "/app/page.tsx",
      source.replace("dataSchema:", 'cache: "static", dataSchema:'),
      "/app"
    )
  ).rejects.toThrow("cannot receive runtime arguments");
});
