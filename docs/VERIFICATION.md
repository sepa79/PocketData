# Local verification

Latest source/image checks: 2026-10-20. Local only; no release, GitHub
publication, operational data export or lab deployment.

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
