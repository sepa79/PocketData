# Architecture

PocketData is one Java 21 / Spring Boot HTTP process serving a built React/TypeScript/Vite frontend. It connects to the explicitly selected PH Redis; it does not own a Redis service or live-record volume. A single application replica owns the durable inventory volume. No distributed writer or multi-replica guarantee is implemented. See REDIS.md for network/endpoint ownership.

## Owners

- CatalogStore: authoritative SUT validation, revision checks and atomic JSON persistence. Invalid stored files fail startup; no silent empty replacement.
- RedisDatasets: Redis connection lifecycle, metadata creation/read, atomic snapshot-checked metadata edits and explicit list operations. No dataset copy in the catalogue, no checkout state.
- RecordFormat: shared field/type and additive-edit validation and CSV conversion, preserving additional columns.
- CsvInventory: bounded streaming upload, full preflight validation, durable CSV before Redis writes, and inventory reads. No account/card creation or automatic retry.
- PhAuthClients: one explicit ingress and consumer-selected public endpoint transport permission for construction of shared JVM identity/device clients; validation stays in the shared PH client, with no protocol implementation or product permissions.
- AuthService: fresh PH identity to PocketData access policy; local-admin is the only editor. No OAuth or HTTP transport implementation.
- DeviceSessionService: thin adaptation of the shared device client to the session API. PH remains the only login-transaction/token owner; polling belongs to the shared browser module.
- Controllers: transport mapping and access checks, not domain state.
- VersionInfo: VERSION-backed metadata and process health. Health does not claim remote Redis/auth readiness.
- Frontend: presentation only. Backend access checks remain authoritative.
- RedisCommanderLink: validate the explicit external inspector URL exposed by connection configuration; no record access, proxying or Redis connection ownership.
- PopulationPreparation: resolve the current SUT/DataSet/list and delegate recipe validation for UI start, MCP preflight and draft saves. PreparedPopulation carries the exact format snapshot into the runner.
- PopulationDrafts: atomic revision-checked persistence of one recipe draft per SUT/DataSet, without execution. PopulationDraftController authenticates and projects it into the editor.
- MCP adapters: the official SDK owns Streamable HTTP. McpBoundaryFilter/McpSecurity bound requests and authorities; McpToolCatalog declares discovery, McpArguments validates envelopes, McpTools delegates to product owners with fresh AuthService checks. See MCP.md.

Scripted population follows [POPULATION.md](POPULATION.md). Focused owners are
PopulationValidator (product/job preflight), PopulationTemplates (shared portable
binding), PopulationHttp (bounded transport), PopulationResponses (safe product
mapping of shared response interpretation),
PopulationJob (one job's state) and PopulationJobs (coordination only).
PopulationPacing owns explicit delay/rate admission and the wait calculation;
PopulationJob owns interruptible waiting, monotonic elapsed time and achieved
rate observations. PopulationJobs applies pacing only between full iterations.
Neither shared PH HTTP calls nor Redis circulation own pacing or catch-up work.
PopulationController authenticates/maps requests. CsvInventory and its
GeneratedInventory/DurableCsv delegates remain the only output writers;
RedisDatasets remains the sole publisher. There is no second record-state machine,
template parser, format validator or swarm runtime. PH template-data owns strict
JSON/XML/Pointer/XPath and SOAP; request-templates owns portable call/response
contracts; templating owns compiler/render profiles. The population HTTP boundary
uses that same strict JSON reader before duplicate/trailing data can become a map.

The opt-in [persistent demo](DEMO.md) keeps authored SUT/format/mock definitions
under `examples/demo`. Its setup helper calls the ordinary authenticated APIs;
it owns no catalogue validation, CSV writer, Redis client or alternate population
engine. The UI and setup consume the same authored default recipe. Demo bootstrap
is explicit tooling, never an application-startup fallback.

The workspace shell follows PocketPlanner: a 52px header with compact logo/version,
one identity/sign-in button, a collapsible left icon rail,
bounded content panels and bottom-right transient status messages. Product-specific
SUT/DataSet/CSV content stays in PocketData; there is no second identity UI or policy.
`frontend` consumes the actual `@pockethive/ui` package used by PH: shared shell,
header, controlled navigation rail and theme tokens. Product views/components and
`product.css` own only PocketData content. The independent shared
`@pockethive/browser-auth` module owns tab-scoped credentials and device polling;
the UI shell owns neither auth nor product state. The copied PP styles and old
static JavaScript frontend have been removed, not retained as a fallback.

The editing workspace has a visibly labelled Selected SUT selector one level
below the header. SUT/DataSet selection lives in the hash route's query string,
so navigation, browser Back and reload preserve the exact context. Switching SUT
clears the previous DataSet; missing explicit selections are reported rather than
silently substituted. useWorkspace owns the fetched catalogue/DataSet snapshots
and rejects late responses from another SUT.

DataSets are shown as a table with description, per-list counts and field count.
Opening a row shows the record-format table, full Redis list keys, metadata key
and actions for editing, CSV inventory/import and scripted population. Forms use
endpoint/list/field rows, short descriptions and keyboard/touch-accessible help.
RedisKey owns the frontend key presentation: the fixed SUT/DataSet prefix and
editable list suffix are visually distinct; RedisDatasets owns actual keys.
DatasetTarget is shared by CSV and Population and always shows the full target
key. The existing-format editor locks identities and existing fields/lists;
RecordFormat and RedisDatasets enforce the same edit boundary on the server.

The default Home view presents the full logo, workspace shortcuts and Redis/PH
Auth configuration cards. `useWorkspace` owns their `/api/connections` read-only
projection; Home only renders it. These flags are configuration, not remote health
checks. They are not repeated in the toolbars of the editing views.
Home uses `pocketdata-logo.svg` with “simple test data” beneath the complete
wordmark; the header keeps the compact `pocketdata-topbar.svg` without a subtitle.
The full mark/text proportions and text anchors follow PH/HF; text fitting adjusts
spacing only, never glyph width, in both full and compact assets.

Local shared npm tarballs are integrity-pinned by the frontend lockfile. Shared
JVM jars/POMs are explicit inputs in `vendor/maven`, with SHA256SUMS. Refresh them
deliberately with `scripts/refresh-shared-auth.sh PH_SOURCE`; it builds/installs
only the auth client, its contracts and parent POM at `pockethive.auth.version`,
then snapshots those artifacts without publishing. Dependency management pins
the auth contracts to that same version for all consumers. Template libraries
retain their independently pinned inputs; this auth refresh does not rebuild them.
Normal Docker builds need only this project and its pinned inputs, not sibling
working directories. Maven builds the frontend unless the Docker frontend stage
has supplied it explicitly using `-Dfrontend.skip=true`.

## Boundaries

SUT definitions and CSV inventory are persisted independently of Redis. Redis format metadata uses the agreed naming convention. DataSet selection is scoped to a SUT; there is no global unscoped dataset picker.

The manager is not in the Executor transaction path. PH can continue with its configured lists if PocketData is unavailable. Metadata observations may later be batched; they will be diagnostics, not locks. Optional recordId tracking remains deferred.

Population uses actual PH request-template/Pebble libraries as pinned build inputs.
No PH source dependency, Groovy runtime, full eval/sequence execution or embedded
whole-swarm startup is included. Protocol and persistence owners stay separate.

Maven produces a local build artifact; its `local` coordinate is not the application version. The packaged VERSION resource supplies the UI version. Release and publication boundaries are documented in RELEASING.md.
