import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
  rename,
  readFile,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { asyncFixture } from "@patchsmith/config/testing";
import type { createPatchsmithClient } from "@patchsmith/core/server";
import type { loadPatchsmithConfig } from "@patchsmith/vite/config/loader";
import { maxDeploymentBytes } from "@patchsmith/vite/upload-manifest";
import { SignJWT } from "jose";
import { Liquid } from "liquidjs";
import { afterEach, beforeEach, assert, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type * as authModule from "./auth";
import { NotLoggedInError } from "./auth";
import type { buildProject } from "./build";
import { linkTestDependencies } from "./test-utils";

const requireBytes = (body: RequestInit["body"]): Uint8Array => {
  assert(body instanceof Uint8Array);

  return body;
};

const isStringValue = <TValue>(value: TValue): value is TValue & string =>
  typeof value === "string";

const mocks = vi.hoisted(() => ({
  build:
    vi.fn<
      (...args: Parameters<typeof buildProject>) => Promise<{ outDir: string }>
    >(),
  client: vi.fn(),
  create: vi.fn<
    (
      input: Parameters<
        ReturnType<typeof createPatchsmithClient>["deployments"]["create"]
      >[0]
    ) => Promise<{
      deployment: { id: string };
      assets: { headers?: Record<string, string>; uploadUrl: string }[];
      server?: { uploadUrl: string };
      staticAssets?: {
        file: { checksum: string; path: string };
        headers?: Record<string, string>;
        uploadUrl?: string;
      }[];
    }>
  >(),
  load: vi.fn<
    (
      ...args: Parameters<typeof loadPatchsmithConfig>
    ) => Promise<Partial<Awaited<ReturnType<typeof loadPatchsmithConfig>>>>
  >(),
  publish: vi.fn(),
  token: vi.fn(),
  whoami: vi.fn(),
}));

vi.mock("@patchsmith/vite/config/loader", () => ({
  loadPatchsmithConfig: mocks.load,
}));

vi.mock("./build", () => ({ buildProject: mocks.build }));

vi.mock("@patchsmith/core/server", () => ({
  createPatchsmithClient: mocks.client,
}));

vi.mock("./auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authModule>()),
  getDeployToken: mocks.token,
  runWhoami: mocks.whoami,
}));

const { runDeploy } = await import("./deploy");
let root: string;

beforeEach(async () => {
  vi.resetAllMocks();
  root = await mkdtemp(path.join(tmpdir(), "patchsmith-private-deploy-"));
  await mkdir(path.join(root, ".patchsmith/client"), { recursive: true });
  await mkdir(path.join(root, ".patchsmith/server"));
  await mkdir(path.join(root, ".patchsmith/migrations"));
  await writeFile(
    path.join(root, ".patchsmith/client/client.js"),
    "client-code"
  );
  await writeFile(
    path.join(root, ".patchsmith/server/server.js"),
    "server-code"
  );
  await writeFile(
    path.join(root, ".patchsmith/migrations/migration.sql"),
    "DO NOT UPLOAD"
  );
  await writeFile(
    path.join(root, ".patchsmith/patchsmith-upload.json"),
    JSON.stringify({
      assets: { client: "client/client.js", server: "server/server.js" },
      hooks: ["sync", "billing.updated"],
      version: 1,
      views: [
        { instances: true, path: "/", slot: "page" },
        { disabled: true, path: "/disabled", slot: "page" },
      ],
    })
  );
  mocks.build.mockResolvedValue({ outDir: path.join(root, ".patchsmith") });
  mocks.load.mockResolvedValue({
    config: {
      appId: "app-one",
      host: "https://host.example",
      name: "Test App",
      slug: "test-app",
    },
    filepath: path.join(root, "patchsmith.config.ts"),
    root,
  });
  mocks.whoami.mockResolvedValue({ hostUrl: "https://host.example" });
  mocks.token.mockResolvedValue({ deployToken: "deploy-token" });
  mocks.client.mockReturnValue({
    apps: {
      get: vi.fn().mockResolvedValue({ description: null, name: "Test App" }),
    },
    deployments: { create: mocks.create, publish: mocks.publish },
  });
  mocks.create.mockResolvedValue({
    assets: [{ uploadUrl: "https://uploads.example/client" }],
    deployment: { id: "deployment" },
    server: { uploadUrl: "https://uploads.example/server" },
  });
  mocks.publish.mockResolvedValue({ id: "deployment", status: "published" });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(root, { force: true, recursive: true });
});

it.each([
  { budget: "compressed", extraBytes: 0, reuse: false },
  { budget: "compressed", extraBytes: 1, reuse: false },
  { budget: "compressed", extraBytes: 0, reuse: true },
  { budget: "compressed", extraBytes: 1, reuse: true },
  { budget: "raw", extraBytes: 0, reuse: true },
  { budget: "raw", extraBytes: 1, reuse: true },
])(
  "counts static files in the combined $budget budget ($extraBytes bytes over, reused=$reuse)",
  async ({ budget, extraBytes, reuse }) => {
    const clientContent =
      budget === "raw"
        ? Buffer.alloc(6 * 1024 * 1024, "x")
        : Buffer.from("client-code");

    const serverContent =
      budget === "raw"
        ? Buffer.alloc(1024 * 1024, "y")
        : Buffer.from("server-code");

    const bundleBytes =
      budget === "raw"
        ? clientContent.byteLength + serverContent.byteLength
        : gzipSync(clientContent).byteLength +
          gzipSync(serverContent).byteLength;

    await writeFile(
      path.join(root, ".patchsmith/client/client.js"),
      clientContent
    );
    await writeFile(
      path.join(root, ".patchsmith/server/server.js"),
      serverContent
    );

    const content = Buffer.alloc(
      maxDeploymentBytes - bundleBytes + extraBytes,
      3
    );

    const checksum = createHash("sha256").update(content).digest("hex");
    await mkdir(path.join(root, ".patchsmith/assets"));
    await writeFile(path.join(root, ".patchsmith/assets/doom.wad"), content);
    await writeFile(
      path.join(root, ".patchsmith/patchsmith-upload.json"),
      JSON.stringify({
        assets: {
          client: "client/client.js",
          server: "server/server.js",
          static: [
            { checksum, contentLength: content.byteLength, path: "doom.wad" },
          ],
        },
        version: 1,
      })
    );
    mocks.create.mockResolvedValue({
      assets: [{ uploadUrl: "https://uploads.example/client" }],
      deployment: { id: "deployment" },
      server: { uploadUrl: "https://uploads.example/server" },
      staticAssets: [
        {
          file: { checksum, path: "doom.wad" },
          uploadUrl: reuse ? undefined : "https://uploads.example/doom.wad",
        },
      ],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );

    if (extraBytes > 0) {
      await expect(runDeploy({ cwd: root })).rejects.toThrow(
        "Combined deployment assets cannot exceed"
      );
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.publish).not.toHaveBeenCalled();
    } else {
      await expect(runDeploy({ cwd: root })).resolves.toMatchObject({
        status: "published",
      });
    }
  }
);

it.each([false, true])(
  "uploads raw static files and skips reused uploads: %s",
  async (reuse) => {
    const content = Buffer.alloc(4 * 1024 * 1024, 3);
    const checksum = createHash("sha256").update(content).digest("hex");
    await mkdir(path.join(root, ".patchsmith/assets"));
    await writeFile(path.join(root, ".patchsmith/assets/doom.wad"), content);
    await writeFile(
      path.join(root, ".patchsmith/patchsmith-upload.json"),
      JSON.stringify({
        assets: {
          client: "client/client.js",
          static: [
            { checksum, contentLength: content.byteLength, path: "doom.wad" },
          ],
        },
        version: 1,
      })
    );
    mocks.create.mockResolvedValue({
      assets: [{ uploadUrl: "https://uploads.example/client" }],
      deployment: { id: "deployment" },
      staticAssets: [
        {
          file: { checksum, path: "doom.wad" },
          headers: { "content-type": "application/octet-stream" },
          uploadUrl: reuse ? undefined : "https://uploads.example/doom.wad",
        },
      ],
    });

    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await runDeploy({ cwd: root });
    expect(mocks.create.mock.calls[0]?.[0].staticAssets).toEqual([
      { checksum, contentLength: content.byteLength, path: "doom.wad" },
    ]);
    expect(fetch).toHaveBeenCalledTimes(reuse ? 1 : 2);

    if (!reuse) {
      const uploaded = fetch.mock.calls.find(
        ([url]) => url === "https://uploads.example/doom.wad"
      );

      expect(
        Buffer.from(requireBytes(uploaded?.[1]?.body)).equals(content)
      ).toBe(true);
      expect(
        new Headers(uploaded?.[1]?.headers).get("Content-Encoding")
      ).toBeNull();
    }

    expect(mocks.publish).toHaveBeenCalledOnce();
  }
);

it.each([false, true])(
  "limits concurrent static uploads (failure=%s)",
  async (fail) => {
    const content = Buffer.from("asset-data");
    const checksum = createHash("sha256").update(content).digest("hex");

    const assets = Array.from({ length: 9 }, (_, index) => ({
      checksum,
      contentLength: content.byteLength,
      path: `asset-${index}.bin`,
    }));

    await mkdir(path.join(root, ".patchsmith/assets"));
    await Promise.all(
      assets.map(async (asset) => {
        await writeFile(
          path.join(root, ".patchsmith/assets", asset.path),
          content
        );
      })
    );
    await writeFile(
      path.join(root, ".patchsmith/patchsmith-upload.json"),
      JSON.stringify({
        assets: { client: "client/client.js", static: assets },
        version: 1,
      })
    );
    mocks.create.mockResolvedValue({
      assets: [{ uploadUrl: "https://uploads.example/client" }],
      deployment: { id: "deployment" },
      staticAssets: assets.map((asset) => ({
        file: asset,
        uploadUrl: `https://uploads.example/${asset.path}`,
      })),
    });
    const gate = Promise.withResolvers<boolean>();
    let active = 0;
    let peak = 0;
    const uploaded: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const uploadUrl = url instanceof Request ? url.url : url.toString();

      if (uploadUrl.endsWith(".bin")) {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
        uploaded.push(uploadUrl);

        if (fail) {
          return new Response(null, { status: 500 });
        }
      }

      return new Response(null, { status: 200 });
    });
    const deployment = runDeploy({ cwd: root });

    try {
      await vi.waitFor(() => {
        expect(active).toBeGreaterThanOrEqual(4);
      });
      expect(mocks.publish).not.toHaveBeenCalled();
    } finally {
      gate.resolve(true);
    }

    if (fail) {
      await expect(deployment).rejects.toThrow("Asset upload failed");
      expect(mocks.publish).not.toHaveBeenCalled();
    } else {
      await expect(deployment).resolves.toMatchObject({ status: "published" });
      expect(uploaded.toSorted()).toEqual(
        assets
          .map((asset) => `https://uploads.example/${asset.path}`)
          .toSorted()
      );
      expect(mocks.publish).toHaveBeenCalledOnce();
    }

    expect(peak).toBe(4);
  }
);

it("rejects hosts that discard static asset metadata instead of publishing a broken app", async () => {
  const content = Buffer.from("game-data");
  const checksum = createHash("sha256").update(content).digest("hex");
  await mkdir(path.join(root, ".patchsmith/assets"));
  await writeFile(path.join(root, ".patchsmith/assets/doom.wad"), content);
  await writeFile(
    path.join(root, ".patchsmith/patchsmith-upload.json"),
    JSON.stringify({
      assets: {
        client: "client/client.js",
        static: [
          { checksum, contentLength: content.byteLength, path: "doom.wad" },
        ],
      },
      version: 1,
    })
  );
  await expect(runDeploy({ cwd: root })).rejects.toThrow(
    "Upgrade the Patchsmith host and platform"
  );
  expect(mocks.publish).not.toHaveBeenCalled();
});

it("uploads gzip server and client code with metadata matching the stored bytes", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 200 }));

  await runDeploy({ cwd: root });
  expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
    assets: [{ objectKey: "client.js" }],
    hooks: ["sync", "billing.updated"],
    server: { objectKey: "server.js" },
    views: [
      { instances: true, path: "/", slot: "page" },
      { disabled: true, path: "/disabled", slot: "page" },
    ],
  });
  expect(fetch).toHaveBeenCalledTimes(2);

  const uploaded = fetch.mock.calls.map(([url, options]) => ({
    code: gunzipSync(requireBytes(options?.body)).toString("utf-8"),

    url: url instanceof Request ? url.url : String(url),
  }));

  expect(uploaded).toContainEqual({
    code: "server-code",
    url: "https://uploads.example/server",
  });
  expect(uploaded).toContainEqual({
    code: "client-code",
    url: "https://uploads.example/client",
  });

  for (const [uploadUrl, options] of fetch.mock.calls) {
    const bytes = requireBytes(options?.body);

    const metadata = (uploadUrl instanceof Request
      ? uploadUrl.url
      : String(uploadUrl)
    ).endsWith("server")
      ? mocks.create.mock.calls[0]?.[0].server
      : mocks.create.mock.calls[0]?.[0].assets[0];

    expect(metadata).toMatchObject({
      checksum: createHash("sha256").update(bytes).digest("hex"),
      contentLength: bytes.byteLength,
      encoding: "gzip",
    });
    expect(new Headers(options?.headers).get("Content-Encoding")).toBe("gzip");
  }

  expect(mocks.publish).toHaveBeenCalledOnce();
});

it.each([
  { annotation: "", name: "config", prelude: "" },
  { annotation: "", name: "$config", prelude: "" },
  { annotation: ": PatchsmithConfig", name: "config", prelude: "" },
  {
    annotation: ": PatchsmithConfig & { callback?: () => void }",
    name: "config",
    prelude: "",
  },
  {
    annotation: "",
    name: "config",
    prelude:
      'function nested() {\nconst config = {\n  host: "https://nested.example",\n};\n}\n',
  },
  {
    annotation: ": PatchsmithConfig",
    name: "config",
    prelude:
      'function nested() {\nconst config: PatchsmithConfig = {\n  host: "https://nested.example",\n};\n}\n',
  },
])(
  "links the init config exported as $name with annotation '$annotation' and prelude '$prelude'",
  async ({ name, annotation, prelude }) => {
    const template = await readFile(
      path.join(
        import.meta.dirname,
        "generator/templates/patchsmith.config.ts.liquid"
      ),
      "utf-8"
    );

    const rendered = z.string().parse(
      await new Liquid({ strictVariables: true }).parseAndRender(template, {
        appName: JSON.stringify("Test App"),
        appSlug: JSON.stringify("test-app"),
        bare: false,
        hostUrl: "https://host.example",
      })
    );

    const source =
      prelude +
      rendered
        .replace("const config =", `const ${name}${annotation} =`)
        .replace("export default config;", `export default ${name};`);

    const configPath = path.join(root, "patchsmith.config.ts");
    await writeFile(configPath, source);
    mocks.load.mockResolvedValue({
      config: {
        host: "https://host.example",
        name: "Test App",
        slug: "test-app",
      },
      filepath: configPath,
      root,
    });
    const createApp = vi.fn().mockResolvedValue({ id: "new-app-id" });
    mocks.client.mockReturnValue({
      apps: { create: createApp },
      deployments: { create: mocks.create, publish: mocks.publish },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );

    const result = await runDeploy({
      cwd: root,
      onMissingAppId: vi.fn().mockResolvedValue(true),
    });

    expect(await readFile(configPath, "utf-8")).toBe(
      source.replace(
        `const ${name}${annotation} = {\n  host: "https://host.example"`,
        `const ${name}${annotation} = {\n  appId: "new-app-id",\n  host: "https://host.example"`
      )
    );
    expect(result).toMatchObject({ appId: "new-app-id", createdApp: true });
    expect(createApp).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
      appId: "new-app-id",
    });
    expect(mocks.publish).toHaveBeenCalledOnce();
  }
);

it("preserves client-only deployment uploads", async () => {
  await writeFile(
    path.join(root, ".patchsmith/patchsmith-upload.json"),
    JSON.stringify({ assets: { client: "client/client.js" }, version: 1 })
  );

  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 200 }));

  await runDeploy({ cwd: root });
  expect(mocks.create.mock.calls[0]?.[0].server).toBeUndefined();
  expect(fetch).toHaveBeenCalledOnce();
});

it.each([false, true])(
  "returns server diagnostics with an interactive callback: %s",
  async (interactive) => {
    await linkTestDependencies(root);
    await mkdir(path.join(root, "src/functions"), { recursive: true });
    await writeFile(path.join(root, "src/root.tsx"), "export default {};\n");
    await writeFile(
      path.join(root, "src/functions/example.router.ts"),
      'export const invalid: number = "string";'
    );
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { skipLibCheck: true, types: [] } })
    );

    const onTypecheckFailed = vi
      .fn<
        NonNullable<
          NonNullable<Parameters<typeof runDeploy>[0]>["onTypecheckFailed"]
        >
      >()
      .mockResolvedValue(false);

    const deployment = runDeploy({
      cwd: root,
      onTypecheckFailed: interactive ? onTypecheckFailed : undefined,
    });

    await expect(deployment).rejects.toThrow("type check failed");
    await expect(deployment).rejects.toThrow(
      'Command: tsc --noEmit --project "tsconfig.json" --pretty false (app entries: "src/root.tsx", "src/functions/example.router.ts")'
    );
    await expect(deployment).rejects.not.toThrow(".patchsmith-typecheck-");
    await expect(deployment).rejects.toThrow("src/functions/example.router.ts");
    await expect(deployment).rejects.toThrow("error TS2322");

    if (interactive) {
      expect(onTypecheckFailed.mock.calls[0]?.[0].output).toContain(
        "src/functions/example.router.ts"
      );
    } else {
      expect(onTypecheckFailed).not.toHaveBeenCalled();
    }

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  }
);

it("refreshes stale function types before deployment typechecking", async () => {
  await linkTestDependencies(root);
  await mkdir(path.join(root, "src/functions"), { recursive: true });
  await writeFile(
    path.join(root, "src/functions/todos.router.ts"),
    'import { defineRouter, fn } from "patchsmith/server"; export default defineRouter({ list: fn.query.handler(() => 42) });'
  );
  await writeFile(
    path.join(root, "src/patchsmith.functions.gen.ts"),
    'import type missing from "./functions/deleted.router"; export type AppServerFunctions = typeof missing;'
  );
  await writeFile(
    path.join(root, "src/root.tsx"),
    'import type { AppServerFunctions } from "./patchsmith.functions.gen"; export const value: ReturnType<AppServerFunctions["todos"]["list"]["handler"]> = 42;'
  );
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        skipLibCheck: true,
        strict: true,
        target: "ESNext",
        types: [],
      },
    })
  );
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 200 })
  );
  await runDeploy({ cwd: root });
  expect(mocks.publish).toHaveBeenCalledOnce();
  expect(
    await readFile(path.join(root, "src/patchsmith.functions.gen.ts"), "utf-8")
  ).not.toContain("deleted.router");
});

it("typechecks file route roots, layouts and views without a manual client entry", async () => {
  await linkTestDependencies(root);
  await mkdir(path.join(root, "src/slots/panel"), { recursive: true });
  await mkdir(path.join(root, "src/functions"), { recursive: true });
  await writeFile(
    path.join(root, "src/functions/example.router.ts"),
    "export default {};\n"
  );

  const sources = [
    "src/root.tsx",
    "src/slots/panel/root.tsx",
    "src/slots/panel/layout.tsx",
    "src/slots/panel/index.view.tsx",
  ];

  await Promise.all(
    sources.map(async (file) => {
      await writeFile(path.join(root, file), "export default null;\n");
    })
  );
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        jsx: "react-jsx",
        jsxImportSource: "preact",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        target: "ESNext",
        types: [],
      },
    })
  );
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 200 })
  );
  await runDeploy({ cwd: root });
  expect(mocks.publish).toHaveBeenCalledOnce();
  mocks.publish.mockClear();
  // Collect diagnostics for every entry in one compiler run.
  await Promise.all(
    sources.map(async (file) => {
      await writeFile(
        path.join(root, file),
        "const label: string = 42; export default label;\n"
      );
    })
  );

  const onTypecheckFailed = vi
    .fn<
      NonNullable<
        NonNullable<Parameters<typeof runDeploy>[0]>["onTypecheckFailed"]
      >
    >()
    .mockResolvedValue(false);

  await expect(runDeploy({ cwd: root, onTypecheckFailed })).rejects.toThrow(
    "type check failed"
  );
  expect(onTypecheckFailed).toHaveBeenCalledOnce();
  expect(onTypecheckFailed.mock.calls[0]?.[0].command).toContain(
    '--project "tsconfig.json"'
  );
  expect(onTypecheckFailed.mock.calls[0]?.[0].command).toContain(
    '"src/functions/example.router.ts"'
  );

  for (const file of sources) {
    expect(onTypecheckFailed.mock.calls[0]?.[0].output).toContain(file);
    expect(onTypecheckFailed.mock.calls[0]?.[0].command).toContain(
      JSON.stringify(file)
    );
  }

  expect(mocks.publish).not.toHaveBeenCalled();
  const files = await readdir(root);
  expect(
    files.filter((name) => name.startsWith(".patchsmith-typecheck-"))
  ).toEqual([]);
});

it("does not publish when the server upload fails", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    asyncFixture(
      (url) =>
        new Response(null, {
          status: (url instanceof Request ? url.url : String(url)).endsWith(
            "server"
          )
            ? 403
            : 200,
        })
    )
  );
  await expect(runDeploy({ cwd: root })).rejects.toThrow("Asset upload failed");
  expect(mocks.publish).not.toHaveBeenCalled();
});

it.each(["vite config", "option"])(
  "uploads all artifacts from a custom %s output directory",
  async (mode) => {
    await writeFile(
      path.join(root, ".patchsmith/server/server.js"),
      "new-backend-code"
    );
    await rename(path.join(root, ".patchsmith"), path.join(root, "output"));
    mocks.build.mockResolvedValue({ outDir: path.join(root, "output") });
    mocks.load.mockResolvedValue({
      config: {
        appId: "app-one",
        host: "https://host.example",
        name: "Test App",
        slug: "test-app",
      },
      filepath: path.join(root, "patchsmith.config.ts"),
      root,
    });

    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await runDeploy(
      mode === "option" ? { cwd: root, outDir: "output" } : { cwd: root }
    );

    const server = fetch.mock.calls.find(([url]) =>
      (url instanceof Request ? url.url : String(url)).endsWith("server")
    );

    expect(gunzipSync(requireBytes(server?.[1]?.body)).toString("utf-8")).toBe(
      "new-backend-code"
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.publish).toHaveBeenCalledOnce();
  }
);

it.each(["missing", "expired"])(
  "logs in with %s credentials and continues deploying with the new token",
  async (credentials) => {
    mocks.whoami.mockRejectedValue(
      new NotLoggedInError("https://host.example")
    );
    mocks.token.mockResolvedValue(
      credentials === "missing" ? undefined : { deployToken: "expired-token" }
    );

    const onLoginRequired = vi.fn().mockImplementation(
      asyncFixture(() => {
        expect(mocks.build).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
        mocks.token.mockResolvedValue({ deployToken: "new-token" });

        return { hostUrl: "https://host.example" };
      })
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );

    await expect(
      runDeploy({ configPath: "custom.config.ts", cwd: root, onLoginRequired })
    ).resolves.toMatchObject({
      deploymentId: "deployment",
      status: "published",
    });
    expect(mocks.whoami).toHaveBeenCalledWith(
      expect.objectContaining({ configPath: "custom.config.ts", cwd: root })
    );
    expect(onLoginRequired).toHaveBeenCalledOnce();
    expect(mocks.token).toHaveBeenCalledWith("https://host.example");
    expect(mocks.client).toHaveBeenCalledWith({
      headers: { authorization: "Bearer new-token" },
      url: "https://host.example",
    });
    expect(mocks.publish).toHaveBeenCalledOnce();
  }
);

it("skips the login flow when already authenticated", async () => {
  const onLoginRequired = vi.fn();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 200 })
  );
  await runDeploy({ cwd: root, onLoginRequired });
  expect(onLoginRequired).not.toHaveBeenCalled();
  expect(mocks.publish).toHaveBeenCalledOnce();
});

it.each(["CLI login was denied.", "Timed out waiting for CLI login approval."])(
  "stops deploying when login fails: %s",
  async (message) => {
    mocks.whoami.mockRejectedValue(
      new NotLoggedInError("https://host.example")
    );
    const onLoginRequired = vi.fn().mockRejectedValue(new Error(message));
    await expect(runDeploy({ cwd: root, onLoginRequired })).rejects.toThrow(
      message
    );
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  }
);

it("does not start login for config or credential store errors", async () => {
  mocks.whoami.mockRejectedValue(new Error("Invalid auth.json"));
  const onLoginRequired = vi.fn();
  await expect(runDeploy({ cwd: root, onLoginRequired })).rejects.toThrow(
    "Invalid auth.json"
  );
  expect(onLoginRequired).not.toHaveBeenCalled();
  expect(mocks.build).not.toHaveBeenCalled();
});

it.each(["client", "server"])(
  "rejects oversized raw %s code before creating a deployment",
  async (kind) => {
    await writeFile(
      path.join(root, `.patchsmith/${kind}/${kind}.js`),
      "x".repeat(maxDeploymentBytes + 1)
    );
    await expect(runDeploy({ cwd: root })).rejects.toThrow(/exceed/u);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  }
);

it("preserves signed upload headers and uploads logos without gzip encoding", async () => {
  const logo = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  await mkdir(path.join(root, ".patchsmith/assets"));
  await writeFile(path.join(root, ".patchsmith/assets/logo-light.svg"), logo);

  const artifact = {
    checksum: createHash("sha256").update(logo).digest("hex"),
    contentLength: Buffer.byteLength(logo),
    path: "logo-light.svg",
  };

  const manifestPath = path.join(root, ".patchsmith/patchsmith-upload.json");

  const manifest = z
    .looseObject({
      assets: z.looseObject({
        client: z.string(),
        logos: z.record(z.string(), z.string()).optional(),
        server: z.string().optional(),
        static: z
          .array(
            z.object({
              checksum: z.string(),
              contentLength: z.number(),
              path: z.string(),
            })
          )
          .optional(),
      }),
    })
    .parse(JSON.parse(await readFile(manifestPath, "utf-8")));

  manifest.assets.logos = { light: "logo-light.svg" };
  manifest.assets.static = [artifact];
  await writeFile(manifestPath, JSON.stringify(manifest));
  mocks.create.mockResolvedValue({
    assets: [
      {
        headers: {
          "content-encoding": "gzip",
          "x-amz-checksum-sha256": "signed-client",
        },
        uploadUrl: "https://uploads.example/client",
      },
    ],
    deployment: { id: "deployment" },
    server: { uploadUrl: "https://uploads.example/server" },
    staticAssets: [
      {
        file: artifact,
        headers: { "content-type": "image/svg+xml" },
        uploadUrl: "https://uploads.example/logo",
      },
    ],
  });

  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 200 }));

  await runDeploy({ cwd: root });

  const clientUpload = fetch.mock.calls.find(([url]) =>
    (url instanceof Request ? url.url : String(url)).endsWith("client")
  );

  expect(
    new Headers(clientUpload?.[1]?.headers).get("x-amz-checksum-sha256")
  ).toBe("signed-client");

  const logoUpload = fetch.mock.calls.find(([url]) =>
    (url instanceof Request ? url.url : String(url)).endsWith("logo")
  );

  expect(new TextDecoder().decode(requireBytes(logoUpload?.[1]?.body))).toBe(
    logo
  );
  expect(
    new Headers(logoUpload?.[1]?.headers).get("content-encoding")
  ).toBeNull();
});

it.each(["client", "server"])(
  "accepts %s code exactly at the 10 MiB limit",
  async (kind) => {
    const size = maxDeploymentBytes - "server-code".length;
    await writeFile(
      path.join(root, `.patchsmith/${kind}/${kind}.js`),
      "x".repeat(size)
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );
    const result = await runDeploy({ cwd: root });
    expect(result.uploadedFiles).toContainEqual(
      expect.objectContaining({ path: `${kind}/${kind}.js`, size })
    );
    expect(mocks.publish).toHaveBeenCalledOnce();
  }
);

it.each([0, 1])(
  "checks client, server, and both logos together (%i bytes over the limit)",
  async (extraBytes) => {
    const logo = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    await writeFile(
      path.join(root, ".patchsmith/client/client.js"),
      "x".repeat(6 * 1024 * 1024)
    );
    await writeFile(
      path.join(root, ".patchsmith/server/server.js"),
      "y".repeat(4 * 1024 * 1024 - logo.length + extraBytes)
    );
    await mkdir(path.join(root, ".patchsmith/assets"));
    await writeFile(path.join(root, ".patchsmith/assets/logo.svg"), logo);

    const artifact = {
      checksum: createHash("sha256").update(logo).digest("hex"),
      contentLength: Buffer.byteLength(logo),
      path: "logo.svg",
    };

    await writeFile(
      path.join(root, ".patchsmith/patchsmith-upload.json"),
      JSON.stringify({
        assets: {
          client: "client/client.js",
          logos: {
            dark: "logo.svg",
            light: "logo.svg",
          },
          server: "server/server.js",
          static: [artifact],
        },
        version: 1,
      })
    );
    mocks.create.mockResolvedValue({
      assets: [{ uploadUrl: "https://uploads.example/client" }],
      deployment: { id: "deployment" },
      server: { uploadUrl: "https://uploads.example/server" },
      staticAssets: [
        { file: artifact, uploadUrl: "https://uploads.example/logo" },
      ],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );

    const deploy = runDeploy({ cwd: root });

    if (extraBytes > 0) {
      await expect(deploy).rejects.toThrow(
        "Combined deployment assets cannot exceed"
      );
      expect(mocks.create).not.toHaveBeenCalled();

      return;
    }

    await expect(deploy).resolves.toMatchObject({ status: "published" });
    expect(mocks.publish).toHaveBeenCalledOnce();
  }
);

const agentJwt = async (exp = Math.floor(Date.now() / 1000) + 3600) =>
  await new SignJWT({
    appId: "authorized-app",
    aud: "patchsmith-platform-cli",
    exp,
    iat: Math.floor(Date.now() / 1000),
    iss: "patchsmith-agent",
    platformUrl: "https://platform.example/api/platform",
    projectId: "project",
    scope: { name: "user", value: { userId: "one" } },
  })
    .setProtectedHeader({ alg: "HS256", typ: "patchsmith-agent+jwt" })
    .sign(new TextEncoder().encode("test-only-key"));

it("agent JWT deployment uses shared authentication and the configured app without host requests", async () => {
  const jwt = await agentJwt();
  vi.stubEnv("PATCHSMITH_AGENT_TOKEN", jwt);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input instanceof Request ? input : undefined;

    if (request?.url === "https://platform.example/api/platform/deployments") {
      expect(await request.json()).toMatchObject({
        app: { shortId: "app-one" },
        scope: {
          name: "user",
          value: { userId: "one" },
        },
      });
      expect(request.headers.get("authorization")).toBe(`Bearer ${jwt}`);

      return Response.json({
        assets: [{ uploadUrl: "https://uploads.example/client" }],
        deployment: { id: "deployment" },
        server: { uploadUrl: "https://uploads.example/server" },
      });
    }

    if (
      request?.url ===
      "https://platform.example/api/platform/deployments/deployment"
    ) {
      return Response.json({ id: "deployment", status: "published" });
    }

    if (request?.url === "https://platform.example/api/platform/apps/lookup") {
      return Response.json({ description: null, name: "Test App" });
    }

    if (isStringValue(input) && input.startsWith("https://uploads.example/")) {
      return new Response(null, { status: 200 });
    }

    throw new Error("Unexpected host or platform request");
  });
  const onLoginRequired = vi.fn();
  expect(await runDeploy({ cwd: root, onLoginRequired })).toMatchObject({
    appId: "app-one",
    createdApp: false,
    status: "published",
  });
  expect(mocks.whoami).toHaveBeenCalled();
  expect(mocks.token).toHaveBeenCalled();
  expect(mocks.client).not.toHaveBeenCalled();
  expect(onLoginRequired).not.toHaveBeenCalled();
});

it("fails expired agent authorization before build without falling back to login", async () => {
  vi.stubEnv(
    "PATCHSMITH_AGENT_TOKEN",
    await agentJwt(Math.floor(Date.now() / 1000) - 1)
  );
  const onLoginRequired = vi.fn();
  await expect(runDeploy({ cwd: root, onLoginRequired })).rejects.toThrow(
    /agent authorization/iu
  );
  expect(mocks.build).not.toHaveBeenCalled();
  expect(mocks.whoami).not.toHaveBeenCalled();
  expect(onLoginRequired).not.toHaveBeenCalled();
});
