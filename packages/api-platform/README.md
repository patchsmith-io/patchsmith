# Patchsmith platform API

`@patchsmith/api-platform` implements the platform API for managing and running Patchsmith extensions.

## Connect to the app-agent MCP endpoint

Connect Model Context Protocol (MCP) clients to `POST /api/platform/app-agent/mcp`. The web app mounts this streaming HTTP endpoint using `handleAppAgentMcpRequest` from `@patchsmith/api-platform/app-agent-mcp`. Send an MCP JSON-RPC request body and the required MCP metadata headers. Responses use MCP Server-Sent Events (SSE).

The host's server-side client supplies two headers:

- `Authorization: Bearer your_project_key` authenticates the host. CLI agent JSON Web Tokens (JWTs) and runtime service credentials cannot use this endpoint.
- `X-Patchsmith-Context` contains unpadded base64url-encoded UTF-8 JSON with `{ scopes, subjectId, hostUrl }`. The endpoint enforces an 8 KiB limit and rejects invalid encodings, empty scopes, and unexpected fields.

`scopes` and required `subjectId` have the same shape as the object returned by `authenticate()`. The authenticated host asserts those values.

`hostUrl` is the configured public Patchsmith host API URL; the builder agent reads its `/schema` endpoint during generation. If an `Origin` header is present, it must match that host origin. A host proxy is not involved in MCP requests.

The typed `server.mcp.transport({ scopes, subjectId })` helper prepares the URL and headers, validates the scopes against the host contract, and handles encoding. Clients may also construct these headers directly, using their own MCP library.

App reads, creation, and edits use the authenticated project and exact canonical scope identities. Builder/editor agents receive a one-hour grant for the selected app's scope, using the existing CLI/JWT authorization and revocation checks. The platform revokes the source grant when the call finishes, fails, or is cancelled. The workflow records `subjectId` in its attributes for provenance.

See [the MCP tools, streaming contract, and compatibility requirements](../agent/README.md#mcp).

## Publish a deployment

`POST /deployments/{deploymentId}` permits one publication attempt at a time. An atomic database claim owns verification, file status changes, and cleanup. An overlapping request receives `409 CONFLICT` while verification is in progress and can retry after the attempt finishes.

A repeated request for a published deployment returns the stored deployment without verifying files, changing deployment selection, or enqueueing warm-up again. The first successful request's `rollout` choice is final, including when a later request supplies a different value.

Failed or cancelled verification releases the claim and resets unfinished files so the deployment can be retried. Once publication commits, rollout selection and warm-up enqueueing finish even if the caller disconnects. Publication and rollout selection commit in the same database transaction.
