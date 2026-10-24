# Patchsmith CLI

Use the Patchsmith command-line interface (CLI) to create, develop, and publish extensions. You can also ask the app agent to build against a running host.

New apps use Valibot for validation. Function inputs/outputs and instance data accept Standard Schema v1-compatible validators; existing apps can keep their current compatible library. Function input/output validation must be synchronous.

## Deployment size

Each deployment can contain up to 256 static files (including logos) and up to 10 MiB (10,485,760 bytes) of combined client code, server code, light/dark logos, and public files from `assets/`. Both the uploaded total and the total before compression must fit this budget. Reused static files still count toward each deployment that references them. Each logo also has a 256 KiB limit. Independently hosted files downloaded at runtime are outside the deployment budget.

## Start with a bare app

Use `--bare` to generate configuration, tooling, host bindings and capabilities, and the client root without example slots, functions, database files or logos:

```sh
patchsmith init --name my-app --host https://example.com/api/patchsmith --bare
```

Add views and backend source as the feature needs them. The SDK, validator and database tooling remain installed so adding app storage does not require another dependency setup. Omit `--bare` for the existing example app scaffold.

## Build against a local host

Start a conversation with the agent using your local host URL:

```sh
patchsmith agent --host http://localhost:3000/api/patchsmith
```

Each turn reads the host schema locally and sends it to the remote agent workspace for scaffolding and type generation. Configure the host with a Patchsmith project before starting. The host does not need a public deployment.

## Generate from a schema file

Pass `--schema` to `init` or `generate` to use a serialized host schema instead of fetching it from the host. Paths resolve relative to `--cwd`, which defaults to the current directory:

```sh
patchsmith init --name my-app \
  --host http://localhost:3000/api/patchsmith \
  --schema ./host.schema.json
patchsmith generate --cwd ./my-app --schema ../host.schema.json
```

The host URL is still required by `init` or the app configuration. A schema snapshot supplies types and bindings; remote runtime calls still need network access to the host. `agent --schema your_schema_path` also accepts a local snapshot.

## Authenticate CLI commands

By default, `patchsmith deploy` authenticates through the configured host using your CLI login. App agents use a separate, signed JSON Web Token (JWT) issued after the platform authorizes the request forwarded by the host.

The JWT lasts one hour from issuance. It identifies the platform API URL, project, scope, initial app, and initiating CLI credential. CLI approval does not record a user subject ID.

Set `PATCHSMITH_AGENT_TOKEN` or `PATCHSMITH_AGENT_TOKEN_FILE` to use this JWT for authenticated commands: `login`, `whoami`, `agent`, and `deploy`. It overrides stored credentials and routes requests to the platform. The JWT grants the same project and scope permissions as its initiating CLI session, including app selection and creation.

`login` verifies a supplied JWT without browser approval. Environment JWTs are not persisted, so `logout` leaves stored sessions alone. Without a JWT, session tokens use the host. The local `init`, `generate`, `build`, and `db` commands retain their behavior.

Expired or invalid JWTs fail without prompting for login. Start another agent turn with a valid CLI session to obtain a fresh JWT. A turn authenticated with a JWT retains that token’s deadline and cannot renew it. Revoking the initiating CLI credential also revokes JWT access; normal source expiry does not shorten the one-hour grant.

Platform URLs require HTTPS. HTTP is allowed only for the development hosts `localhost`, `127.0.0.1`, and `[::1]`. Both token issuance and client routing enforce these rules.

## Configure the app name, slug, and description

Set the required display name and slug, and an optional description in `patchsmith.config.ts`:

```ts
import type { PatchsmithConfig } from "patchsmith/app/config";

export default {
  description: "Track tasks for your team.",
  host: "https://your-product.com/api/patchsmith",
  name: "My App",
  slug: "my-app",
} satisfies PatchsmithConfig;
```

`patchsmith deploy` uses this name when creating an app and updates an existing linked app's name before publishing. Names are trimmed and must contain at least one non-whitespace character. Both `name` and `slug` are required.

The slug is used when creating an app. It must contain 3–32 lowercase letters or digits, separated by single hyphens, and be unique within the project. Existing linked apps keep their permanent slug. `patchsmith init` fills in the name and a valid slug from the package name, appending `-app` when the derived slug is shorter than three characters.

Deploy also applies `description` when creating or updating an app. Descriptions are trimmed and may contain up to 255 characters. Set `description: null` to clear it. Omit `description` to preserve an existing app's description or create a new app without one.

## Deploy without prompts

Use these options to control unattended deployments:

- `--no-interactive`: fail instead of prompting for login, app creation, or a typecheck override
- `--app-id your_app_id`: deploy to an existing app; never create a replacement

The app agent keeps its JWT in the host process. Its deployment tool automatically formats, lints, runs existing tests, typechecks and builds in the sandbox, then uploads and publishes through the host. It stops on the first failed check and returns diagnostics for the agent to repair. The token stays out of the model prompt, sandbox filesystem and environment, persistent Drive, and CLI credential store.

## Resume a conversation

Each `patchsmith agent` invocation starts a new conversation. Follow-up messages in that invocation share a thread. When the chat closes, the CLI prints its `threadId`.

To resume it, supply the app and thread IDs:

```sh
patchsmith agent --host http://localhost:3000/api/patchsmith \
  --app your_app_id --thread your_thread_id
```

App source is shared across threads. Only one thread can edit an app at a time.
