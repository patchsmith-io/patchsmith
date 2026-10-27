import { Cause, Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { expect, it } from "vite-plus/test";

import { attempt, runPlatform } from "#services";
import { appTestFixture } from "#test/apps";

import { invokeInstallationHookEffect } from "./lifecycle";

const fixture = appTestFixture();

it("cancels installation hook execution after its deadline", async () => {
  const context = fixture.createContext();
  const { app, deployment } = await fixture.seedRuntimeApp("timeout", []);
  const started = Promise.withResolvers<AbortSignal>();
  fixture.http.mockImplementation(async (_input, init) => {
    const signal = init?.signal;

    if (!signal) {
      throw new Error("Missing runtime cancellation signal");
    }

    started.resolve(signal);
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
          { subjectId: "installer", toolUrl: "https://host.test/tools/execute" }
        )
      );

      const signal = yield* attempt(async () => await started.promise);
      yield* TestClock.adjust(30_000);
      const exit = yield* Fiber.await(fiber);
      expect(Exit.isFailure(exit)).toBe(true);

      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toMatchObject({
          _tag: "PlatformDependencyError",
          message: "Installation hook timed out",
        });
      }

      expect(signal.aborted).toBe(true);
      expect(fixture.http).toHaveBeenCalledOnce();
    }).pipe(Effect.provide(TestClock.layer())),
    context
  );
});
