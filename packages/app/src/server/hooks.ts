import type { PlatformHooks, ReservedHookName } from "#hooks";
import type { PatchsmithServerFunctions } from "#views";

import type { ActionContext, FunctionCalls } from "./functions";

// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type -- Generated host bindings augment this interface.
export interface PatchsmithHooks {}

type HookDefinitions = PlatformHooks & Omit<PatchsmithHooks, ReservedHookName>;

export type HookName = Extract<keyof HookDefinitions, string>;

export type HookContext = Omit<
  ActionContext,
  "queries" | "mutations" | "actions"
> & {
  readonly queries: FunctionCalls<PatchsmithServerFunctions, "query">;
  readonly mutations: FunctionCalls<PatchsmithServerFunctions, "mutation">;
  readonly actions: FunctionCalls<PatchsmithServerFunctions, "action">;
};

/** Bind an app handler to a host-defined or built-in platform hook. */
export const defineHook = <const N extends HookName>(definition: {
  hook: N;
  handler: (
    context: HookContext & { readonly input: HookDefinitions[N]["input"] }
  ) => HookDefinitions[N]["output"] | Promise<HookDefinitions[N]["output"]>;
}) => Object.freeze(definition);
