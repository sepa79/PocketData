# PocketData 0.1.0 release preparation

Date: 2026-10-23. This records local qualification before publication; at that
stage no commit, tag, push or GHCR publication had occurred. Check GitHub Actions
for subsequent publication status. Working PD/PP/PH containers and operational
data were not replaced; publication does not deploy an upgrade.

## Exact artifacts

| Artifact | Identity |
| --- | --- |
| VERSION / local image | 0.1.0 / pocketdata-local:0.1.0 (linux/amd64) |
| Image ID | sha256:a97724aa692260966430047387a91085e18558e7e331e35cd1b5d848322f75dd |
| Runtime config | sha256:a3c1548423f32637a7c8c91fc88dbdbf64ce8bdd559735e234a6f0822c420825 |
| JAR SHA-256 | b23a2278798da01fe561835f8aba5ed4ee9dcd41ac9fdccb87dd5bac3a8d3011 |
| LICENSE SHA-256 | 3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986 |

The image embeds VERSION 0.1.0, /app/LICENSE and a matching OCI version label.
The extracted JAR is /tmp/pd-release-0.1.0-20261023/pocketdata-0.1.0.jar.
Initial packaging refreshed base images and OS packages; local image metadata
is explicitly derived from the authoritative version:

```sh
docker build --pull --label org.opencontainers.image.version="$(cat VERSION)" \
  -t pocketdata-local:0.1.0 .
```

## Passed checks

- 129 frontend tests and TypeScript/Vite production build.
- 178 Java tests, zero failures/errors/skips, with the explicitly isolated
  Redis on 16385. Docker independently passes 175 Java tests; three
  Redis-gated tests are skipped in Docker and pass in the isolated run.
- Vitest 4.1.12; npm audit reports zero advisories.
- Vendored JVM checksums and locked npm inputs; no sibling PH checkout required.
- Workflow YAML/shell validation, branch/tag image selection and rejection of
  mismatched/development release tags. Compose selects the explicit image.
- GPL-3.0-or-later matches PH. PD already had identical license text. PP's
  missing license and Maven/npm/README declarations were added locally;
  PP Maven validation and 219 frontend tests pass without a version/tag change.

Workspace browser tests use synthetic identity, a temporary catalogue/CSV
directory and isolated Redis. Table/details/edit, stale conflicts, readonly
access, CSV, MCP discovery/draft without effects, explicit Run, delay/rate/Stop,
desktop/mobile and zero browser errors pass. Evidence:
 /tmp/pd-release-0.1.0-20261023/workspace-browser.log and
 /tmp/pd-workspace-ui-NK18es/.

The exact final image separately passes real PH device login via existing
official local ingress 8088 and central SSO reuse from PP. The existing
population acceptance runner was copied into the evidence directory with
explicit isolated-resource guards: an owned Redis/network and empty labelled
volume replace its usual shared Redis fixture. No product/auth checks were
bypassed. Nine synthetic requests target a local mock only:
- JSON → SOAP11 → SOAP12 via actual UI Run; durable CSV and two complete records.
- Invalid later capability rejected before SUT requests.
- HTTP-200 SOAP Fault: stop without retry/partial publication; retain evidence.
- UI Stop: retain in-flight evidence without another resource request.
- Actual container restart: preserve catalogue/CSV/Redis, no resumed jobs.
- Native port 32828 → 32830: PH SSO still works without auth reconfiguration.
- Desktop/mobile screenshots inspected; zero page errors.

Final artifact evidence:
 /tmp/pd-release-0.1.0-20261023/population-browser-final/evidence.json.
Earlier pre-final-label results remain separate. The test removes exact owned
app containers, volumes and namespace; the isolated Redis/network are then
removed. Operational inventory/Redis, worker stacks and auth configuration are
untouched. No payment-system requests or operational data exports.

## Remaining boundaries

SECURITY_REVIEW.md records the exact image scan: two known Spring MVC findings
remain with conditional applicability reviewed; no suppression/clean-scan claim.
No arbitrary Groovy, tracking, automatic recovery, global PH SUT picker or
multi-replica inventory owner is added.

CI was prepared but not yet run during local qualification. ARM64 image build and first
anonymous GHCR pull remain publication gates; package visibility may need the
owner's one-time Public setting. Private desktop preview forwarding is not
qualified by the native-port test. See RELEASING.md for publication/deployment.
