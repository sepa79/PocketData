# Changelog

## Unreleased

## 0.1.0 - 2026-10-23

### Release preparation
- Add GitHub Actions validation with isolated Redis/browser checks and tag-matched multi-platform GHCR publishing. Support an explicitly selected image in Compose and document the release/deployment process.
- Update Vitest to 4.1.12 for development-tool mock-registration advisories; retain GPL-3.0-or-later, matching PocketHive.

### CSV inventory explanation
- Explain in CSV inventory and Population where saved files come from, why they survive restarts and how they can be reused. Distinguish saved snapshots from live Redis records and successful publication.

### Live record inspection
- Link from DataSet Redis lists to the explicitly configured external Redis Commander in a new tab; retain full Redis keys in the table for selecting the correct list.

### MCP population control
- Serve Streamable HTTP MCP on the application listener with public catalogue/format inspection and fresh PH local-admin checks for population tools.
- Add recipe preflight, explicit start/status/list/stop and revision-checked shared drafts. Keep execution, validation, CSV and Redis publication in the existing owners.
- Add Load saved script in Population: an agent's saved draft fills operator controls without running requests. Apply strict body limits and explicit Host/Origin allowlists.

### Population pacing
- Add explicit per-recipe Delay (milliseconds through days, zero means as fast as possible) and Attempted rate (per second/minute/hour/day, best effort). Keep one sequential executor and never queue missed starts.
- Expose iterations and pacing as operator controls, keep JSON under Advanced / Script, and show achieved full-iteration rate and remaining wait. Stop interrupts waiting immediately; no wait follows the last record.
- Require explicit pacing in the current recipe format; preserve shared PH HTTP/SOAP calls, runner-owned iteration counters, durable CSV before Redis and no automatic retries/resume.

### DataSet workspace
- Include the non-secret example environment file in Docker builds while keeping local environment settings excluded.
- Move Selected SUT below the header with a visible label; retain exact SUT/DataSet context through navigation and reload.
- Replace DataSet cards with a table and dedicated details showing record fields, live list counts, full Redis keys and CSV/population actions.
- Replace JSON-only SUT endpoint and DataSet format forms with editable rows, concise field descriptions and detailed help. Show the fixed Redis prefix separately from the list suffix, including import/population targets and confirmation.
- Add authenticated, atomic snapshot-checked DataSet edits for descriptions, new lists and optional fields. Preserve existing definitions and records; reject stale writes and incompatible format changes.
- Link the published PH portable-template contract and Scenario variables documentation; explicitly distinguish population params from variables.yaml. No second template/variable resolver is introduced.

- Adopt the shared Java device client's explicit public transport permission: keep HTTPS/loopback HTTP by default and allow remote HTTP only with `POCKETHIVE_ALLOW_REMOTE_HTTP=true`. Cover device start and central logout through the product session API.

- Establish the public PocketData source repository under GPL-3.0-or-later,
  matching PocketHive. Exclude local environment settings, inventory, credentials
  and build/test artifacts from source publication; no application release.

- Use the standard local PH public ingress/auth port 8088; keep PocketData on 8785.

### Local demo
- Add an explicit persistent Demo SUT/DataSet with a separate loopback-only, pinned local mock. Populate three fake account/card records through the real JSON → SOAP11 → SOAP12 workflow, durable CSV and the selected PH Redis; keep them for interactive use rather than removing them as test fixtures.
- Make the authored default Population example a complete JSON/SOAP sequence. Keep demo definitions outside runtime code and provide an authenticated, append-only setup command that refuses conflicting definitions and does not repeat existing population.

### Shared portable templates
- Adopt portable-v1 shared with PH HTTP Sequence: independent record/params/endpoint bindings, explicit capabilities and identical HTTP/SOAP request/response semantics.
- Transfer JSON/XML readers, JSON Pointer/XPath, escaping and SOAP checks into pinned PH libraries; remove local implementations/custom engine. Retain response audit, CSV-before-Redis, Stop and no automatic retry/resume.
- Add explicit JSON/XML escaping and strict required selection. Admit only the declared portable expression subset through Pebble's compiler AST; reject unsupported later steps before effects. Preserve native PH payload/payloadAsJson interfaces and opaque WorkItem transport.
- Verify the rebuilt image through real PH login and the Population UI: JSON → SOAP11 → SOAP12, rejection before effects, Fault/Stop without retries, durable CSV/Redis and restart on a changed application port. Use only isolated synthetic records.
- Verify the same SOAP11/12 authored call files in actual PH HTTP Sequence workers through official ingress, with typed-field/history preservation, one finite journey and HTTP-200 Fault stopping without retry or further output. Clean only exact owned scenarios, swarms and taps.

### Scripted population
- Add finite, one-job-at-a-time PH-template sequences with JSON and SOAP 1.1/1.2, strict selectors, selected SUT endpoints and explicit Run/Stop. Reuse actual PH parser/renderer artifacts; no arbitrary code, redirects or automatic retries.
- Fsync response evidence before later requests and save validated final CSV before Redis publication. Keep earlier created-resource evidence after faults/timeouts. Downloads wait for writers to close; failure never triggers rollback/resume guesses.
- Bound SOAP response depth and reject XML external resources/Faults; verify response handling, no-retry HTTP deadlines, protected downloads, UI Stop and CSV persistence across a real application restart.
- Verify synthetic PD → existing PH Redis → real PH generator/request-builder/processor/postprocessor circulation against local WireMock, including empty-pool waiting, live CSV additions and extra-field/leading-zero preservation. Clean only exact owned resources.
- Run frontend/Java tests during Docker builds; verify vendored PH checksums and refresh JRE packages without replacing inventory data.
- Update vulnerable Jackson, Tomcat, HTTP client, Netty and Log4j dependencies within the current Java platform. Record residual scanner findings and their conditional applicability in `docs/SECURITY_REVIEW.md`; this is not a clean-scan claim.

### Changed
- Match full-logo mark/text proportions to PH/HF and remove horizontal glyph deformation from full and compact wordmarks. Keep the subtitle aligned under the complete product name.
- Add “simple test data” beneath the full PocketData wordmark on Home, matching the PH/Hive logo layout. Keep the compact header logo subtitle-free.
- Replace the plain JavaScript UI and copied Planner CSS with React/TypeScript/Vite views using the real shared PH shell/theme package; retain compact navigation, permissions, CSV and inventory behavior.
- Replace the bespoke PKCE/HTTP adapter with shared PH JVM identity/device clients and the shared browser-auth hook. Confirm in a PH tab; the original app signs in without a callback or preview-port registration. Add callback-free central sign-out.
- Require the selected PH Redis endpoint and its explicit Docker network; remove the bundled Redis service, default URL, startup dependency and live-record volume definition. Existing private volumes/data are not deleted or copied.

### Added
- Home landing view following PH: full logo, SUT/DataSet/inventory shortcuts and dedicated Redis/PH Auth configuration cards. Home is the default route and reachable from the sidebar or header logo; configuration flags no longer clutter editing toolbars or imply live health.
- PocketData foundation: Java 21 backend, compact shared Hive styling, SUT catalogue, Redis DataSet format metadata and CSV inventory/import.
- PocketHive verified bearer policy with an independent product browser session; local PH device registration is configured.
- Persistent Docker volumes, isolated tests and deployment/auth/data-contract instructions.
- Local shared-PH-network startup profile and real-browser SSO regression: anonymous/viewer restrictions, admin identity, shared PH login and central logout, without mutating DataSet data.

### Not implemented
- General PH sequence/Groovy execution, shared mix controls, record tracking and automated recovery. Finite HTTP/SOAP resource creation and explicit MCP population control are available.
