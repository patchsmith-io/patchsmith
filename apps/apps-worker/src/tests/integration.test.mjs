/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return, typescript/no-unsafe-member-access -- This integration fixture loads workspace or generated modules dynamically and supplies minimal platform doubles; its assertions validate the observed runtime contract. */
// Disposable local workerd/R2 test. No Cloudflare account or deployed resources are used.
/* eslint-disable unicorn/no-await-expression-member */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { get } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

import {
  issueAppToken,
  appTokenVerifier,
  APP_AUDIENCE,
} from "@patchsmith/api-utils/app-auth";
import { createClient, createApi, reference } from "@patchsmith/app/client";
import { build } from "vite";
import { it } from "vite-plus/test";

import { createTestBackend } from "./backend";

/**
 * Read the wire bytes without fetch/dispatchFetch's transparent gzip decoding.
 * @param {URL} url Local runtime URL.
 * @param {Record<string, string>} headers Request headers, including the public host.
 */
const fetchWireBytes = async (url, headers) => {
  /** @type {import("node:http").IncomingMessage} */
  // oxlint-disable-next-line promise/avoid-new -- node:http exposes callbacks; bridge them to await without fetch's automatic decompression.
  const response = await new Promise((resolve, reject) => {
    get(url, { headers }, resolve).on("error", reject);
  });

  /** @type {Buffer[]} */
  const chunks = [];

  for await (const chunk of response) {
    if (!Buffer.isBuffer(chunk)) {
      throw new TypeError("Expected HTTP response bytes");
    }

    chunks.push(chunk);
  }

  return {
    body: Buffer.concat(chunks),
    headers: response.headers,
    status: response.statusCode,
  };
};

/** @typedef {NonNullable<import("wrangler").unstable_DevEnv["runtimes"][number]["mf"]>} LocalMiniflare */
/** @typedef {{ Miniflare: new(options: Record<string, unknown>) => LocalMiniflare, convertV4MiniflareOptions: (options: Record<string, unknown>) => Record<string, unknown> }} WranglerRuntimeModule */
/** @typedef {{id: string, text: string, priority?: number}} Todo */
/** @typedef {{appId: string, projectId: string, deploymentId: string, objectKey: string, checksum: string, contentLength: number, contentEncoding?: string}} PublishedDeployment */
/** @param {number} version Fixture backend version. */
const bundleImplementation = (version) =>
  `import { env } from "cloudflare:workers";
let globals = 0;
export const runtimeManifest = { apiVersion: 1, requires: ["database", "actions"] };
export const migrations = [];
export default { functions: { probe: {
 kind: "query", args: { "~standard": { version: 1, vendor: "fixture", validate: value => ({ value }) } },
 handler({ identity }) {
   let networkBlocked = false;
   try { fetch("https://example.com"); } catch { networkBlocked = true; }
   return { globals: ++globals, version: ${version}, networkBlocked,
     bindings: Object.keys(env), token: null, identity };
 }
} } }`;

it("runs isolated app backends with persistent SQLite and two-client realtime updates", async () => {
  // Exercise precisely the workerd/Miniflare version bundled with this project's Wrangler.
  const require = createRequire(import.meta.url);

  /** @type {WranglerRuntimeModule} */
  const wranglerRuntime = createRequire(require.resolve("wrangler"))(
    "miniflare"
  );

  const { Miniflare, convertV4MiniflareOptions } = wranglerRuntime;

  const state = await mkdtemp(path.join(tmpdir(), "patchsmith-apps-worker-"));

  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const signing = {
    audience: APP_AUDIENCE,
    issuer: "https://platform.test/api/platform",
    keyId: "test",
    privateKey: keys.privateKey,
  };

  const publicKeys = {
    keys: [
      {
        ...(await crypto.subtle.exportKey("jwk", keys.publicKey)),
        kid: "test",
      },
    ],
  };

  const projectId = "22222222-2222-4222-8222-222222222222";
  const otherProjectId = "33333333-3333-4333-8333-333333333333";
  const projectShortId = "abc123def456";
  const appShortId = "app000000001";
  const rpcUrl = `https://${projectShortId}.tailorkit.app/a/${appShortId}/rpc`;
  /** @type {PublishedDeployment} */
  let published;
  /** @type {Set<string>} */
  const appTokens = new Set();
  let externalCalls = 0;
  /** @type {() => void} */
  let releaseExternal;
  /** @type {Promise<void> | undefined} */
  let pendingExternal;
  let metadataReads = 0;

  const dist = path.resolve(import.meta.dirname, "../../dist");

  const options = {
    bindings: {
      APP_RUNTIME_PUBLIC_KEYS: publicKeys,
      ASSET_DOMAIN: "tailorkit.app",
      PLATFORM_URL: "https://platform.test/api/platform",
      RUNTIME_SERVICE_TOKEN: "x".repeat(32),
    },
    compatibilityDate: "2026-10-01",
    durableObjects: {
      STORES: { className: "PatchsmithAppInstallation", useSQLite: true },
    },
    modules: [
      { path: path.join(dist, "index.js"), type: "ESModule" },
      ...(await readdir(dist))
        .filter((name) => name.endsWith(".txt"))
        .map((name) => ({ path: path.join(dist, name), type: "Text" })),
    ],
    modulesRoot: dist,
    name: "patchsmith-runtime-test",
    /** @param {Request} request Outbound request made by the isolated worker. */
    // oxlint-disable-next-line eslint/complexity -- Keep this validation or rendering lifecycle together: its guards share the same state, cleanup, and error handling.
    outboundService: async (request) => {
      if (request.url === "https://host.test/api/patchsmith/tools/execute") {
        const { path: toolPath, input, requestId } = await request.json();
        assert.match(requestId, /^[0-9a-f-]{36}$/u);
        const token = request.headers.get("authorization").slice(7);
        assert.ok(
          appTokens.has(token),
          "tool calls reuse an issued app execution JWT"
        );

        const verified = await appTokenVerifier({ ...signing, publicKeys })(
          token
        );

        if (toolPath === "echo") {
          return Response.json({ output: input });
        }

        return Response.json({
          output: {
            installationId: verified.installationId,
            scope: verified.scope,
            subjectId: verified.subjectId,
          },
        });
      }

      if (
        request.url.startsWith("https://third-party.test/") !== undefined &&
        request.url.startsWith("https://third-party.test/") !== null &&
        request.url.startsWith("https://third-party.test/") &&
        request.url.startsWith("https://third-party.test/") !== "" &&
        request.url.startsWith("https://third-party.test/") !== 0 &&
        !Number.isNaN(request.url.startsWith("https://third-party.test/")) &&
        request.url.startsWith("https://third-party.test/") !== 0n
      ) {
        externalCalls += 1;
        assert.equal(request.headers.get("authorization"), null);

        if (
          request.url.endsWith("/redirect") !== undefined &&
          request.url.endsWith("/redirect") !== null &&
          request.url.endsWith("/redirect") &&
          request.url.endsWith("/redirect") !== "" &&
          request.url.endsWith("/redirect") !== 0 &&
          !Number.isNaN(request.url.endsWith("/redirect")) &&
          request.url.endsWith("/redirect") !== 0n
        ) {
          return new Response(null, {
            headers: { location: "https://127.0.0.1/private" },
            status: 302,
          });
        }

        if (
          request.url.endsWith("/slow") !== undefined &&
          request.url.endsWith("/slow") !== null &&
          request.url.endsWith("/slow") &&
          request.url.endsWith("/slow") !== "" &&
          request.url.endsWith("/slow") !== 0 &&
          !Number.isNaN(request.url.endsWith("/slow")) &&
          request.url.endsWith("/slow") !== 0n
        ) {
          await pendingExternal;
        }

        return Response.json({ title: "Imported from external API" });
      }

      assert.equal(
        request.url,
        "https://platform.test/api/platform/apps/app/runtime"
      );
      assert.equal(
        request.headers.get("authorization"),
        `Bearer ${"x".repeat(32)}`
      );
      metadataReads += 1;

      return Response.json(published);
    },
    r2Buckets: { BUNDLES: "private-apps" },
    resourcePersistencePath: state,
    workerLoaders: { LOADER: {} },
  };

  /** @type {LocalMiniflare} */
  let mf;

  const bundle = bundleImplementation;

  /**
   * @param {number} version Fixture deployment to publish.
   * @param {{ code?: string, initializationFails?: boolean }} [fixture] Application initialization fixture.
   */
  const publish = async (version, fixture = {}) => {
    const code = fixture.code ?? bundle(version);
    const objectKey = `projects/${projectShortId}/apps/${appShortId}/deployments/deploy00000${version}/server/server.js`;
    const bucket = await mf.getR2Bucket("BUNDLES");
    const bytes = version === 1 ? Buffer.from(code) : gzipSync(code);
    await bucket.put(objectKey, bytes, {
      httpMetadata: version === 1 ? {} : { contentEncoding: "gzip" },
    });
    published =
      version === 1
        ? {
            appId: "app",
            checksum: createHash("sha256").update(bytes).digest("hex"),
            contentLength: bytes.byteLength,
            deploymentId: `v${version}`,
            objectKey,
            projectId,
          }
        : {
            appId: "app",
            checksum: createHash("sha256").update(bytes).digest("hex"),
            contentEncoding: "gzip",
            contentLength: bytes.byteLength,
            deploymentId: `v${version}`,
            objectKey,
            projectId,
          };

    const response = await mf.dispatchFetch(
      `https://internal.tailorkit.app/p/${projectId}/a/${appShortId}/new-deployment`,
      {
        body: JSON.stringify(published),
        headers: {
          authorization: `Bearer ${"x".repeat(32)}`,
          "content-type": "application/json",
        },
        method: "POST",
      }
    );

    if (fixture.initializationFails === true) {
      assert.ok(
        [409, 500].includes(response.status),
        `Expected initialization failure, got ${response.status}: ${await response.text()}`
      );
    } else {
      assert.equal(response.status, 204, await response.text());
    }
  };

  const defaultProbe = { name: "probe" };

  const invoke = async (
    installationId,
    deploymentId = published.deploymentId,
    overrides = {},
    endpoint = "queries",
    rawInput = defaultProbe
  ) => {
    const input = rawInput ?? { name: "probe" };

    const session = await issueAppToken(signing, {
      appId: "app",
      appShortId,
      deploymentId,
      installationId,
      projectId,
      projectShortId,
      scope: { name: "org", value: { id: "tenant" } },
      subjectId: "user",
      toolUrl: "https://host.test/api/patchsmith/tools/execute",
      ...overrides,
    });

    return await mf.dispatchFetch(
      `${rpcUrl.replace(projectId, overrides.projectId ?? projectId)}/${endpoint}`,
      {
        body: JSON.stringify({ json: input }),
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
          "x-patchsmith-identity": "forged",
        },
        method: "POST",
      }
    );
  };

  const checkRpc = async () => {
    const repo = path.resolve(import.meta.dirname, "../../../..");
    const backend = path.join(state, "backend");
    await createTestBackend(backend);

    const sql = await readFile(
      new URL("fixtures/todos-init.sql", import.meta.url),
      "utf-8"
    );

    const migrations = [
      {
        hash: createHash("sha256").update(sql).digest("hex"),
        id: "20261001062220_init",
        statements: sql.split("--> statement-breakpoint"),
      },
    ];

    const entry = path.join(state, "fixture.ts");

    const publishRpc = async (history, deploymentId) => {
      // Use the same migration bootstrap bundled into production server artifacts.
      const setup = `import functions from ${JSON.stringify(path.join(backend, "functions.ts"))};
import { defineRouter, action, query, AppError } from ${JSON.stringify(path.join(repo, "packages/app/dist/server.js"))};
import { table, text, integer } from ${JSON.stringify(path.join(repo, "packages/app-db/dist/index.js"))};
import { env } from "cloudflare:workers";

let globals = 0;
const migratedTodos = table("todos", { id: text(), priority: integer() });
const nested = { read: functions.list, add: functions.add };
const actionFunctions = defineRouter({ ...functions,
  toolProbe: action({ args: functions.list.args, handler: ctx => ctx.tools.product.identity() }),
  nested,
  tasks: { read: action({ functions: { nested }, args: functions.list.args, handler: ctx => ctx.queries.nested.read() }) },
  migrationProbe: query({ args: functions.list.args, handler: ({ db }) => db.select().from(migratedTodos).all() }),
  isolation: action({ args: functions.list.args, handler: context => ({ bindings: Object.keys(env), db: "db" in context, globals: ++globals, subjectId: context.identity.subjectId }) }),
  failAfterWrite: action({ functions: functions, args: functions.list.args, async handler(ctx) {
    await ctx.mutations.add({ text: "Committed before the action failed" });
    throw new AppError("CONFLICT", "Intentional action failure");
  } }),
  readTodos: action({ functions: functions, args: functions.list.args, handler: ctx => ctx.queries.list() }),
  manyDatabaseCalls: action({ functions: functions, args: functions.list.args, async handler(ctx) {
    for (let call = 0; call < 100; call++) await ctx.queries.list();
    return "ok";
  } }),
});
export default { functions: actionFunctions };
export const runtimeManifest = { apiVersion: 1, requires: ["database", "actions", "internal-functions"] };
export const migrations = ${JSON.stringify(history)};`;

      await writeFile(entry, setup);
      await build({
        build: {
          minify: true,
          outDir: path.join(state, "fixture"),
          rolldownOptions: {
            external: ["cloudflare:workers"],
            output: { entryFileNames: "server.js" },
          },
          ssr: entry,
          target: "esnext",
        },
        configFile: false,
        logLevel: "error",
        root: repo,
        ssr: { noExternal: true, target: "webworker" },
      });

      const code = await readFile(
        path.join(state, "fixture/server.js"),
        "utf-8"
      );

      const bucket = await mf.getR2Bucket("BUNDLES");

      const bytes = gzipSync(code);
      await bucket.put("private/todo/server/server.js", bytes, {
        httpMetadata: { contentEncoding: "gzip" },
      });

      published = {
        appId: "app",
        checksum: createHash("sha256").update(bytes).digest("hex"),
        contentEncoding: "gzip",
        contentLength: bytes.byteLength,
        deploymentId,
        objectKey: "private/todo/server/server.js",
        projectId,
      };
    };

    await publishRpc(migrations, "backend");

    let renewals = 0;

    const makeClient = (installationId = "backend-todos") =>
      createClient({
        connect: async (url, protocols) => {
          assert.equal(
            new URL(url).pathname,
            `${new URL(rpcUrl).pathname}/queries`
          );

          const response = await mf.dispatchFetch(
            url.replace("wss:", "https:"),
            {
              headers: {
                "sec-websocket-protocol": protocols.join(", "),
                upgrade: "websocket",
              },
            }
          );

          if (response.status !== 101) {
            throw new Error(
              `WebSocket handshake ${response.status}: ${await response.text()}`
            );
          }

          const socket = response.webSocket;
          socket.accept();

          return socket;
        },
        // oxlint-disable-next-line typescript/promise-function-async, typescript/no-base-to-string -- This fixture returns the original deferred or runtime Promise and installs its resolver synchronously. The fixture sends string URLs and serialized JSON bodies; this assertion inspects those controlled wire values through the broader fetch signature.
        fetch: (url, init) => mf.dispatchFetch(String(url), init),
        getSession: async () => {
          renewals += 1;

          const session = await issueAppToken(
            // Renew after five seconds while keeping the production one-minute renewal window.
            { ...signing, lifetimeSeconds: 65 },
            {
              appId: "app",
              appShortId,
              deploymentId: published.deploymentId,
              installationId,
              projectId,
              projectShortId,
              scope: { name: "org", value: { id: "tenant" } },
              subjectId: "user",
              toolUrl: "https://host.test/api/patchsmith/tools/execute",
            }
          );

          appTokens.add(session.token);

          return { ...session, url: rpcUrl };
        },
        retryDelayMs: 20,
      });

    const first = makeClient();
    const second = makeClient();
    /** @type {import("@patchsmith/app/client").Reference<"query", undefined, Todo[]>} */
    const list = reference("list", "query");
    /** @type {import("@patchsmith/app/client").Reference<"mutation", {text: string}, Todo>} */
    const add = reference("add", "mutation");
    /** @type {Todo[][][]} */
    const snapshots = [[], []];
    /** @type {unknown[]} */
    const errors = [];

    const stops = [first, second].map((client, index) =>
      client.subscribe(
        list,
        undefined,
        (rows) => {
          snapshots[index].push(rows);
        },
        {
          onError: (err) => {
            errors.push(err);
          },
        }
      )
    );

    /** @param {() => boolean} predicate Completion condition. @param {string} label Failure context. */
    const wait = async (predicate, label) => {
      const until = Date.now() + 15_000;

      while (
        !(
          predicate() !== undefined &&
          predicate() !== null &&
          predicate() &&
          predicate() !== "" &&
          predicate() !== 0 &&
          !Number.isNaN(predicate()) &&
          predicate() !== 0n
        )
      ) {
        if (Date.now() > until) {
          throw new Error(
            `Timeout: ${label}: ${JSON.stringify(errors.slice(-3))}`
          );
        }

        // oxlint-disable-next-line no-await-in-loop -- Test steps share fixtures and must complete in order.
        await (async () => {
          const {
            promise: pendingPromise,
            resolve,
            reject: rejectPending,
          } = Promise.withResolvers();

          try {
            setTimeout(resolve, 25);
          } catch (error) {
            rejectPending(error);
          }

          return await pendingPromise;
        })();
      }
    };

    try {
      await wait(
        () => snapshots.every((rows) => rows.length > 0),
        "initial query snapshots"
      );
      assert.deepEqual(await first.query(list), await second.query(list));
      await assert.rejects(
        first.query(reference("privateTodos.list", "query")),
        { code: "NOT_FOUND" }
      );
      await assert.rejects(
        first.mutate(reference("privateTodos.add", "mutation"), {
          text: "Direct internal write",
        }),
        { code: "NOT_FOUND" }
      );
      await assert.rejects(
        first.action(reference("privateTodos.run", "action")),
        { code: "NOT_FOUND" }
      );
      const internalSnapshots = [];
      const internalErrors = [];

      const stopInternal = first.subscribe(
        reference("privateTodos.list", "query"),
        undefined,
        (rows) => {
          internalSnapshots.push(rows);
        },
        {
          onError: (error) => {
            internalErrors.push(error);
          },
        }
      );

      try {
        await wait(
          () => internalErrors.length > 0,
          "internal subscription rejection"
        );
        assert.equal(internalErrors[0].code, "NOT_FOUND");
        assert.deepEqual(internalSnapshots, []);
      } finally {
        stopInternal();
      }

      const nestedApi = createApi();
      assert.deepEqual(await first.query(nestedApi.nested.read), []);
      assert.deepEqual(await first.action(nestedApi.tasks.read), []);
      assert.deepEqual(await first.action(reference("toolProbe", "action")), {
        installationId: "backend-todos",
        scope: { name: "org", value: { id: "tenant" } },
        subjectId: "user",
      });

      const input = { text: "Both clients see this persisted mutation" };

      const saved = await first.mutate(add, input, {
        requestId: "00000000-0000-4000-8000-000000000001",
      });

      assert.deepEqual(
        await second.mutate(add, input, {
          requestId: "00000000-0000-4000-8000-000000000001",
        }),
        saved
      );
      await wait(
        () => snapshots.every((rows) => rows.at(-1).length === 1),
        "table invalidation on both clients"
      );
      assert.equal((await second.query(list)).length, 1);

      const oldCount = snapshots.map((rows) => rows.length);
      const oldRenewals = renewals;
      await wait(
        () =>
          renewals > oldRenewals &&
          snapshots.every((rows, index) => rows.length > oldCount[index]),
        "renewed subscriptions receive fresh snapshots"
      );
      assert.equal(errors.length, 0);

      {
        pendingExternal = (async () => {
          const {
            promise: pendingPromise,
            resolve,
            reject: rejectPending,
          } = Promise.withResolvers();

          try {
            releaseExternal = resolve;
          } catch (error) {
            rejectPending(error);
          }

          return await pendingPromise;
        })();
        const oldCalls = externalCalls;

        const action = first.action(reference("importTodo", "action"), {
          url: "https://third-party.test/slow",
        });

        await Promise.race([
          wait(() => externalCalls > oldCalls, "action reaches external API"),
          action,
        ]);

        // An external request must not hold the database or realtime queue.
        await second.mutate(add, { text: "While the action waits" });
        await wait(
          () => snapshots.every((rows) => rows.at(-1).length === 2),
          "writes continue while action waits"
        );

        releaseExternal();
        const imported = await action;
        assert.equal(imported.text, "Imported from external API");
        assert.equal((await second.query(list)).length, 3);
        await wait(
          () => snapshots.every((rows) => rows.at(-1).length === 3),
          "action mutation updates both clients"
        );
        const actionSnapshots = snapshots.map((rows) => rows.length);

        // Action queries use the trusted bridge and recheck publication.
        const beforeDirect = metadataReads;
        const actionRows = await first.action(reference("readTodos", "action"));
        assert.equal(actionRows.length, 3);
        // Admission checks the deployment once; the nested query stays in the facet.
        assert.equal(metadataReads, beforeDirect);
        assert.deepEqual(
          snapshots.map((rows) => rows.length),
          actionSnapshots
        );

        const probe = reference("isolation", "action");
        const isolation = await first.action(probe);
        assert.deepEqual(isolation, {
          bindings: [],
          db: false,
          globals: 1,
          subjectId: "user",
        });
        assert.equal((await second.action(probe)).globals, 2);

        // Local action calls retain the installation database and verified identity.
        assert.equal((await second.query(list)).length, 3);

        // Local calls do not consume RPC subrequests or application call allowances.
        assert.equal(
          await first.action(reference("manyDatabaseCalls", "action")),
          "ok"
        );

        await assert.rejects(
          first.action(reference("failAfterWrite", "action")),
          {
            code: "CONFLICT",
          }
        );
        assert.equal((await second.query(list)).length, 4);
        await wait(
          () => snapshots.every((rows) => rows.at(-1).length === 4),
          "committed action mutation updates clients even when action fails"
        );

        const beforeRedirect = externalCalls;
        await assert.rejects(
          first.action(reference("importTodo", "action"), {
            url: "https://third-party.test/redirect",
          })
        );
        assert.equal(externalCalls, beforeRedirect + 1);

        const beforeBlocked = externalCalls;
        await assert.rejects(
          first.action(reference("importTodo", "action"), {
            url: "http://127.0.0.1/private",
          })
        );
        assert.equal(externalCalls, beforeBlocked);

        await assert.rejects(
          first.query(reference("importTodo", "query"), {
            url: "https://third-party.test/title",
          })
        );

        await assert.rejects(first.action(reference("list", "action"), {}));

        stops[1]();
        // Cancellation and this request share an ordered connection.
        await second.query(list);
        const stoppedCount = snapshots[1].length;
        await first.mutate(add, { text: "After unsubscribe" });
        await wait(
          () => snapshots[0].at(-1).length === 5,
          "remaining active client updates"
        );
        assert.equal(snapshots[1].length, stoppedCount);

        const isolated = makeClient("another-installation");

        try {
          assert.deepEqual(await isolated.query(list), []);
          await isolated.action(reference("importTodo", "action"), {
            url: "https://third-party.test/title",
          });
          assert.equal((await isolated.query(list)).length, 1);
          assert.equal((await first.query(list)).length, 5);
        } finally {
          isolated.close();
        }
      }
    } finally {
      for (const stop of stops) {
        stop();
      }

      first.close?.();
      second.close?.();
    }

    await mf.dispose();
    mf = new Miniflare(convertV4MiniflareOptions(options));

    const recovered = makeClient();

    try {
      assert.equal((await recovered.query(list)).length, 5);

      await recovered.mutate(
        add,
        { text: "Both clients see this persisted mutation" },
        { requestId: "00000000-0000-4000-8000-000000000001" }
      );
      assert.equal((await recovered.query(list)).length, 5);
    } finally {
      recovered.close?.();
    }

    const upgradeSql = await readFile(
      path.join(import.meta.dirname, "fixtures/todos-priority.sql"),
      "utf-8"
    );

    const upgrade = {
      hash: createHash("sha256").update(upgradeSql).digest("hex"),
      id: "20261002000000_priority",
      statements: [upgradeSql],
    };

    const live = makeClient();
    const liveSnapshots = [];

    const stopLive = live.subscribe(
      list,
      undefined,
      (rows) => {
        liveSnapshots.push(rows);
      },
      {
        onError: (err2) => {
          errors.push(err2);
        },
      }
    );

    await wait(
      () => liveSnapshots.length === 1,
      "subscription before deployment change"
    );
    pendingExternal = (async () => {
      const {
        promise: pendingPromise,
        resolve,
        reject: rejectPending,
      } = Promise.withResolvers();

      try {
        releaseExternal = resolve;
      } catch (error) {
        rejectPending(error);
      }

      return await pendingPromise;
    })();
    const beforeUpgradeCalls = externalCalls;

    const oldAction = live.action(reference("importTodo", "action"), {
      url: "https://third-party.test/slow",
    });

    const oldActionResult = (async () => {
      try {
        await oldAction;

        return "unexpected";
      } catch (error) {
        return error.code;
      }
    })();

    await wait(
      () => externalCalls > beforeUpgradeCalls,
      "action before deployment replacement"
    );
    await publishRpc([...migrations, upgrade], "backend-upgrade");

    // Activate the deployment over HTTP: version changes close existing WebSocket connections.
    const upgradeResponse = await invoke(
      "backend-todos",
      published.deploymentId,
      {},
      "queries",
      {
        name: "list",
      }
    );

    assert.equal(
      upgradeResponse.status,
      200,
      await upgradeResponse.clone().text()
    );
    assert.equal(await oldActionResult, "UNAVAILABLE");
    releaseExternal();

    try {
      await wait(
        () => liveSnapshots.length > 1,
        "facet restart reconnects active subscriptions"
      );
      assert.equal(liveSnapshots.at(-1).length, 5);
    } finally {
      stopLive();
      live.close();
    }

    const upgraded = makeClient();

    try {
      assert.equal((await upgraded.query(list)).length, 5);
      const rows = await upgraded.query(reference("migrationProbe", "query"));
      assert.equal(rows.length, 5);
      assert.ok(Boolean(rows.every((row) => row.priority === 0)));
    } finally {
      upgraded.close();
    }

    const requiredSql = await readFile(
      path.join(import.meta.dirname, "fixtures/todos-required.sql"),
      "utf-8"
    );

    const failed = {
      hash: createHash("sha256").update(requiredSql).digest("hex"),
      id: "20261003000000_required",
      statements: [requiredSql],
    };

    await publishRpc([...migrations, upgrade, failed], "backend-failed");

    const failedResponse = await invoke(
      "backend-todos",
      published.deploymentId,
      {},
      "queries",
      {
        name: "list",
      }
    );

    assert.equal(failedResponse.status, 500);

    await publishRpc([...migrations, upgrade], "backend-retry");

    await mf.dispose();
    mf = new Miniflare(convertV4MiniflareOptions(options));

    const retryResponse = await invoke(
      "backend-todos",
      published.deploymentId,
      {},
      "queries",
      {
        name: "list",
      }
    );

    assert.equal(retryResponse.status, 200, await retryResponse.clone().text());

    const retried = makeClient();
    const fresh = makeClient("created-after-upgrade");

    try {
      assert.equal((await retried.query(list)).length, 5);
      assert.ok(
        Boolean(
          (await retried.query(reference("migrationProbe", "query"))).every(
            (row) => row.priority === 0
          )
        )
      );
      assert.deepEqual(
        await fresh.query(reference("migrationProbe", "query")),
        []
      );
      await fresh.mutate(add, { text: "Initialized with the full history" });
      assert.equal(
        (await fresh.query(reference("migrationProbe", "query")))[0].priority,
        0
      );
    } finally {
      retried.close();
      fresh.close();
    }
  };

  try {
    mf = new Miniflare(convertV4MiniflareOptions(options));

    // Publication must await real application initialization, before any app handler runs.
    await publish(0, {
      code: bundle(0).replace("apiVersion: 1", "apiVersion: 2"),
      initializationFails: true,
    });
    await publish(1);

    const warmed = await (await invoke("app")).json();
    assert.equal(warmed.json.globals, 1);
    assert.equal(warmed.json.version, 1);

    // Repeated warm-up preserves the running app and never increments handler state.
    await publish(1);
    const rewarmed = await (await invoke("app")).json();
    assert.equal(rewarmed.json.globals, 2);

    // Assets and app code share one R2 binding, but public routes cannot expose server code.
    const assets = await mf.getR2Bucket("BUNDLES");
    const assetBase = `${rpcUrl.replace(/\/rpc$/u, "")}/d/deploy000001`;
    const clientKey = `projects/${projectShortId}/apps/${appShortId}/deployments/deploy000001/client/client.js`;
    const clientBytes = gzipSync("export default 'client';");
    await assets.put(clientKey, clientBytes, {
      httpMetadata: { contentEncoding: "gzip" },
    });
    const publicClientUrl = new URL(`${assetBase}/client/client.js`);
    const wireUrl = new URL(publicClientUrl.pathname, await mf.ready);
    await Array.fromAsync(
      Array.from({ length: 2 }, (_, attempt) => attempt),
      async (attempt) => {
        const compressed = await fetchWireBytes(wireUrl, {
          "Accept-Encoding": "gzip",
          Host: publicClientUrl.host,
          "MF-Original-URL": publicClientUrl.href,
        });

        assert.equal(compressed.status, 200);
        assert.equal(compressed.headers["content-encoding"], "gzip");
        assert.equal(compressed.headers.vary, "Accept-Encoding");
        assert.equal(
          compressed.headers["x-patchsmith-content-encoding"],
          undefined
        );
        assert.deepEqual(compressed.body, clientBytes);
        assert.equal(
          gunzipSync(compressed.body).toString(),
          "export default 'client';",
          `gzip request ${attempt}`
        );
      }
    );
    const cache = await mf.getCaches();
    const cacheUrl = new URL(publicClientUrl);
    cacheUrl.searchParams.set("__patchsmith_asset_cache", "opaque-v1");
    const cachedClient = await cache.default.match(cacheUrl);
    assert.ok(cachedClient !== undefined);
    assert.equal(cachedClient.headers.get("content-encoding"), null);
    assert.equal(
      cachedClient.headers.get("x-patchsmith-content-encoding"),
      "gzip"
    );
    assert.deepEqual(
      Buffer.from(await cachedClient.arrayBuffer()),
      clientBytes
    );

    const client = await mf.dispatchFetch(`${assetBase}/client/client.js`, {
      headers: { "Accept-Encoding": "identity" },
    });

    assert.equal(client.status, 200);
    assert.equal(await client.text(), "export default 'client';");
    assert.equal(client.headers.get("cache-control"), "private, max-age=3600");

    const clientHead = await mf.dispatchFetch(`${assetBase}/client/client.js`, {
      headers: { "Accept-Encoding": "gzip" },
      method: "HEAD",
    });

    assert.equal(clientHead.headers.get("mf-content-encoding"), "gzip");
    assert.equal(
      clientHead.headers.get("content-length"),
      String(clientBytes.byteLength)
    );
    assert.equal(
      (await mf.dispatchFetch(`${assetBase}/client.js`)).status,
      404
    );
    const logoHash = "a".repeat(64);
    await assets.put(
      `projects/${projectShortId}/apps/${appShortId}/assets/${logoHash}/logo.svg`,
      "<svg/>"
    );

    const logo = await mf.dispatchFetch(
      `https://${projectShortId}.tailorkit.app/a/${appShortId}/assets/${logoHash}/logo.svg`
    );

    assert.equal(logo.status, 200);
    assert.equal(logo.headers.get("content-type"), "image/svg+xml");
    assert.equal(
      (await mf.dispatchFetch(`${assetBase}/logos/${logoHash}.svg`)).status,
      404
    );
    assert.equal(
      (await mf.dispatchFetch(`${assetBase}/server/server.js`)).status,
      404
    );

    const rejected = await mf.dispatchFetch(`${rpcUrl}/queries`, {
      headers: {
        "sec-websocket-protocol": "patchsmith, jwt.forged",
        upgrade: "websocket",
      },
    });

    assert.equal(rejected.status, 401);

    const response = await invoke("one");
    assert.equal(response.status, 200, await response.clone().text());
    const timing = response.headers.get("server-timing");
    assert.match(timing, /runtime_gateway;dur=\d/u);
    assert.match(timing, /runtime_installation;dur=\d/u);
    assert.match(timing, /runtime_execute;dur=\d/u);
    assert.doesNotMatch(timing, /runtime_metadata_kv/u);
    assert.equal(
      response.headers.get("access-control-expose-headers"),
      "server-timing"
    );
    const one = (await response.json()).json;
    assert.equal(one.globals, 1);
    assert.equal(one.networkBlocked, true);
    assert.deepEqual(one.bindings, []);
    assert.equal(one.token, null);
    assert.equal(one.identity.installationId, "one");

    const two = await (
      await invoke("two")
    )
      .json()
      .then((result) => result.json);

    assert.equal(two.globals, 1);
    assert.equal(
      (await (await invoke("one")).json().then((result) => result.json))
        .globals,
      2
    );

    const before = metadataReads;
    assert.equal(
      (await invoke("one", "v1", { projectId: otherProjectId })).status,
      403
    );
    assert.equal(metadataReads, before + 1);

    published = { ...published, projectId: otherProjectId };

    const otherProject = await (
      await invoke("one", "v1", { projectId: otherProjectId })
    )
      .json()
      .then((result) => result.json);

    assert.equal(otherProject.globals, 1);

    published = { ...published, projectId: otherProjectId };
    // A changed hint forces confirmation even while local metadata is fresh.
    assert.equal((await invoke("one", "v-new")).status, 403);

    await publish(2);
    assert.equal((await invoke("one", "v1")).status, 200);

    const updated = await (
      await invoke("one")
    )
      .json()
      .then((result) => result.json);

    assert.equal(updated.version, 2);
    assert.equal(updated.globals, 1);

    // Remove the origin copy: cold recovery must use the verified code in supervisor SQLite.
    await (await mf.getR2Bucket("BUNDLES")).delete(published.objectKey);
    const readsBeforeRestart = metadataReads;
    // Cold supervisor and facet after process restart must recover the same persistent SQLite.
    await mf.dispose();
    mf = new Miniflare(convertV4MiniflareOptions(options));

    const recovered = await (
      await invoke("one")
    )
      .json()
      .then((result) => result.json);

    assert.equal(recovered.globals, 1);
    assert.equal(recovered.version, 2);
    assert.equal(metadataReads, readsBeforeRestart);

    await (
      await mf.getR2Bucket("BUNDLES")
    ).put(published.objectKey, gzipSync(bundle(2)));
    const originalHash = published.checksum;
    published = { ...published, checksum: "a".repeat(64) };
    assert.equal((await invoke("one", "v-checksum")).status, 500);
    published = { ...published, checksum: originalHash };
    assert.equal(
      (await (await invoke("one")).json().then((result) => result.json))
        .globals,
      2
    );

    await checkRpc();
  } finally {
    await mf?.dispose();
    await rm(state, { force: true, recursive: true });
  }
}, 45_000);
