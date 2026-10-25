import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { SignJWT } from "jose";
import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { z } from "zod";

import { runDeploy } from "./deploy";
import { linkTestDependencies } from "./test-utils";

// oxlint-disable-next-line typescript/strict-void-return -- promisify consumes execFile's completion callback, not its ChildProcess return value.
const execute = promisify(execFile);

beforeAll(async () => {
  await execute("pnpm", ["run", "build"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    timeout: 60_000,
  });
}, 60_000);

const scope = { name: "user", value: { userId: "one" } };
const requests: { body: string; method?: string; path?: string }[] = [];
let root: string;
let host: string;
let missingApp: boolean;
let currentName: string;
let description: string | null;
let updateFails: boolean;

type PlatformResponse =
  | { scope: typeof scope }
  | { description: string | null; name: string }
  | { id: string; status?: string }
  | { code?: string; message: string }
  | {
      assets: { uploadUrl: string }[];
      deployment: { id: string };
      server: { uploadUrl: string };
    };

const respond = (
  response: ServerResponse,
  data: PlatformResponse,
  status = 200
) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(data));
};

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse
) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  await once(request, "end");
  requests.push({
    body: Buffer.concat(chunks).toString("utf-8"),
    method: request.method,
    path: request.url,
  });

  switch (request.url ?? "") {
    case "/cli-auth/verify-token": {
      respond(response, { scope });

      return;
    }

    case "/apps/lookup": {
      respond(response, { description, name: currentName });

      return;
    }

    case "/apps/update": {
      respond(
        response,
        updateFails
          ? { code: "FORBIDDEN", message: "Cannot rename app." }
          : { id: "app-one" },
        updateFails ? 403 : 200
      );

      return;
    }

    case "/apps": {
      missingApp = false;
      respond(response, { id: "new-app" });

      return;
    }

    case "/deployments": {
      if (missingApp) {
        respond(response, { message: "App not found" }, 404);

        return;
      }

      respond(response, {
        assets: [{ uploadUrl: `${host}/upload` }],
        deployment: { id: "deployment" },
        server: { uploadUrl: `${host}/upload` },
      });

      return;
    }

    case "/upload": {
      response.end();

      return;
    }

    case "/deployments/deployment": {
      respond(response, { id: "deployment", status: "published" });

      return;
    }

    default: {
      respond(response, { message: "Unexpected request" }, 500);
    }
  }
};

const server = createServer((request, response) => {
  handleRequest(request, response).catch(() => {
    respond(response, { message: "Test server failed" }, 500);
  });
});

beforeEach(async () => {
  requests.length = 0;
  missingApp = false;
  currentName = "Old Name";
  description = "Keep this description";
  updateFails = false;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = z.object({ port: z.number() }).parse(server.address());
  host = `http://127.0.0.1:${address.port}`;
  const now = Math.floor(Date.now() / 1000);
  vi.stubEnv(
    "PATCHSMITH_AGENT_TOKEN",
    await new SignJWT({
      appId: "app-one",
      aud: "patchsmith-platform-cli",
      exp: now + 3600,
      iat: now,
      iss: "patchsmith-agent",
      platformUrl: host,
      projectId: "project",
      scope,
    })
      .setProtectedHeader({ alg: "HS256", typ: "patchsmith-agent+jwt" })
      .sign(new TextEncoder().encode("test-only-key"))
  );
  root = await mkdtemp(path.join(tmpdir(), "patchsmith-deploy-name-"));
  await linkTestDependencies(root);
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "src/slots"), { recursive: true });
  await writeFile(
    path.join(root, "src/slots/root.tsx"),
    'import { defineRoute } from "patchsmith/client"; export default defineRoute({ shellComponent: () => null });'
  );
  await writeFile(
    path.join(root, "vite.config.mjs"),
    'import { patchsmith } from "patchsmith/vite"; export default { plugins: [patchsmith()] };'
  );
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "package-name", type: "module" })
  );
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const closed = once(server, "close");
  server.close();
  await closed;
  await rm(root, { force: true, recursive: true });
});

const writeConfig = async (
  name = "Old Name",
  appDescription?: string | null
) => {
  await writeFile(
    path.join(root, "patchsmith.config.ts"),
    `export default ${JSON.stringify({ description: appDescription, host, name, slug: "my-app" })};`
  );
};

it.each(["  My app description  ", undefined, null])(
  "creates replacement apps with the configured name and slug and description %j",
  async (appDescription) => {
    missingApp = true;
    await writeConfig("  My App  ", appDescription);

    const onMissingAppId = vi
      .fn<NonNullable<Parameters<typeof runDeploy>[0]["onMissingAppId"]>>()
      .mockResolvedValue(true);

    expect(await runDeploy({ cwd: root, onMissingAppId })).toMatchObject({
      appId: "new-app",
      createdApp: true,
    });
    expect(onMissingAppId).toHaveBeenCalledExactlyOnceWith({
      appName: "My App",
      configPath: path.join(root, "patchsmith.config.ts"),
      hostUrl: host,
      reason: "not-found",
    });
    expect(
      JSON.parse(requests.find((r) => r.path === "/apps")?.body ?? "null")
    ).toEqual({
      description: appDescription?.trim() ?? null,
      name: "My App",
      scope,
      slug: "my-app",
    });
    expect(
      await readFile(path.join(root, "patchsmith.config.ts"), "utf-8")
    ).toContain('appId: "new-app"');
    expect(requests.some((r) => r.path === "/apps/update")).toBe(false);
  }
);

it.each(["Keep this description", null])(
  "renames linked apps before publishing and preserves description %j",
  async (savedDescription) => {
    description = savedDescription;
    await writeConfig("  My App  ");
    await runDeploy({ appId: "app-one", cwd: root });
    const update = requests.find((r) => r.path === "/apps/update");
    expect(update?.method).toBe("POST");
    expect(JSON.parse(update?.body ?? "null")).toEqual({
      app: { shortId: "app-one" },
      description: savedDescription,
      name: "My App",
      scope,
    });
    expect(requests.at(-1)?.path).toBe("/deployments/deployment");
  }
);

it("keeps an existing name without an update when it matches the config", async () => {
  await writeConfig("Old Name");
  await runDeploy({ cwd: root });
  expect(requests.some((r) => r.path === "/apps/update")).toBe(false);
  expect(requests.some((r) => r.path === "/apps/lookup")).toBe(true);
  expect(requests.at(-1)?.path).toBe("/deployments/deployment");
});

it.each([
  { appDescription: "  New description  ", name: undefined },
  { appDescription: "New description", name: "My App" },
  { appDescription: null, name: undefined },
  { appDescription: "", name: undefined },
])(
  "synchronizes description $appDescription with name $name before publishing",
  async ({ appDescription, name }) => {
    await writeConfig(name, appDescription);
    await runDeploy({ cwd: root });
    const update = requests.find((r) => r.path === "/apps/update");
    expect(update?.method).toBe("POST");
    expect(JSON.parse(update?.body ?? "null")).toEqual({
      app: { shortId: "app-one" },
      description: appDescription?.trim() ?? null,
      name: name ?? "Old Name",
      scope,
    });
    expect(requests.at(-1)?.path).toBe("/deployments/deployment");
  }
);

it.each(["Keep this description", null])(
  "skips updates when the configured description already matches %j",
  async (savedDescription) => {
    description = savedDescription;
    await writeConfig(undefined, savedDescription);
    await runDeploy({ cwd: root });
    expect(requests.some((r) => r.path === "/apps/update")).toBe(false);
    expect(requests.at(-1)?.path).toBe("/deployments/deployment");
  }
);

it.each(["name", "description"])(
  "fails deployment if the configured %s cannot be synchronized",
  async (field) => {
    updateFails = true;
    await writeConfig(
      field === "name" ? "My App" : undefined,
      field === "description" ? "New description" : undefined
    );
    await expect(runDeploy({ cwd: root })).rejects.toThrow(
      "Cannot rename app."
    );
    expect(requests.some((r) => r.path === "/deployments/deployment")).toBe(
      false
    );
  }
);
