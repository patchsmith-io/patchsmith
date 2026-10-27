import { isReservedHookName } from "@patchsmith/app/hooks";
import type { ReservedHookName } from "@patchsmith/app/hooks";
import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { PatchsmithSchemaSpec } from "#spec/index";

import type { Schema, SchemaSerializer } from "./shared";
import { serializeSchema, schemaMayBeOmitted } from "./shared";

export interface ContractHook<
  I extends Schema | undefined = Schema | undefined,
  O extends Schema | undefined = Schema | undefined,
> {
  readonly $patchsmithHookDefinition: true;
  readonly definition: { input?: I; output?: O };
  input: <N extends Schema>(schema: N) => ContractHook<N, O>;
  output: <N extends Schema>(schema: N) => ContractHook<I, N>;
}

/** Host hooks cannot declare or replace platform-owned lifecycle hooks. */
export type ContractHooks = Record<string, ContractHook> &
  Partial<Record<ReservedHookName, never>>;

export type InferHookInput<T> = T extends { definition: { input?: infer I } }
  ? I extends Schema
    ? StandardSchemaV1.InferInput<I>
    : undefined
  : never;

export type InferHookOutput<T> = T extends { definition: { output?: infer O } }
  ? O extends Schema
    ? StandardSchemaV1.InferOutput<O>
    : ReturnType<() => void>
  : never;

const build = <
  I extends Schema | undefined = undefined,
  O extends Schema | undefined = undefined,
>(
  input?: I,
  output?: O
): ContractHook<I, O> =>
  Object.freeze({
    $patchsmithHookDefinition: true,
    definition: Object.freeze({ input, output }),
    input: <N extends Schema>(schema: N) => build(schema, output),
    output: <N extends Schema>(schema: N) => build(input, schema),
  });

export const hook = () => build();

const hookNamePattern =
  /^[a-zA-Z][a-zA-Z0-9_]{0,63}(?:\.[a-zA-Z][a-zA-Z0-9_]{0,63})*$/u;

export const validateHooks = (hooks: ContractHooks) => {
  for (const [name, definition] of Object.entries<ContractHook>(hooks)) {
    if (isReservedHookName(name)) {
      throw new Error(`The patchsmith hook namespace is reserved: "${name}".`);
    }

    if (
      name.length > 255 ||
      !hookNamePattern.test(name) ||
      name
        .split(".")
        .some((part) =>
          ["constructor", "prototype", "__proto__"].includes(part)
        )
    ) {
      throw new Error(`Invalid hook name "${name}"`);
    }

    if (!definition.$patchsmithHookDefinition) {
      throw new Error(`Invalid hook declaration "${name}"`);
    }
  }
};

export const serializeHooks = (
  hooks: ContractHooks,
  serializer?: SchemaSerializer
): PatchsmithSchemaSpec["hooks"] =>
  Object.fromEntries(
    Object.entries<ContractHook>(hooks).map(([name, { definition }]) => {
      const serialized: PatchsmithSchemaSpec["hooks"][string] = {
        // Hosts parse input before invocation and validate the handler's returned output.
        input: serializeSchema(definition.input, serializer, "output"),
        output: serializeSchema(definition.output, serializer, "input"),
      };

      if (definition.input && schemaMayBeOmitted(definition.input)) {
        serialized.inputOptional = true;
      }

      if (definition.output && schemaMayBeOmitted(definition.output)) {
        serialized.outputOptional = true;
      }

      return [name, serialized];
    })
  );
