# Local verification

Latest source/UI checks: 2026-10-23; image checks below retain their own dates. Local only; no release, GitHub
publication, operational data export or lab deployment.

## Visible CSV inventory explanation: 2026-10-23

- Inventory and Population share visible copy explaining server-side file
  discovery, imported/generated CSV sources, restart persistence, reuse and the
  distinction between a saved snapshot and live/fully published Redis records.
- The 47 existing focused inventory/population UI tests and production build
  pass. The Docker build passes the existing full frontend/backend checks
  (three Redis integration tests remain gated off inside Docker).
- Image `sha256:ea7829b0530b17c612cbf449438d560d39f9ee9966c48ba8b92de9d446ac3812`
  is healthy locally on 8785, retaining the existing data volume. A real PH
  sign-in/browser check verified visible help in both views, desktop/mobile
  layout and zero browser errors or operational writes. Screenshots were
  inspected; evidence is `/tmp/pd-csv-help-browser.log` and
  `/tmp/pd-csv-help-mobile.png`. The test's own app session was signed out.

## External Redis Commander link: 2026-10-23

- The existing details/navigation test verifies the explicit external URL and
  new-tab protection. The 22 focused UI tests and TypeScript/Vite build pass;
  the 13 focused HTTP/MCP tests pass. The Docker build passes all 129 frontend
  tests and 175 Java tests, with the three isolated-Redis tests gated off there.
- The local image
  `sha256:5d44594fe1cabc8a908cecf277bb5b1ea5e9d49ba36de74a1e4502d196c1fe92`
  is healthy on 8785 and retains the same inventory volume. Connection
  configuration advertises `http://localhost:8081/` from the explicit local env.
- A real browser verified the link under Redis lists, full keys, new-tab
  attributes and desktop/mobile layout with no browser errors or operational
  writes. Evidence: `/tmp/pd-redis-link-browser.log` and
  `/tmp/pd-redis-link-desktop.png`. The external Commander remains stopped; this
  check verifies the link, not record browsing or Commander authentication.

## MCP and shared Population drafts: 2026-10-23

- 178 Java tests pass with zero failures/errors/skips against the isolated Redis
  on 16385. Seven official SDK HTTP tests cover discovery, identity changes and
  denial, strict envelopes/bodies/Host/Origin, draft revision conflicts and disk
  reopen, authenticated UI draft reads, and real synthetic SOAP start/read/stop
  through the existing runner. No operational Redis or CSV was used.
- 129 frontend tests and the TypeScript/Vite production build pass. Loading a
  saved agent draft updates script name, list, count and pacing, makes no start
  request, and still requires the normal Run confirmation. Missing drafts leave
  the current editor intact.
- `tests/workspace.browser.cjs` passes using a temporary catalogue/inventory,
  identity fixture and isolated Redis. Its pacing helper now negotiates MCP,
  discovers tools, validates/saves a draft and loads it through the actual UI
  before separately confirming Run. Zero SUT requests precede Run; the existing
  seven synthetic requests verify delay/rate/stop. Desktop/mobile screenshots
  were inspected; no browser errors. Evidence:
  `/tmp/pd-workspace-ui-5xOK9P/result.json`.
- Local Docker image
  `sha256:ad80e41086bb0385aa8d26105e7c8c175852f4b38cbc57734688fc98d706ad85`
  is healthy on 127.0.0.1:8785. The image build passes 129 frontend tests and
  175 Java tests; its three Redis-gated tests are skipped only inside the image
  build and pass in the isolated-Redis run above. The existing
  `pocketdata_pocketdata_inventory` volume remains mounted unchanged.
- The deployed `/mcp` was verified with an independently obtained PH device
  session through the official 8088 ingress: anonymous private access denied,
  confirmed local-admin access and authenticated draft read succeeded. The
  temporary test token was revoked afterward. Zero operational data mutations;
  this check did not save a demo draft or run a population job. Evidence:
  `/tmp/pd-mcp-real-auth.log`.
- The owned temporary Redis was stopped/removed after testing. No PH/PP stacks
  were replaced, and no release, commit or push was performed. Client registration
  in a particular agent host and its credential store remain client setup;
  successful endpoint tests do not claim automatic MCP OAuth discovery.

## Population pacing: 2026-10-23

- 171 Java tests pass without failures/errors/skips against the explicitly
  isolated Redis on 16385. Tests cover delay after completion, zero delay,
  hourly/daily rates, slow iterations without catch-up debt, input rejection
  before effects, no final wait, immediate Stop during days-long waiting,
  successful-publication rate accounting and frozen terminal observations.
- 127 frontend tests and the production build pass. Operator controls and JSON
  share one recipe; imports preserve explicit pacing/count, invalid or missing
  pacing fails without a default, cleared numeric inputs remain editable, and
  active-job controls are locked. Rates/durations use readable display units.
- `tests/workspace.browser.cjs` includes the isolated real-runner pacing check
  in `tests/support/population-pacing.cjs`. The browser submits delay/rate jobs
  through the app API to a local synthetic HTTP server and isolated Redis:
  seven requests total, measured 200 ms post-iteration delay, 20/s attempted
  rate with 350 ms responses and only one request in flight, immediate Stop
  during a two-day delay, published/achieved counts and frozen final rate.
  Desktop/mobile screenshots were inspected; zero browser errors. Identity in
  this fixture is synthetic, not evidence of PH SSO.
- Local image `sha256:659af59418c974dd3bc1076f0c58d5626e318a5ac0f9ec9dbd84a1192128e31f`
  is deployed on port 8785 with the same inventory volume and PH Redis/auth.
  Docker runs 127 frontend and 168 Java tests, with three isolated-Redis tests
  explicitly skipped (all passed separately above). No active inventory writer
  was present before replacement. No release, push or operational population.
- A separate browser check on the deployed app passes real PH device login,
  operator-control access and the 3/hour confirmation, then cancels without
  starting. Non-session write requests were blocked by the test and none were
  attempted. No payment/SUT calls or operational record changes.
- Evidence: `/tmp/pd-pacing-java-full.log`, `/tmp/pd-pacing-frontend.log`,
  `/tmp/pd-pacing-image.log`, `/tmp/pd-pacing-browser.log`,
  `/tmp/pd-workspace-ui-14LM7k/result.json`, `/tmp/pd-pacing-deployed.png`.
  The owned ephemeral Redis was removed after testing. No documentation tests.

## DataSet workspace: 2026-10-22

- 78 frontend tests, TypeScript and production build pass. 146 Java tests pass
  with zero failures/errors/skips, including all three Redis tests against an
  isolated ephemeral Redis on 16385. Edits preserve live records and reject
  stale/external metadata changes; competing edits produce one success and one
  conflict. Namespace/field/list restrictions and unauthenticated denial pass.
- `tests/workspace.browser.cjs` passes against the built Java application with
  its own temporary catalogue/CSV directory and synthetic identity fixture:
  visible Selected SUT below the header, table/details, row-based editors,
  full Redis keys, CSV import/download, persisted context on reload, stale-edit
  error without lost draft, anonymous denial and desktop/mobile layouts. There
  are no browser errors. Screenshots inspected manually.
- The existing population browser regression also passes with intercepted
  synthetic APIs: exact selected target, explicit Run/Stop, scoped inventory,
  permission loss, readonly access and mobile layout. Java tests exercise the
  unchanged shared JSON/SOAP template/request behavior separately.
- These checks do not prove PH SSO or a real payment-system call. PH Auth and
  its working Redis were stopped; they were not restarted or replaced. The
  running PocketData container and its operational volume were not changed
  during those isolated checks. The subsequent local deployment is recorded
  separately below; no image or release was published.
- Evidence: `/tmp/pd-flow-frontend.log`, `/tmp/pd-flow-java.log`,
  `/tmp/pd-flow-workspace.log`, `/tmp/pd-workspace-ui-aTd6Zl/result.json` and
  `/tmp/pd-flow-population.log`. Contract/documentation changes were reviewed;
  no documentation tests were added.

### Local workspace deployment: 2026-10-22

- On the user's request, built and started `pocketdata-local:dev` on port 8785.
  Image ID: `sha256:81efb48da80202b36f5653071ef39122858c42caf2e970b5626a23f5736c0104`.
  The build passes 78 frontend tests and 143 Java tests; its three isolated-Redis
  tests are explicitly skipped (all three passed separately above).
- Preserved the existing `pocketdata_pocketdata_inventory` volume and restarted
  the existing PH Redis, auth-service and UI containers without replacing their
  images, configuration or volumes. No scenario/worker stack was started.
  Read-only API checks retain the demo DataSet with three ready records and zero
  returned records; there was no import, population, record read or cleanup.
- The deployed browser shows Selected SUT, the DataSets table and clickable
  details with record-format and full Redis-key tables. No browser console
  errors; application health is healthy. No authenticated edits were attempted.
- Login was initially unavailable with the existing PH 0.15.37 auth-service/UI:
  the device authorization endpoint returns HTTP 403 and PD's device-start API
  reported HTTP 503. That initial check qualified only the read-only workspace.
  The subsequent restoration and real login check are recorded below.
- Docker build evidence: `/tmp/pd-flow-deploy-build.log`. The build context now
  includes only the example environment file, not local `.env` settings.

### PH authentication restored: 2026-10-22

- At the user's request, stopped only the old `pockethive-ui-1` and
  `pockethive-auth-service-1` containers and started the existing
  `pp-ph-integration-auth-service-1` and `pp-ph-integration-ui-1` containers.
  They retain their images, configuration and auth volume. Official ingress is
  `http://localhost:8088`; the auth backend has no published port. Redis, PD,
  PP and operational records were not changed; no swarms were started.
- PD device authorization now returns HTTP 200. A real browser login using the
  existing PH DEV provider confirms access in the PH tab, completes sign-in in
  PD and exposes Edit DataSet. The editor was opened and cancelled without
  saving. A second native PD origin (`127.0.0.1:8785`) reuses the central PH
  login without re-entering identity. No application API mocks or auth bypass.
- Zero browser errors and zero operational writes. This confirms native local
  SSO and editor access, not a new write test or desktop preview-port check.
  Evidence: `/tmp/pd-auth-restart-result.json`,
  `/tmp/pd-authenticated-details.png`, `/tmp/pd-authenticated-editor.png`.

## Persistent demo: 2026-10-20

- The opt-in demo overlay starts a separate pinned mock with an internal network,
  non-root/read-only runtime and a loopback-only admin binding. Existing PH auth,
  Redis and the app inventory volume remain selected; no private Redis is started.
- The self-contained demo image build passes 73 frontend tests and 130 Java tests
  (zero failures/errors, one explicitly gated isolated Redis test skipped).
  Actual image ID:
  `sha256:db57e197a0188cd725fcb628993f00ecd9a28d8f89f4331016cfcc79c893c1df`.
- `tests/demo.browser.cjs` passes on an isolated volume/namespace: authenticated
  setup, preservation of another SUT, repeated setup without new jobs or records,
  actual default UI JSON → SOAP11 → SOAP12 workflow and genuine restart with
  catalogue, inventory and four live records retained. Screenshot inspected;
  owned QA cleanup verified. Evidence: `/tmp/pocketdata-demo-browser/evidence.json`
  and `/tmp/pd-demo-browser.log`.
- Separately, the human explicitly requested installation in the primary local
  app: SUT `pocketdata-demo`, DataSet `cards`, three generated fake records,
  durable CSV and `ready` publication. These requested demo records remain for
  interactive use; they are not the temporary QA namespace and were not cleaned.
  Setup used normal freshly authenticated APIs; other SUTs/data were not replaced.
  Local `.env` retains the explicit demo overlay for subsequent starts.

## Portable templates: 2026-10-20

- A self-contained Docker build verifies the pinned PH artifact checksums,
  passes 72 frontend tests, TypeScript and the production frontend build, and
  runs 130 Java tests with no failures/errors. One explicitly gated isolated
  Redis test is skipped in that build; deployed-ingress tests are separate.
- The shared PH `template-data` module passes 272 tests, including strict
  UTF-8/Unicode, decimal preservation, duplicate/trailing JSON, required
  selectors, XML hardening and SOAP. PH's selected reactor regressions pass;
  eight focused transport tests additionally verify fail-closed admission and
  exact portable request bodies, including empty/whitespace-only content.
- The actual PH HTTP Sequence and PD Population adapters consume the same
  authored JSON/SOAP call resources. Compiler admission, bindings, selectors
  and response interpretation have one shared owner, not paired product parsers.
- The portable-template build was verified on port 8785 with the existing inventory
  volume. Its exact image was
  `sha256:389d3543ec25cb51a6899487de0d2d2355155e817a6215046fdb9f71c680eb2a`.
  The older vulnerability scan below does not qualify this new image.
- A fresh `tests/population.browser.cjs` run against this image passes through
  actual PH auth on official ingress 8089, the React UI and the selected existing
  PH Redis. An unsupported capability in the third step causes zero SUT calls.
  JSON → SOAP11 → SOAP12 produces two durable, published records; HTTP-200 SOAP
  Fault and UI Stop retain audit evidence without retry or partial publication.
  Exactly nine mock requests are observed, with no browser errors.
- A real isolated-container restart changes its native port from 32768 to 32769;
  both CSV outputs survive, central PH login is reused and jobs do not resume.
  Desktop/mobile screenshots were inspected. Only owned test resources are
  removed, and cleanup is verified. Evidence:
  `/tmp/pocketdata-portable-browser/evidence.json`; log:
  `/tmp/pd-portable-browser.log`. This is synthetic local acceptance, not a real
  payment API or the desktop application's private forwarding path.
- `tests/ph-portable-soap.cjs` also passes through official PH ingress 8089:
  validate/publish three owned bundles, CREATE/START, real HTTP Sequence workers,
  input/output taps and exact-run journal evidence. Unchanged authored SOAP11/12
  call fixtures produce correct headers/escaping and extracted strings with
  whitespace/leading zeroes intact; typed extra fields and WorkItem history
  survive. A finite scheduler submits exactly one journey per case. HTTP-200
  Fault makes one request with no retry, subsequent step or output. Auth/cookies
  are absent at the mock SUT. Exact owned cleanup is verified for every case.
  Evidence: `/tmp/ph-portable-soap-runtime.log` and
  `/tmp/pd-ph-soap-1792507045887-1948e483-As5JK6/evidence.json`.

## Earlier cut-over verification: 2026-10-19

The following evidence belongs to the earlier cut-over, not a fresh run of
every check against the new portable-template image.

- Normal Docker image builds from the product directory and declared npm/Maven
  snapshots, without runtime sibling checkouts. The app is healthy on port 8785,
  keeps its inventory volume and connects to the selected PH Redis. No private
  PocketData Redis is started; its old volume remains untouched.
- A clean source build includes the React resource build and backend tests, then
  packages the executable Java application successfully; no pre-existing static
  frontend output is required.
- The current Docker build runs 128 backend tests: zero failures/errors, one
  explicitly gated isolated-Redis test skipped inside the build. Real PH Redis
  circulation is verified separately below; this is not a claim of zero skips.
  Coverage includes strict identity/access checks, namespace/revision validation,
  CSV-before-publication, JSON/SOAP parsing and finite population jobs.
- 66 frontend tests pass; clean npm installation, TypeScript and production build
  pass. npm audit reports zero advisories in this frontend's locked graph.
- The shared browser-auth package has 55 passing tests for interval/slow-down,
  cancellation, expiry, protocol errors, same-origin bearer handling, restoration,
  popup recovery and logout. These do not replace deployed-ingress tests.
- Affected shared JVM/MCP reactor: 350 passing tests (262 MCP, 18 auth-client,
  28 contracts, 42 swarm-model), none skipped. Includes no-redirect behavior,
  body limits, cancellation rather than draining, strict identity decoding and
  owner-auth deadline configuration.
- `tests/ph-device-login.browser.js` passes through the actual app on 8785 and
  official PH ingress on 8089: PH-tab login, original-window completion, active
  admin controls, viewer denial, reload restoration, independent tokens, central
  session reuse, revocation and callback-free shared logout. No working catalogue,
  inventory or Redis records are changed by this test.
- `tests/preview-origins.cjs` repeats the real login/viewer/logout checks through
  two actual native loopback proxies with different randomly allocated ports,
  restarting the proxy between runs. Both pass without PH/auth reconfiguration.
  This is not a browser-route interception or the desktop's private proxy.
- `tests/browser-smoke.js` passes against an empty isolated app on 8786, synthetic
  identity fixture and separate Redis: SUT/DataSet creation, CSV publication,
  authenticated download preserving identifiers/extra columns, modal Escape and
  backdrop dismissal, reload and 390px layout.
- `tests/restart.browser.js` passes after restarting that isolated Java process
  with the same synthetic inventory directory: catalogue, saved CSV and one Redis
  record remain. The fixture and test Redis are stopped afterwards.
- Real desktop/mobile screenshots inspected at 1366×768 and 390×844: one 52px
  header, one main region, collapsible shared rail and no document overflow.
- Home landing verified with `tests/home.browser.js`: default route, dedicated
  Redis/PH Auth configuration cards, refresh, all three workspace shortcuts,
  header-logo return, contextual Home highlighting and no status duplication on
  editing views. Desktop/mobile screenshots inspected; no operational mutations.
- The full Home logo includes “simple test data” aligned under the complete
  PocketData wordmark. The compact header logo remains subtitle-free; the asset
  selection and alignment are covered by the frontend tests.
- Full and compact PD/PP assets were compared with HiveForge in one browser:
  full marks are 182 SVG units high, names use 76px type with the same family
  anchors and a 34-unit subtitle offset. Text fitting changes spacing, not glyph
  width. The PD landing passes desktop/mobile checks; PP's five branding tests
  and rendered asset/header previews pass without starting a Planner writer.

## Boundaries and pending acceptance

The real desktop application's private preview-forwarding/restart path has not
been independently exercised; native localhost is verified. The protocol has no
app return URI, and no preview port is configured in PocketData/PH device auth.
This removes callback-port coupling but is not evidence of every desktop proxy.

`tests/ph-redis-circulation.cjs` verifies a real synthetic Executor against the
selected existing PH Redis DB0. An isolated PocketData instance publishes three
CSV rows live while the PH generator waits on its empty pool. The actual PH
generator/request-builder/processor/postprocessor completes three HTTP 200 calls
against local WireMock and returns the records to the intended output list.
Leading zeroes and extra fields survive. Only uniquely owned keys, scenario,
swarm, tap and test volume are removed; no shared restart or operational data
copy/cleanup is performed. Evidence is written to a private temporary directory.
This is not a payment-SUT test, large-scale load or 24-hour qualification.

`tests/population.browser.cjs` exercises the real shared PH login, actual React
Population view, JSON account creation followed by SOAP 1.1 and SOAP 1.2 card
creation, durable CSV and publication into an owned namespace on that same PH
Redis. HTTP-200 SOAP Fault and UI Stop retain response evidence without automatic
retries or partial-record publication. Restart on a changed native application
port preserves both CSVs and reuses PH confirmation without entering credentials;
no job automatically resumes. The accompanying exact-run PP journal check is
reported independently in the generated evidence, not inferred from PD success.

`tests/family-auth.browser.cjs` also proves native PP recreation on a changed
port with the same SQLite volume/revision and central PH login reuse. A fresh
owned mock-targeted PH run returns journal HTTP 200 with 12 retained events both
before and after that PP restart. The old PP-linked historical run returns 404,
not a successful data read. A fresh link to the isolated QA catalogue is correctly
rejected with 409 because PH's master remains the primary PP; the test does not
rewrite that configuration or import fixtures into the primary. Thus fresh linked
PP-click → journal-data acceptance remains distinct from the proven auth,
restart and direct fresh-journal reads. All owned test resources are removed.

SOAP tests cover namespaces, faults, ambiguous/missing results, XXE/DTD/XInclude,
HTTP bounds, redirect/retry rejection, total deadlines, preflight before side
effects, CSV durability and protected downloads. Actual bank WSDL/request bodies,
credentials and payment-system behavior are not supplied or qualified here.

Dependency and image scans, including residual Spring and OS findings, are
documented in [the security review](SECURITY_REVIEW.md). A passing functional
build does not mean a vulnerability-free image.

Live PH Scenario/DataSet selection, tracking and generic Groovy/sequence execution
remain deferred. Local PH uses its existing DEV provider; production identity
provider deployment and remote HiveForge deployment are not tested here.

PocketPlanner's local implementation is now Java/React with its own SQLite
writer. No automatic operational-plan conversion or published release is implied.
