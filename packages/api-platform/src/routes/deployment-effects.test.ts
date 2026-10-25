import { setImmediate } from "node:timers/promises";

import { asyncFixture } from "@patchsmith/config/testing";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { expect, it, vi } from "vite-plus/test";

import type { Context } from "#context";
import { PlatformHttp } from "#services";

import {
  inspectUploadedAsset as inspectUploadedAssetEffect,
  uploadedAssetMetadata,
  UploadValidationError,
  verificationUnavailableMessage,
} from "./deployment-effects";

const inspectUploadedAsset = <A>(
  storage: Context["storage"],
  objectKey: string,
  kind: "Bundle" | "Logo",
  inspect: (body: ReadableStream<Uint8Array>) => Promise<A>,
  fetch: typeof globalThis.fetch
) =>
  inspectUploadedAssetEffect(storage, objectKey, kind, inspect).pipe(
    Effect.provideService(PlatformHttp, { fetch })
  );

const createStorage = (): Context["storage"] => ({
  createDownloadUrl: asyncFixture(() => ({
    key: "logo.svg",
    url: "https://storage.test/logo.svg?signature=private",
  })),
  createUploadUrl: vi.fn(),
  delete: vi.fn(),
  head: vi.fn(),
  type: "s3",
});

const readBody = async (body: ReadableStream<Uint8Array>) =>
  await new Response(body).text();

it.each(["NoSuchKey", "NotFound", "404"])(
  "identifies a missing upload from storage (%s)",
  async (name) => {
    const cause = Object.assign(new Error("private storage key"), {
      $metadata: { httpStatusCode: name === "404" ? 404 : undefined },
      name,
    });

    const storage = createStorage();
    storage.head = asyncFixture(() => {
      throw cause;
    });

    const error = await Effect.runPromise(
      uploadedAssetMetadata(storage, "logo.svg").pipe(Effect.flip)
    );

    expect(error).toMatchObject({ cause, code: "BAD_REQUEST" });
    expect(error.message).toContain("Upload the file before publishing again");
    expect(error.message).not.toContain("private");
  }
);

it("preserves storage diagnostics behind a sanitized retryable error", async () => {
  const cause = new Error("AccessDenied: credential=private");
  const storage = createStorage();
  storage.head = asyncFixture(() => {
    throw cause;
  });

  const error = await Effect.runPromise(
    uploadedAssetMetadata(storage, "logo.svg").pipe(Effect.flip)
  );

  expect(error).toMatchObject({
    cause,
    code: "SERVICE_UNAVAILABLE",
    message: verificationUnavailableMessage,
  });
});

it("only exposes explicitly identified validation errors from an inspector", async () => {
  const validation = new UploadValidationError("Invalid logo content.");

  const error = await Effect.runPromise(
    inspectUploadedAsset(
      createStorage(),
      "logo.svg",
      "Logo",
      asyncFixture(() => {
        throw validation;
      }),
      asyncFixture(() => new Response("invalid"))
    ).pipe(Effect.flip)
  );

  expect(error).toBe(validation);
});

it.each(["signing", "url", "protocol", "fetch", "body"])(
  "sanitizes %s failures and retains their causes",
  async (failure) => {
    const cause = new Error("private storage credentials");
    const storage = createStorage();

    if (failure === "signing") {
      storage.createDownloadUrl = asyncFixture(() => {
        throw cause;
      });
    }

    if (failure === "url" || failure === "protocol") {
      storage.createDownloadUrl = asyncFixture(() => ({
        key: "logo.svg",
        url:
          failure === "url"
            ? "invalid private URL"
            : "http://storage.test/private",
      }));
    }

    const fetchAsset = vi.fn<typeof fetch>(
      asyncFixture(() => {
        if (failure === "fetch") {
          throw cause;
        }

        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(cause);
            },
          })
        );
      })
    );

    const error = await Effect.runPromise(
      inspectUploadedAsset(
        storage,
        "logo.svg",
        "Logo",
        readBody,
        fetchAsset
      ).pipe(Effect.flip)
    );

    expect(error).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: verificationUnavailableMessage,
    });
    expect(error.cause).toBeInstanceOf(Error);

    if (failure === "signing" || failure === "fetch" || failure === "body") {
      expect(error.cause).toBe(cause);
    } else {
      expect(fetchAsset).not.toHaveBeenCalled();
    }
  }
);

it.each([403, 500, 503, 200])(
  "sanitizes unusable download responses (%i)",
  async (status) => {
    const error = await Effect.runPromise(
      inspectUploadedAsset(
        createStorage(),
        "logo.svg",
        "Logo",
        readBody,
        asyncFixture(() => new Response(null, { status }))
      ).pipe(Effect.flip)
    );

    expect(error).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: verificationUnavailableMessage,
    });
  }
);

it("reports a missing download as an upload validation error and cancels its body", async () => {
  const cancel = vi.fn();

  const error = await Effect.runPromise(
    inspectUploadedAsset(
      createStorage(),
      "logo.svg",
      "Logo",
      readBody,
      asyncFixture(
        () =>
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            status: 404,
          })
      )
    ).pipe(Effect.flip)
  );

  expect(error.code).toBe("BAD_REQUEST");
  expect(error.message).toContain("Upload it before publishing again");
  expect(cancel).toHaveBeenCalledOnce();
});

it("times out, aborts the request, and cancels a body that ignores its signal", async () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  const cancel = vi.fn();

  const fetchAsset: typeof fetch = asyncFixture((_url, init) => {
    signals.push(init?.signal);

    return new Response(new ReadableStream<Uint8Array>({ cancel }));
  });

  await Effect.runPromise(
    Effect.gen(function* inspectionDeadline() {
      const fiber = yield* inspectUploadedAsset(
        createStorage(),
        "logo.svg",
        "Logo",
        readBody,
        fetchAsset
      ).pipe(Effect.flip, Effect.forkChild);

      yield* TestClock.adjust(10_000);

      const timeoutCause: unknown = expect.objectContaining({
        message: "Logo inspection timed out.",
      });

      expect(yield* Fiber.join(fiber)).toMatchObject({
        cause: timeoutCause,
        code: "SERVICE_UNAVAILABLE",
        message: verificationUnavailableMessage,
      });
      expect(signals).toHaveLength(1);
      expect(signals[0]?.aborted).toBe(true);
      expect(cancel).toHaveBeenCalledOnce();
    }).pipe(Effect.provide(TestClock.layer()))
  );
});

it.each(["signing", "fetch", "inspection"])(
  "ignores late %s results after cancellation",
  async (phase) => {
    const controller = new AbortController();
    const started = Promise.withResolvers<boolean>();
    const release = Promise.withResolvers<boolean>();
    const finished = Promise.withResolvers<boolean>();
    const storage = createStorage();
    const sign = storage.createDownloadUrl;

    if (phase === "signing") {
      storage.createDownloadUrl = async (input) => {
        started.resolve(true);
        await release.promise;
        finished.resolve(true);

        return await sign(input);
      };
    }

    const cancel = vi.fn();

    const inspect = vi.fn(async () => {
      if (phase === "inspection") {
        started.resolve(true);
        await release.promise;
        finished.resolve(true);
      }

      return "verified";
    });

    const fetchAsset = vi.fn<typeof fetch>(async () => {
      if (phase === "fetch") {
        started.resolve(true);
        await release.promise;
        finished.resolve(true);
      }

      return new Response(new ReadableStream<Uint8Array>({ cancel }));
    });

    const verified = vi.fn();

    const program = Effect.runPromiseExit(
      inspectUploadedAsset(
        storage,
        "logo.svg",
        "Logo",
        inspect,
        fetchAsset
      ).pipe(Effect.tap(() => Effect.sync(verified))),
      { signal: controller.signal }
    );

    await started.promise;
    controller.abort();
    const exit = await program;
    expect(exit._tag).toBe("Failure");
    release.resolve(true);
    await finished.promise;
    // Drain promise continuations from the deliberately non-cooperative operation.
    await setImmediate();
    expect(verified).not.toHaveBeenCalled();

    if (phase === "signing") {
      expect(fetchAsset).not.toHaveBeenCalled();
    } else {
      expect(cancel).toHaveBeenCalledOnce();
    }

    if (phase !== "inspection") {
      expect(inspect).not.toHaveBeenCalled();
    }
  }
);
