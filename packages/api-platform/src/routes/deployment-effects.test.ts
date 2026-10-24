import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { Context } from "#context";

import { inspectUploadedAsset } from "./deployment-effects";

afterEach(() => {
  vi.restoreAllMocks();
});

it("times out and aborts an inspection even when the body ignores cancellation", async () => {
  const storage: Context["storage"] = {
    createDownloadUrl: async () =>
      await Promise.resolve({
        key: "logo.svg",
        url: "https://storage.test/logo.svg",
      }),
    createUploadUrl: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(),
    type: "s3",
  };

  const signals: (AbortSignal | null | undefined)[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    signals.push(init?.signal);

    return await Promise.resolve(
      new Response(new ReadableStream<Uint8Array>())
    );
  });

  await Effect.runPromise(
    Effect.gen(function* inspectionDeadline() {
      const fiber = yield* inspectUploadedAsset(
        storage,
        "logo.svg",
        "Logo",
        async (body) => await new Response(body).arrayBuffer()
      ).pipe(
        Effect.match({
          onFailure: (error) => error.message,
          onSuccess: () => "unexpected success",
        }),
        Effect.forkChild
      );

      yield* TestClock.adjust(10_000);
      expect(yield* Fiber.join(fiber)).toBe("Logo inspection timed out.");
      expect(signals).toHaveLength(1);
      expect(signals[0]?.aborted).toBe(true);
    }).pipe(Effect.provide(TestClock.layer()))
  );
});
