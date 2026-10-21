# HTTP API

Scripted HTTP/SOAP population uses the authenticated routes and recipe contract
in [POPULATION.md](POPULATION.md). Existing catalogue/CSV/Redis endpoints retain
their owners and semantics.

All JSON responses use no-store. Unauthenticated reads expose definitions/counts, not raw CSV. Mutations and raw inventory reads require a freshly verified PH local-admin bearer session.

| Method/path | Contract |
| --- | --- |
| GET /api/info | Name and VERSION-backed application version |
| GET /health | Process health only |
| GET /api/session | PH identity/read-only policy |
| POST /api/session/device/start | Start pocketdata-device authorization; RFC 8628 response |
| POST /api/session/device/poll | `{deviceCode}`; RFC token result or explicit OAuth pending/denied/expired error |
| POST /api/session/logout | Browser-token revocation and central logout URL |
| GET /api/connections | Configured flags, never connection secrets |
| GET /api/catalog | revision and suts |
| PUT /api/catalog | expected current revision plus complete suts; rejects stale writes |
| GET /api/suts/{sut}/datasets | DataSet formats and per-list lengths |
| POST /api/suts/{sut}/datasets | Create format metadata once; body sutId must match path |
| POST /api/suts/{sut}/datasets/{dataset}/import?list={list} | Raw text/csv body; persistent inventory before publication |
| GET /api/suts/{sut}/datasets/{dataset}/inventory | Local CSV file identities/sizes; local-admin only |
| GET /api/suts/{sut}/datasets/{dataset}/inventory/{uuid} | Authenticated CSV attachment |

SUT shape: `id`, `name`, `description`, `endpoints` (name → explicit HTTP(S)/TCP(S) base URL, no credentials/query/fragment). This is PocketData's initial authoring shape, not a claim of a shipped PH SUT-create integration. The catalogue starts empty; no operational data is seeded. Public definitions must not contain credentials: supply secrets through deployment configuration when their integrations are implemented. API JSON bodies are bounded to 1 MiB; CSV imports to 25 MiB, including chunked requests.

Request failures use `{error}` with explicit 400/401/403/404/409/413/503 statuses. Unknown remote outcomes must not be interpreted as permission to replay writes. There are no delete/clear, SUT-request-execution or automatic-repopulation endpoints in this foundation.

Session HTTP mapping owns no login transaction or token store. The shared PH JVM
client owns the protocol/transport; PH owns identity and device grants; PocketData
access policy owns the active local-admin decision. Polling stays in the shared
browser client, honors the RFC interval, and stops on cancellation or terminal
results. No redirect callback or authorization-code exchange endpoint remains in
PocketData after this cut-over. Product permissions are never taken from the UI.
