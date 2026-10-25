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

### Recover an abandoned publication

A worker crash can leave a deployment in `verifying`, causing subsequent publication requests to return `409 CONFLICT`. Claims have no owner identity or expiry, so the API does not reclaim them automatically. An old `updated_at` value alone does not prove that a request has stopped; resetting a live claim would allow its writes and cleanup to overlap a new attempt.

An operator can recover an abandoned claim with the following procedure:

1. Block publication requests on **every API replica**, including older versions, and pause client retries. Drain all in-flight publication requests or terminate their workers, then confirm their database operations and transactions have finished. Keep publication blocked until recovery commits. If an old attempt could still resume, do not reset the claim.
2. Connect to the affected platform database with `psql`. Set `deployment_id` to the deployment UUID, then inspect its app, project, and status to confirm the intended target:

   ```sql
   \set deployment_id 'REPLACE_WITH_DEPLOYMENT_UUID'

   SELECT d.id, d.app_id, a.project_id, d.status, d.updated_at
   FROM app_deployment AS d
   JOIN app AS a ON a.id = d.app_id
   WHERE d.id = :'deployment_id'::uuid;
   ```

3. Only for the confirmed abandoned `verifying` deployment, release the claim and reset its unfinished file statuses atomically:

   ```sql
   BEGIN;

   WITH released AS (
     UPDATE app_deployment
     SET status = 'uploading', updated_at = CURRENT_TIMESTAMP
     WHERE id = :'deployment_id'::uuid AND status = 'verifying'
     RETURNING id
   ), reset_files AS (
     UPDATE app_deployment_file
     SET status = 'uploading', updated_at = CURRENT_TIMESTAMP
     WHERE app_deployment_id IN (SELECT id FROM released)
       AND status = 'verifying'
     RETURNING id
   )
   SELECT (SELECT count(*) FROM released) AS deployments_released,
          (SELECT count(*) FROM reset_files) AS unfinished_files_reset;

   COMMIT;
   ```

   Expect `deployments_released = 1`. A zero count means the target is missing or no longer `verifying`; inspect it again instead of forcing a reset. The statement leaves published deployments, completed file statuses, shared assets, and rollout selection unchanged.

4. Restore publication traffic and retry the original request with its intended `rollout` value. Confirm publication succeeds and the deployment's files are verified.
