import { asyncFixture } from "@patchsmith/config/testing";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import type { runAgentCommand } from "./agent";
import type { runLogin } from "./auth";
import type { runDeploy } from "./deploy";
import type { CliOptions } from "./options";

const mocks = vi.hoisted(() => ({
  actions: new Map<string, (options: CliOptions) => Promise<void>>(),
  agent: vi.fn(),
  deploy: vi.fn(),
  error: vi.fn(),
  generate: vi.fn(),
  info: vi.fn(),
  init: vi.fn(),
  login: vi.fn<typeof runLogin>(),
  logout: vi.fn(),
  open: vi.fn(),
  outro: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  whoami: vi.fn(),
}));

vi.mock("cac", () => ({
  cac: () => {
    const cli = {
      command: (name: string) => ({
        action: (action: (options: CliOptions) => Promise<void>) => {
          mocks.actions.set(name, action);

          return cli;
        },
        option: () => cli.command(name),
      }),
      help: vi.fn(),
      option: vi.fn(),
      parse: vi.fn(),
      version: vi.fn(),
    };

    return cli;
  },
}));

vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(),
  intro: vi.fn(),
  isCancel: vi.fn(),
  log: { error: mocks.error, info: mocks.info },
  outro: mocks.outro,
  spinner: () => ({ start: mocks.start, stop: mocks.stop }),
}));

vi.mock("./auth", () => ({
  createCliAuthApprovalUrl: () =>
    "https://host.example/cli-auth/approve?code=ABC-123",
  runLogin: mocks.login,
  runLogout: mocks.logout,
  runWhoami: mocks.whoami,
}));

vi.mock("./deploy", () => ({ runDeploy: mocks.deploy }));

vi.mock("./agent", () => ({ runAgentCommand: mocks.agent }));

vi.mock("./generator/types", () => ({ generateTypes: mocks.generate }));

vi.mock("./init", () => ({ runInit: mocks.init }));

vi.mock("./utils/open-browser", () => ({ openUrlInBrowser: mocks.open }));

await import("./index");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockImplementation(
    asyncFixture((_options, onUserCode) => {
      onUserCode({
        expiresAt: new Date("2030-01-01"),
        hostUrl: "https://host.example",
        userCode: "ABC-123",
      });

      return {
        hostUrl: "https://host.example",
        scope: { name: "org", value: { id: "org" } },
      };
    })
  );
});

it("passes --schema through generate with its working directory and config", async () => {
  mocks.generate.mockResolvedValue("/app/src/host.ts");
  await mocks.actions.get("generate")?.({
    config: "custom.config.ts",
    cwd: "/app",
    out: "src/host.ts",
    schema: "../host.json",
  });
  expect(mocks.generate).toHaveBeenCalledWith({
    configPath: "custom.config.ts",
    cwd: "/app",
    outFile: "src/host.ts",
    schemaPath: "../host.json",
  });
});

it("passes --bare, --src-dir and --schema through init while retaining the required host", async () => {
  mocks.init.mockResolvedValue("/workspace/app");

  // SAFETY: This test supplies a deliberately invalid value or a minimal platform double to exercise the runtime boundary.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- This test supplies a deliberately invalid value or a minimal platform double to exercise the runtime boundary. This controlled fixture supplies only the platform members exercised by the test, or deliberately invalid input for runtime validation.
  const init = mocks.actions.get("init [directory]") as unknown as (
    directory: string,
    options: CliOptions
  ) => Promise<void>;

  await init("/workspace", {
    bare: true,
    cwd: "/tmp",
    host: "http://localhost:3000/api/patchsmith",
    install: false,
    name: "app",
    schema: "host.json",
    srcDir: true,
    tooling: "vite",
  });
  expect(mocks.init).toHaveBeenCalledWith(
    expect.objectContaining({
      bare: true,
      cwd: "/tmp",
      directory: "/workspace",
      host: "http://localhost:3000/api/patchsmith",
      install: false,
      name: "app",
      schemaPath: "host.json",
      srcDir: true,
      tooling: "vite",
    })
  );
});

it("opens login approval and resumes deploy with the selected config and working directory", async () => {
  mocks.deploy.mockImplementation(
    async (options: Parameters<typeof runDeploy>[0]) => {
      const auth = await options.onLoginRequired?.();
      expect(auth).toEqual({
        hostUrl: "https://host.example",
        scope: { name: "org", value: { id: "org" } },
      });
      expect(mocks.stop).toHaveBeenCalledWith("Approved.");

      return {
        appId: "app",
        deploymentId: "deployment",
        hostUrl: auth?.hostUrl,
        uploadedFiles: [],
      };
    }
  );

  await mocks.actions.get("deploy")?.({
    config: "custom.config.ts",
    cwd: "/app",
  });

  expect(mocks.login).toHaveBeenCalledWith(
    { configPath: "custom.config.ts", cwd: "/app" },
    expect.any(Function)
  );
  expect(mocks.open).toHaveBeenCalledWith(
    "https://host.example/cli-auth/approve?code=ABC-123"
  );
  expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining("ABC-123"));
  expect(mocks.stop).toHaveBeenCalledWith("Authentication required.");
  expect(mocks.start).toHaveBeenLastCalledWith("Building and deploying app");
  expect(mocks.outro).toHaveBeenCalledWith("Deployment published.");
});

it("disables interactive deployment fallbacks and forwards the selected app", async () => {
  mocks.deploy.mockResolvedValue({
    appId: "selected-app",
    deploymentId: "deployment",
    hostUrl: "https://host.example",
    uploadedFiles: [],
  });
  await mocks.actions.get("deploy")?.({
    appId: "selected-app",
    cwd: "/app",
    interactive: false,
  });
  expect(mocks.deploy).toHaveBeenCalledWith(
    expect.objectContaining({
      appId: "selected-app",
      onLoginRequired: undefined,
      onMissingAppId: undefined,
      onTypecheckFailed: undefined,
    })
  );
  expect(mocks.login).not.toHaveBeenCalled();
});

it("preserves standalone login timeout and --no-open behavior", async () => {
  await mocks.actions.get("login")?.({ cwd: "/app", open: false, timeout: 60 });

  expect(mocks.login).toHaveBeenCalledWith(
    { configPath: undefined, cwd: "/app", host: undefined, timeout: 60_000 },
    expect.any(Function)
  );
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.stop).toHaveBeenCalledWith("Approved.");
  expect(mocks.outro).toHaveBeenCalledWith("Authenticated successfully.");
});

it("passes the explicit host through agent startup and automatic login", async () => {
  mocks.agent.mockImplementation(
    async (options: Parameters<typeof runAgentCommand>[0]) => {
      await options.onLoginRequired?.();
    }
  );

  await mocks.actions.get("agent")?.({
    app: "app-one",
    host: "https://host.example",
  });

  const expectedOnLoginRequiredMatcher1: unknown = expect.any(Function);
  expect(mocks.agent).toHaveBeenCalledWith({
    appId: "app-one",
    host: "https://host.example",
    onLoginRequired: expectedOnLoginRequiredMatcher1,
  });
  expect(mocks.login).toHaveBeenCalledWith(
    { host: "https://host.example" },
    expect.any(Function)
  );
  expect(mocks.open).toHaveBeenCalledOnce();
});

it("passes --host through standalone authentication commands", async () => {
  mocks.logout.mockResolvedValue({
    hostUrl: "https://host.example",
    removed: true,
  });
  mocks.whoami.mockResolvedValue({
    hostUrl: "https://host.example",
    scope: {},
  });
  const options = { cwd: "/host", host: "https://host.example" };

  await mocks.actions.get("login")?.(options);
  await mocks.actions.get("logout")?.(options);
  await mocks.actions.get("whoami")?.(options);

  expect(mocks.login).toHaveBeenCalledWith(
    { ...options, configPath: undefined, timeout: 1_800_000 },
    expect.any(Function)
  );
  expect(mocks.logout).toHaveBeenCalledWith({
    ...options,
    configPath: undefined,
  });
  expect(mocks.whoami).toHaveBeenCalledWith({
    ...options,
    configPath: undefined,
  });
});
