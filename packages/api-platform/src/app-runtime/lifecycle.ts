import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { onInstallHook } from "@patchsmith/app/hooks";
import type { PlatformClient } from "@patchsmith/app/protocol";
import { Effect } from "effect";

import type { Context } from "#context";
import { createRuntimeSessionEffect } from "#routes/app-runtime";
import type { RuntimeApp } from "#routes/app-runtime";
import { attempt, PlatformHttp } from "#services";

/** Invoke only the newly committed installation, using its selected deployment. */
export const invokeInstallationHookEffect = (
  context: Pick<Context, "project">,
  app: RuntimeApp,
  input: { subjectId: string; toolUrl: string }
) =>
  Effect.gen(function* invokeInstallationHook() {
    if (app.currentDeployment?.hooks.includes(onInstallHook) !== true) {
      return;
    }

    const session = yield* createRuntimeSessionEffect(context, app, {
      ...input,
      hook: onInstallHook,
    });

    const http = yield* PlatformHttp;
    const url = new URL(session.url);

    const runtime = createORPCClient<Pick<PlatformClient, "actions">>(
      new RPCLink({
        fetch: http.fetch,
        headers: { authorization: `Bearer ${session.token}` },
        origin: url.origin,
        url: `/${url.pathname.slice(1)}`,
      })
    );

    yield* attempt(async (signal) => {
      await runtime.actions(
        { args: { hook: onInstallHook }, name: "_patchsmith.hooks.invoke" },
        { signal }
      );
    });
  }).pipe(Effect.timeout(30_000));
