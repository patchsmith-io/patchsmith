import { defineHook } from "patchsmith/server";

export default defineHook({
  handler: (): "pong" => "pong",
  hook: "ping",
});
