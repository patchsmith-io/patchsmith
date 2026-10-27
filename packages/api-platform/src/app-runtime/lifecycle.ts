import { createClient, reference } from "@patchsmith/app/client/connection";
import { Effect } from "effect";

import type { Context } from "#context";
import { PlatformDependencyError } from "#errors";
import { createRuntimeSessionEffect } from "#routes/app-runtime";
import type { RuntimeApp } from "#routes/app-runtime";
import { attempt, PlatformHttp } from "#services";

const installationHook = "patchsmith.onInstall";

const invocation = reference<
  "action",
  { hook: typeof installationHook },
  unknown
>("_patchsmith.hooks.invoke", "action");

/** Invoke only the newly committed installation, using its selected deployment. */
export const invokeInstallationHookEffect = (
  context: Pick<Context, "project">,
  app: RuntimeApp,
  input: { subjectId: string; toolUrl: string }
) =>
  Effect.gen(function* invokeInstallationHook() {
    if (app.currentDeployment?.hooks.includes(installationHook) !== true) {
      return;
    }

    const session = yield* createRuntimeSessionEffect(context, app, {
      ...input,
      hook: installationHook,
    });

    const http = yield* PlatformHttp;

    yield* attempt(async (signal) => {
      const backend = createClient({
        fetch: http.fetch,
        // oxlint-disable-next-line require-await -- Reuse this invocation's platform-issued hook session.
        getSession: async () => session,
      });

      const close = () => {
        backend.close();
      };

      signal.addEventListener("abort", close, { once: true });

      try {
        signal.throwIfAborted();
        await backend.action(invocation, { hook: installationHook });
      } finally {
        signal.removeEventListener("abort", close);
        close();
      }
    });
  }).pipe(
    Effect.timeoutOrElse({
      duration: 30_000,
      orElse: () =>
        Effect.fail(
          new PlatformDependencyError({
            cause: undefined,
            message: "Installation hook timed out",
          })
        ),
    })
  );
