import * as v from "valibot";
import { expect, it } from "vite-plus/test";
import { z } from "zod";

import { defineContract } from "./contract";
import { hook } from "./hooks";
import { createPatchsmithSchema } from "./schema";

it("serializes hook payloads in the direction seen by app handlers", () => {
  const contract = defineContract({
    hooks: {
      sync: hook()
        .input(
          z
            .string()
            .transform((value) => value.length)
            .pipe(z.number())
        )
        .output(
          z
            .string()
            .transform((value) => value.length)
            .pipe(z.number())
        ),
    },
  });

  const serialized = createPatchsmithSchema({ ...contract }).serialize();
  expect(serialized.hooks.sync?.input).toMatchObject({ type: "number" });
  expect(serialized.hooks.sync?.output).toMatchObject({ type: "string" });
});

it("rejects invalid hook names and keeps hook builders immutable", () => {
  const base = hook();
  const configured = base.input(z.string()).output(z.number());
  expect(base.definition).toEqual({ input: undefined, output: undefined });
  expect(configured.definition.input).toBeDefined();
  expect(
    defineContract({ hooks: { "customers.sync": configured } }).hooks[
      "customers.sync"
    ]
  ).toBe(configured);

  for (const name of [
    "",
    "a..b",
    "constructor",
    "a.prototype",
    "_private",
    "a/b",
  ]) {
    // @ts-expect-error Untyped callers can supply names that static hook maps reject.
    expect(() => defineContract({ hooks: { [name]: base } })).toThrow(
      "Invalid hook name"
    );
  }
});

it.each([
  {
    name: "required sync",
    optional: false,
    schema: v.object({ id: v.string() }),
  },
  {
    name: "optional sync",
    optional: true,
    schema: v.optional(v.object({ id: v.string() })),
  },
  {
    name: "required async",
    optional: false,
    schema: v.objectAsync({ id: v.string() }),
  },
  {
    name: "optional async",
    optional: false,
    schema: v.optionalAsync(v.objectAsync({ id: v.string() })),
  },
])(
  "only infers omission after synchronous validation: $name",
  ({ optional, schema }) => {
    const serialized = createPatchsmithSchema({
      components: {},
      hooks: { sync: hook().input(schema).output(schema) },
      views: { "/": schema },
    }).serialize(() => ({ type: "object" }));

    const expected = optional ? true : undefined;
    expect(serialized.hooks.sync?.inputOptional).toBe(expected);
    expect(serialized.hooks.sync?.outputOptional).toBe(expected);
    expect(serialized.views["/"]?.contextOptional).toBe(expected);
  }
);

it.each([
  "patchsmith",
  "patchsmith.onInstall",
  "patchsmith.custom",
  "patchsmith.nested.custom",
])("reserves platform hook declarations at runtime: %s", (name) => {
  const hooks = { [name]: hook() };
  // @ts-expect-error Exercise runtime validation for untyped host declarations.
  expect(() => defineContract({ hooks })).toThrow("namespace is reserved");
  // @ts-expect-error Exercise runtime validation for untyped low-level schemas.
  expect(() => createPatchsmithSchema({ components: {}, hooks })).toThrow(
    "namespace is reserved"
  );
});
