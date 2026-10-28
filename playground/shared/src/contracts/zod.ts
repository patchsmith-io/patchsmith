import { experimental_canvas, hook, tool, defineContract } from "patchsmith";
import { primitives } from "patchsmith/zod";
import { z } from "zod";

import { theme } from "./theme";

const todo = z.object({
  done: z.boolean(),
  id: z.string(),
  title: z.string(),
});

export const contract = defineContract({
  components: {
    experimental_Canvas: experimental_canvas({
      input: { keyboard: ["ArrowLeft", "ArrowRight"], pointer: true },
      maxFramesPerSecond: 60,
      maxPixels: 1_048_576,
    }),
    ...primitives(theme),
    Button: {
      callbacks: { onClick: {} },
      children: true,
      fields: z.object({
        disabled: z.boolean().optional(),
        size: z.enum(["default", "sm", "lg", "icon", "icon-sm"]).optional(),
        variant: z
          .enum(["default", "secondary", "ghost", "outline", "destructive"])
          .optional(),
      }),
    },
    Input: {
      callbacks: { onValueChange: { input: z.object({ value: z.string() }) } },
      fields: z.object({
        placeholder: z.string().optional(),
        value: z.string(),
      }),
    },
  },
  hooks: { ping: hook().output(z.literal("pong")) },
  scopes: {
    team: z.object({ teamId: z.string().min(1) }),
    user: z.object({ userId: z.string().min(1) }),
  },
  slots: { canvas: { views: ["/"] }, panel: { views: ["/"] } },
  tools: {
    todos: {
      add: tool
        .client()
        .input(z.object({ title: z.string().min(1).max(160) }))
        .output(todo),
      list: tool.client().output(z.array(todo)),
      remove: tool
        .client()
        .input(z.object({ id: z.string() }))
        .output(z.object({ ok: z.boolean() })),
      toggle: tool
        .client()
        .input(z.object({ id: z.string() }))
        .output(todo),
    },
  },
  views: {
    "/": z.object({
      team: z.object({ id: z.string(), name: z.string() }),
      user: z.object({ id: z.string(), name: z.string() }),
    }),
  },
});
