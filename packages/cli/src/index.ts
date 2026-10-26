#!/usr/bin/env node
import { confirm, intro, isCancel, log, outro, spinner } from "@clack/prompts";
import { cac } from "cac";
import pc from "picocolors";

import {
  createCliAuthApprovalUrl,
  runLogin,
  runLogout,
  runWhoami,
} from "./auth";
import { runDeploy } from "./deploy";
import { generateTypes } from "./generator/types";
import { runInit } from "./init";
import type { CliOptions } from "./options";
import { openUrlInBrowser } from "./utils/open-browser";

declare const __PATCHSMITH_VERSION__: string;

const cli = cac("patchsmith");

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

const loginWithApproval = async (
  options: Parameters<typeof runLogin>[0],
  open = true
) => {
  const approvalSpinner = spinner();
  let isWaitingForApproval = false;

  try {
    const result = await runLogin(
      options,
      ({ expiresAt, hostUrl, userCode }) => {
        const approvalUrl = createCliAuthApprovalUrl(hostUrl, userCode);

        if (open) {
          void openUrlInBrowser(approvalUrl);
        }

        log.info(`Enter this code in the host app: ${pc.bold(userCode)}`);
        log.info(`Approval URL: ${pc.cyan(approvalUrl)}`);
        log.info(`Code expires at ${expiresAt.toLocaleString()}.`);
        log.info("Waiting for approval...");
        approvalSpinner.start("Checking approval status");
        isWaitingForApproval = true;
      }
    );

    if (isWaitingForApproval) {
      approvalSpinner.stop("Approved.");
    }

    return result;
  } catch (error) {
    if (isWaitingForApproval) {
      approvalSpinner.stop("Approval failed.");
    }

    throw error;
  }
};

cli
  .command("login", "Authenticate the Patchsmith CLI with a host app")
  .option("--cwd <path>", "Working directory", { default: "." })
  .option("--host <url>", "Patchsmith host API URL (overrides config host)")
  .option("--config <path>", "Path to patchsmith config")
  .option("--open", "Open the approval URL in the default browser", {
    default: true,
  })
  .option("--timeout <seconds>", "Seconds to wait for approval", {
    default: 1800,
  })
  .action(async (options: CliOptions) => {
    intro(pc.bold("Patchsmith"));

    try {
      const timeoutSeconds = Math.trunc(
        Number(String(options.timeout ?? "1800"))
      );

      if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
        throw new Error("--timeout must be a positive integer.");
      }

      await loginWithApproval(
        {
          configPath: options.config,
          cwd: options.cwd ?? ".",
          host: options.host,
          timeout: timeoutSeconds * 1000,
        },
        options.open !== false
      );
      outro("Authenticated successfully.");
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command("logout", "Remove stored Patchsmith CLI credentials for a host app")
  .option("--cwd <path>", "Working directory", { default: "." })
  .option("--host <url>", "Patchsmith host API URL (overrides config host)")
  .option("--config <path>", "Path to patchsmith config")
  .action(async (options: CliOptions) => {
    intro(pc.bold("Patchsmith"));

    try {
      const result = await runLogout({
        configPath: options.config,
        cwd: options.cwd ?? ".",
        host: options.host,
      });

      outro(
        result.removed
          ? `Logged out of ${pc.cyan(result.hostUrl)}.`
          : `No stored credentials found for ${pc.cyan(result.hostUrl)}.`
      );
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command("whoami", "Show the current Patchsmith CLI authentication scope")
  .option("--cwd <path>", "Working directory", { default: "." })
  .option("--host <url>", "Patchsmith host API URL (overrides config host)")
  .option("--config <path>", "Path to patchsmith config")
  .action(async (options: CliOptions) => {
    intro(pc.bold("Patchsmith"));

    try {
      const result = await runWhoami({
        configPath: options.config,
        cwd: options.cwd ?? ".",
        host: options.host,
      });

      log.info(`Host: ${pc.cyan(result.hostUrl)}`);
      log.info(`Scope: ${pc.cyan(JSON.stringify(result.scope))}`);
      outro("Authenticated.");
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command("deploy", "Build and deploy the Patchsmith app")
  .option("--app-id <id>", "Deploy to this existing app")
  .option(
    "--no-interactive",
    "Fail instead of prompting for login, app creation, or type check overrides"
  )
  .option("--cwd <path>", "Working directory", { default: "." })
  .option("--config <path>", "Path to patchsmith config")
  .option("--out-dir <path>", "Build output directory")
  .option("--mode <mode>", "Vite mode")
  .action(async (options: CliOptions) => {
    intro(pc.bold("Patchsmith"));
    const deploySpinner = spinner();

    try {
      deploySpinner.start("Building and deploying app");

      const deployOptions: Parameters<typeof runDeploy>[0] = {
        appId: options.appId,
        configPath: options.config,
        cwd: options.cwd ?? ".",
        mode: options.mode,
        onLoginRequired: async () => {
          deploySpinner.stop("Authentication required.");

          const auth = await loginWithApproval({
            configPath: options.config,
            cwd: options.cwd ?? ".",
          });

          deploySpinner.start("Building and deploying app");

          return auth;
        },
        onMissingAppId: async ({ appName, configPath, hostUrl, reason }) => {
          deploySpinner.stop("App not linked.");
          log.info(
            reason === "missing"
              ? `No appId found in ${pc.cyan(configPath)}.`
              : `The appId in ${pc.cyan(configPath)} does not exist.`
          );
          log.info(`Host: ${pc.cyan(hostUrl)}`);

          const shouldCreate = await confirm({
            initialValue: true,
            message:
              reason === "missing"
                ? `Create a Patchsmith app named ${appName}?`
                : `Create a new Patchsmith app named ${appName} and update the config?`,
          });

          if (isCancel(shouldCreate)) {
            return false;
          }

          if (shouldCreate) {
            deploySpinner.start("Creating app and deploying");
          }

          return shouldCreate;
        },
        onTypecheckFailed: async ({ command, output }) => {
          deploySpinner.stop("Type check failed.");
          log.error(`Type check failed while running ${pc.cyan(command)}.`);

          if (output) {
            log.error(output);
          }

          const shouldUpload = await confirm({
            initialValue: false,
            message:
              "Type check failed, but the app built successfully. Upload anyway?",
          });

          if (isCancel(shouldUpload)) {
            return false;
          }

          if (shouldUpload) {
            deploySpinner.start("Uploading app");
          }

          return shouldUpload;
        },
        outDir: options.outDir,
      };

      if (options.interactive === false) {
        deployOptions.onLoginRequired = undefined;
        deployOptions.onMissingAppId = undefined;
        deployOptions.onTypecheckFailed = undefined;
      }

      const result = await runDeploy(deployOptions);
      deploySpinner.stop("Deployed app.");

      if (result.createdApp) {
        log.info(
          `Created app and updated patchsmith.config.ts with ${pc.cyan(result.appId)}.`
        );
      }

      log.info(`Host: ${pc.cyan(result.hostUrl)}`);
      log.info(`App: ${pc.cyan(result.appId)}`);
      log.info(`Deployment: ${pc.cyan(result.deploymentId)}`);
      log.info("Uploaded files:");

      for (const file of result.uploadedFiles) {
        log.info(
          `  ${pc.cyan(file.path)} ${pc.dim(`${formatBytes(file.size)} raw, ${formatBytes(file.gzipSize)} gzip`)}`
        );
      }

      if (
        result.status !== undefined &&
        result.status !== null &&
        result.status !== ""
      ) {
        log.info(`Status: ${pc.cyan(result.status)}`);
      }

      outro("Deployment published.");
    } catch (error) {
      deploySpinner.stop("Deployment failed.");
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command("db <command>", "Generate database migrations with db generate")
  .option("--cwd <path>", "Working directory", { default: "." })
  .option("--config <path>", "Path to patchsmith config")
  .option("--name <name>", "Migration name")
  .action(async (command: string, options: CliOptions) => {
    intro(pc.bold("Patchsmith"));

    try {
      if (command !== "generate") {
        throw new Error(
          `Unknown database command: ${command}. Use patchsmith db generate.`
        );
      }

      const { generateAppMigrations } =
        await import("@patchsmith/vite/builder");

      const directory = await generateAppMigrations({
        configPath: options.config,
        cwd: options.cwd ?? ".",
        name: options.name,
      });

      outro(`Migrations are up to date in ${pc.cyan(directory)}.`);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command("generate", "Generate Patchsmith app bindings")
  .option(
    "--schema <path>",
    "Read the host schema from a JSON file instead of the host"
  )
  .option("--cwd <path>", "Working directory", { default: "." })
  .option("--config <path>", "Path to patchsmith config")
  .option("--out <path>", "Generated TypeScript output file")
  .action(async (options: CliOptions) => {
    intro(pc.bold("Patchsmith"));

    try {
      const outPath = await generateTypes({
        configPath: options.config,
        cwd: options.cwd ?? ".",
        outFile: options.out,
        schemaPath: options.schema,
      });

      outro(`Generated ${pc.cyan(outPath)}.`);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command("init [directory]", "Create a new Patchsmith app")
  .option(
    "--schema <path>",
    "Read the host schema from a JSON file instead of the host"
  )
  .option("--cwd <path>", "Working directory", { default: "." })
  .option("--name <name>", "Package name")
  .option("--host <url>", "Patchsmith host URL")
  .option("--package-manager <pm>", "Package manager: bun, yarn, pnpm, or npm")
  .option("--tooling <tooling>", "Tooling: vite-plus (recommended) or vite")
  .option(
    "--bare",
    "Create only app configuration, bindings and the client root"
  )
  .option(
    "--install",
    "Install dependencies after scaffolding (use --no-install to skip)"
  )
  .option(
    "--src-dir",
    "Place app source inside src/ instead of the project root"
  )
  .option("--force", "Overwrite existing files")
  .action(async (directory: string | undefined, options: CliOptions) => {
    intro(pc.bold("Patchsmith"));

    try {
      const cwd = options.cwd ?? ".";

      const targetDirectory = await runInit({
        bare: options.bare,
        cwd,
        directory,
        force: options.force,
        host: options.host,
        install: options.install,
        name: options.name,
        packageManager: options.packageManager,
        schemaPath: options.schema,
        srcDir: options.srcDir,
        tooling: options.tooling,
      });

      outro(`Created app at ${pc.cyan(targetDirectory)}.`);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command("agent", "Chat with the Patchsmith app agent")
  .option(
    "--thread <id>",
    "Resume an existing agent conversation (otherwise starts a new thread)"
  )
  .option(
    "--schema <path>",
    "Host schema snapshot for generation without host access"
  )
  .option("--host <url>", "Patchsmith host API URL (required)")
  .option("--app <id>", "App ID (otherwise prompts to select or create an app)")
  .action(async (options: CliOptions) => {
    try {
      const { runAgentCommand } = await import("./agent");
      await runAgentCommand({
        appId: options.app,
        host: options.host,
        onLoginRequired: async () =>
          await loginWithApproval({
            host: options.host,
          }),
        schemaPath: options.schema,
        threadId: options.thread,
      });
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

cli.help();

cli.version(__PATCHSMITH_VERSION__);

cli.parse();
