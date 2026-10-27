import { Cause, Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { expect, it } from "vite-plus/test";

import { attempt, runPlatform } from "#services";
import { appTestFixture } from "#test/apps";

import { invokeInstallationHookEffect } from "./lifecycle";

const fixture = appTestFixture();

it.each([undefined, "http://localhost:8787"])(
  "cancels installation hook execution after its deadline at %s",
  async (runtimeUrl) => {
    fixture.testState.env.APP_RUNTIME_URL = runtimeUrl;
    const context = fixture.createContext();
    const { app, deployment } = await fixture.seedRuntimeApp("timeout", []);
    const started = Promise.withResolvers<{ signal: AbortSignal; url: URL }>();
    fixture.http.mockImplementation(async (input, init) => {
      const signal = init?.signal;

      if (!signal) {
        throw new Error("Missing runtime cancellation signal");
      }

      started.resolve({ signal, url: new URL(new Request(input, init).url) });
      const response = Promise.withResolvers<Response>();
      signal.addEventListener(
        "abort",
        () => {
          response.reject(new Error("Aborted"));
        },
        { once: true }
      );

      return await response.promise;
    });

    await runPlatform(
      Effect.gen(function* timeoutInstallationHook() {
        const fiber = yield* Effect.forkChild(
          invokeInstallationHookEffect(
            context,
            {
              ...app,
              currentDeployment: {
                ...deployment,
                hooks: ["patchsmith.onInstall"],
              },
            },
            {
              subjectId: "installer",
              toolUrl: "https://host.test/tools/execute",
            }
          )
        );

        const { signal, url } = yield* attempt(
          async () => await started.promise
        );

        const projectPath =
          runtimeUrl === undefined ? "" : `/p/${context.project.shortId}`;

        expect(url.pathname).toBe(
          `${projectPath}/a/${app.shortId}/rpc/actions`
        );

        if (runtimeUrl !== undefined) {
          expect(url.origin).toBe(runtimeUrl);
        }

        yield* TestClock.adjust(30_000);
        const exit = yield* Fiber.await(fiber);
        expect(Exit.isFailure(exit)).toBe(true);

        if (Exit.isFailure(exit)) {
          expect(Cause.isTimeoutError(Cause.squash(exit.cause))).toBe(true);
        }

        expect(signal.aborted).toBe(true);
        expect(fixture.http).toHaveBeenCalledOnce();
      }).pipe(Effect.provide(TestClock.layer())),
      context
    );
  }
);
