import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { experimental_canvas, hook, tool, defineContract } from "patchsmith";
import { primitives } from "patchsmith/valibot";
import * as v from "valibot";

import { theme } from "./theme";

const todo = v.object({
  done: v.boolean(),
  id: v.string(),
  title: v.string(),
});

const json = <
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema
) => toStandardJsonSchema(schema);

const primitiveComponents = Object.fromEntries(
  Object.entries(primitives(theme)).map(([name, component]) => [
    name,
    {
      ...component,
      // SAFETY: These component fields are the Valibot schemas declared in this file; the shared Standard Schema component interface erases the Valibot-specific schema members required by the JSON converter.
      fields: json(
        /* oxlint-disable typescript/no-unsafe-type-assertion -- These component fields are the Valibot schemas declared in this file; the shared Standard Schema component interface erases the Valibot-specific schema members required by the JSON converter. */
        component.fields as v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>
        /* oxlint-enable typescript/no-unsafe-type-assertion */
      ),
    },
  ])
);

export const contract = defineContract({
  components: {
    experimental_Canvas: experimental_canvas({
      input: { keyboard: ["ArrowLeft", "ArrowRight"], pointer: true },
      maxFramesPerSecond: 60,
      maxPixels: 1_048_576,
    }),
    ...primitiveComponents,
    Button: {
      callbacks: { onClick: {} },
      children: true,
      fields: json(
        v.object({
          disabled: v.optional(v.boolean()),
          size: v.optional(
            v.picklist(["default", "sm", "lg", "icon", "icon-sm"])
          ),
          variant: v.optional(
            v.picklist([
              "default",
              "secondary",
              "ghost",
              "outline",
              "destructive",
            ])
          ),
        })
      ),
    },
    Input: {
      callbacks: {
        onValueChange: { input: json(v.object({ value: v.string() })) },
      },
      fields: json(
        v.object({ placeholder: v.optional(v.string()), value: v.string() })
      ),
    },
  },
  hooks: { ping: hook().output(json(v.literal("pong"))) },
  scopes: {
    team: json(v.object({ teamId: v.pipe(v.string(), v.minLength(1)) })),
    user: json(v.object({ userId: v.pipe(v.string(), v.minLength(1)) })),
  },
  slots: { canvas: { views: ["/"] }, panel: { views: ["/"] } },
  tools: {
    todos: {
      add: tool
        .client()
        .input(
          json(
            v.object({
              title: v.pipe(v.string(), v.minLength(1), v.maxLength(160)),
            })
          )
        )
        .output(json(todo)),
      list: tool.client().output(json(v.array(todo))),
      remove: tool
        .client()
        .input(json(v.object({ id: v.string() })))
        .output(json(v.object({ ok: v.boolean() }))),
      toggle: tool
        .client()
        .input(json(v.object({ id: v.string() })))
        .output(json(todo)),
    },
  },
  views: {
    "/": json(
      v.object({
        team: v.object({ id: v.string(), name: v.string() }),
        user: v.object({ id: v.string(), name: v.string() }),
      })
    ),
  },
});
