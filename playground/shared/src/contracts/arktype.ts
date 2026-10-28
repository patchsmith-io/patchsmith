import { type } from "arktype";
import { experimental_canvas, hook, tool, defineContract } from "patchsmith";
import { primitives } from "patchsmith/arktype";

import { theme } from "./theme";

const todo = type({ done: "boolean", id: "string", title: "string" });

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
      fields: type({
        "disabled?": "boolean",
        "size?": "'default' | 'sm' | 'lg' | 'icon' | 'icon-sm'",
        "variant?":
          "'default' | 'secondary' | 'ghost' | 'outline' | 'destructive'",
      }),
    },
    Input: {
      callbacks: { onValueChange: { input: type({ value: "string" }) } },
      fields: type({ "placeholder?": "string", value: "string" }),
    },
  },
  hooks: { ping: hook().output(type("'pong'")) },
  scopes: {
    team: type({ teamId: "string > 0" }),
    user: type({ userId: "string > 0" }),
  },
  slots: { canvas: { views: ["/"] }, panel: { views: ["/"] } },
  tools: {
    todos: {
      add: tool
        .client()
        .input(type({ title: "0 < string <= 160" }))
        .output(todo),
      list: tool.client().output(todo.array()),
      remove: tool
        .client()
        .input(type({ id: "string" }))
        .output(type({ ok: "boolean" })),
      toggle: tool
        .client()
        .input(type({ id: "string" }))
        .output(todo),
    },
  },
  views: {
    "/": type({
      team: { id: "string", name: "string" },
      user: { id: "string", name: "string" },
    }),
  },
});
