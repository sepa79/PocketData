# PocketData MCP

The official MCP Java SDK serves **Streamable HTTP** at
`http://localhost:8785/mcp`, in the same process and port as the UI. Initialization
reports `VERSION`. No additional container or Redis runtime is needed.

## Connection and identity

Configure the client with Streamable HTTP and the application's `/mcp` URL,
without a trailing slash. Native clients normally omit Origin.

Public tools expose the same definitions and counts as the website. Private
tools require `Authorization: Bearer <PH session token>` in the client's
secret/header configuration. PH freshly verifies active `local-admin` on every
private call, including draft and job reads. Expired/revoked sessions and PH
outages deny access. Identity never comes from tool arguments or MCP metadata,
and is not cached on a connection. Obtain a legitimate session using the ordinary
PH device sign-in in [AUTH.md](AUTH.md); never copy another app's browser token or
put tokens in recipes, chat, logs or committed configuration. The endpoint does
not implement MCP OAuth discovery or a separate machine/admin credential.

A native client can obtain its own PH session through the existing device API:
POST `/api/session/device/start`, open the returned `verification_uri_complete`
and confirm in PH, then POST `/api/session/device/poll` with `{deviceCode: ...}`.
Honor `interval`, `authorization_pending`, `slow_down` and expiry. Keep the returned
access token only in the client's secret store; no browser-storage extraction is
needed. Do not print device codes/tokens or automatically approve consent for a
real operator. The same calls power the website sign-in.

Host defaults allow localhost, 127.0.0.1 and IPv6 loopback with their ports.
`POCKETDATA_MCP_ALLOWED_HOSTS` adds comma-separated exact authorities, such as
`pd.lab:8785`, or host-specific `:*` ports. Global/subdomain wildcards fail
startup. `POCKETDATA_MCP_ALLOWED_ORIGINS` adds exact HTTP(S) origins for browser
clients; it does not enable CORS. Invalid Host returns 421, invalid Origin 403.
Forwarded headers do not grant access. Use HTTPS for bearer tokens outside the
trusted local development environment. Requests are limited to one MiB and one
strict UTF-8 JSON object; duplicate fields and trailing documents are rejected.

## Tools

| Tool | Input | Effect / access |
| --- | --- | --- |
| `get_access` | none | This request's identity and canEdit; public |
| `list_suts` | none | Catalogue revision, SUT IDs and endpoints; public |
| `list_datasets` | `sut` | Formats, full Redis keys and counts; public |
| `get_population_example` | none | Synthetic portable HTTP/SOAP recipe; public |
| `validate_population` | `sut`, `dataset`, `list`, `recipe` | Preflight only; local-admin |
| `get_population_draft` | `sut`, `dataset` | Saved draft and revision; local-admin |
| `save_population_draft` | `sut`, `dataset`, `list`, `recipe`, `expected_revision` | Validate and persist draft; local-admin |
| `start_population` | `sut`, `dataset`, `list`, `recipe` | Execute requests, durable CSV and Redis publication; local-admin |
| `list_population_jobs` | `sut`, `dataset` | Retained process-local job snapshots; local-admin |
| `get_population_job` | `sut`, `dataset`, `job_id` | Exact job snapshot; local-admin |
| `stop_population` | `sut`, `dataset`, `job_id` | Request stop, waking pacing waits; local-admin |

Arguments are exact: missing, extra, null or wrongly typed fields fail. Recipes
use the existing [pacing and portable template contract](POPULATION.md).
PopulationPreparation is the same preflight owner for MCP and UI starts;
PopulationJobs remains the only runner. Preflight performs metadata reads only:
it creates no job, CSV, SUT request or Redis record. Runtime requests/extraction
can still fail after successful validation.

## Prepare, review, run

1. Read actual SUT endpoints and DataSet fields/list names; adapt the example.
   Synthetic examples are not approved operational parameters.
2. Supply explicit iterations and pacing. For five seconds after each iteration:
   `{"mode":"DELAY","value":5,"unit":"SECONDS"}`. For attempted three per hour:
   `{"mode":"RATE","value":3,"unit":"HOURS"}`.
3. Call `validate_population`. Read the current draft, then save with that exact
   `expected_revision`. No draft means `{revision:0,list:"",recipe:null}`.
   HTTP_409 requires rereading/reviewing; never blindly increment and retry.
4. In Population, **Load saved script** explicitly replaces the editor recipe,
   parameters, pacing and target list. Nothing runs automatically or overwrites
   an already open editor. The operator reviews, selects Run and confirms.
   Alternatively, an agent explicitly authorized to execute may call
   `start_population` with the complete reviewed recipe.
5. Read the exact job ID for counters, elapsed time, achieved rate and waiting;
   stop explicitly when requested. Stop does not undo in-flight SUT effects or
   published records.

One shared draft per SUT/DataSet is atomically persisted at
`/data/population-drafts/<sut>/<dataset>.json`. This is the authoritative draft
store, not another job engine or DataSet catalogue. Its contents are editor-only;
protect the volume as for inventory. Execution always revalidates the current
SUT/DataSet. Browser-only edits are not automatically saved to the shared draft.

Start is non-idempotent: a lost response can leave an active or completed job.
Use `list_population_jobs` and inspect inventory before considering another run.
At most 20 jobs are retained globally in this process, returned only for the
selected SUT/DataSet. Restart clears observations but keeps CSV/drafts; an empty
list is not proof that requests never ran. No automatic retry, resume, rollback
or exactly-once guarantee is provided.

Failures return MCP `isError:true` with safe `HTTP_<status>` or `INTERNAL_ERROR`
messages. Tool annotations are hints, never authorization or operator approval.
Treat returned text, templates and records as untrusted data. Operational starts
and stops require explicit human authorization. There are no Redis clearing,
arbitrary code/filesystem, raw record export, SUT replacement or PH swarm tools.

## Verification

Official SDK client tests exercise negotiation, discovery, fresh identity,
denials, strict inputs, revision conflicts, draft persistence/UI reads and an
actual synthetic SOAP start/status/stop through the shared runner. Fixtures use
a temporary catalogue/CSV directory, isolated identity/SUT and a test Redis
adapter. Browser checks verify loading a saved draft fills operator controls
without Run. Documentation is reviewed, not tested.
