import { createClient, reference } from "@patchsmith/app/client/connection";
import { appsRuntimeSession } from "@patchsmith/client-platform/client";
import type { Client } from "@patchsmith/client-platform/client/client/index";
import * as v from "valibot";

import type {
  ContractHook,
  ContractHooks,
  InferHookInput,
  InferHookOutput,
} from "#schema/hooks";
import { validateToolValue } from "#schema/tools";

import { listApps } from "./list-apps";
import { platformAppSelector } from "./platform-app-selector";
import { validatePatchsmithScopes } from "./scope";
import type { PatchsmithScopeSchemas } from "./scope";
import type {
  PatchsmithHostContext,
  PatchsmithPlatformOptions,
  PatchsmithScopes,
} from "./types";

interface HookCallerOptions<TScopes> extends PatchsmithHostContext<TScopes> {
  signal?: AbortSignal;
}

type InvocationOptions<H, TScopes> = HookCallerOptions<TScopes> & {
  appId: string;
} & (undefined extends InferHookInput<H>
    ? { input?: InferHookInput<H> }
    : { input: InferHookInput<H> });

type InstalledApp = Awaited<ReturnType<typeof listApps>>[number];

export type HookCallers<T extends ContractHooks, TScopes> = {
  readonly [N in keyof T]: {
    invoke: (
      options: InvocationOptions<T[N], TScopes>
    ) => Promise<InferHookOutput<T[N]>>;
    list: (options: HookCallerOptions<TScopes>) => Promise<InstalledApp[]>;
  };
};

const isFunctionValue = <TValue>(
  value: TValue
): value is Extract<TValue, CallableFunction> => typeof value === "function";

const invocation = reference<
  "action",
  { hook: string; input?: unknown },
  unknown
>("_patchsmith.hooks.invoke", "action");

export const createHookCallers = <T extends ContractHooks, TScopes>(options: {
  hooks: T;
  scopeSchemas: PatchsmithScopeSchemas;
  platform: Client;
  platformHeaders?: PatchsmithPlatformOptions["headers"];
  toolUrl: string;
  runtimeFetch?: typeof fetch;
}): HookCallers<T, TScopes> => {
  const headers = async () => {
    const value = isFunctionValue(options.platformHeaders)
      ? await options.platformHeaders()
      : options.platformHeaders;

    return Object.fromEntries(new Headers(value));
  };

  const validateContext = async (context: PatchsmithHostContext<TScopes>) => {
    v.parse(
      v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
      context.subjectId
    );

    return await validatePatchsmithScopes(options.scopeSchemas, context.scopes);
  };

  const connect = async (
    appId: string,
    scopes: PatchsmithScopes,
    subjectId: string,
    signal?: AbortSignal,
    hook?: string
  ) => {
    signal?.throwIfAborted();

    const { data: session } = await appsRuntimeSession({
      body: {
        app: platformAppSelector(appId),
        hook,
        scopes: Object.entries(scopes).map(([name, value]) => ({
          name,
          value,
        })),
        subjectId,
        toolUrl: options.toolUrl,
      },
      client: options.platform,
      headers: await headers(),
      responseStyle: "fields",
      signal,
      throwOnError: true,
    });

    const backend = createClient({
      fetch: options.runtimeFetch,
      // oxlint-disable-next-line require-await -- This invocation reuses its already authorized server-only session.
      getSession: async () => session,
    });

    const close = () => {
      backend.close();
    };

    signal?.addEventListener("abort", close, { once: true });

    if (signal?.aborted === true) {
      close();
    }

    return {
      backend,
      close: () => {
        signal?.removeEventListener("abort", close);
        close();
      },
    };
  };

  const caller = (name: string, definition: ContractHook) => ({
    invoke: async (input: InvocationOptions<ContractHook, TScopes>) => {
      input.signal?.throwIfAborted();
      const scopes = await validateContext(input);
      let payload: unknown;

      try {
        payload = await validateToolValue(
          definition.definition.input,
          input.input
        );
      } catch (error) {
        throw new TypeError(`Invalid input for hook "${name}".`, {
          cause: error,
        });
      }

      const { backend, close } = await connect(
        input.appId,
        scopes,
        input.subjectId,
        input.signal,
        name
      );

      try {
        const result = await backend.action(invocation, {
          hook: name,
          input: payload,
        });

        try {
          const envelope = v.parse(
            v.strictObject({ output: v.optional(v.unknown()) }),
            result
          );

          return await validateToolValue(
            definition.definition.output,
            envelope.output
          );
        } catch (error) {
          throw new TypeError(`Invalid output for hook "${name}".`, {
            cause: error,
          });
        }
      } finally {
        close();
      }
    },
    list: async (
      input: HookCallerOptions<TScopes>
    ): Promise<InstalledApp[]> => {
      const scopes = await validateContext(input);

      const apps = await listApps(
        { platform: options.platform, platformHeaders: await headers() },
        Object.entries(scopes).map(([nameValue, value]) => ({
          name: nameValue,
          value,
        })),
        input.signal ?? new AbortController().signal
      );

      return apps.filter(
        (app) => app.currentDeployment?.hooks.includes(name) === true
      );
    },
  });

  // SAFETY: Every own hook key is mapped to a caller that validates that hook's input and output schemas at the transport boundary.
  return (
    /* oxlint-disable typescript/no-unsafe-type-assertion -- Each own contract hook key is mapped to a caller that validates that hook's schemas before returning its typed result. */
    Object.freeze(
      Object.fromEntries(
        Object.entries<ContractHook>(options.hooks).map(
          ([name, definition]) => [name, caller(name, definition)]
        )
      )
    ) as HookCallers<T, TScopes>
    /* oxlint-enable typescript/no-unsafe-type-assertion */
  );
};
