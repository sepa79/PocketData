# Local dependency and image review

Date: 2026-10-19. Local-only, not a release or security certification.

2026-10-20 qualification boundary: `pocketdata-local:dev` now points to the
local-demo/template image
`sha256:db57e197a0188cd725fcb628993f00ecd9a28d8f89f4331016cfcc79c893c1df`.
Functional tests are current in `VERIFICATION.md`; the exact-image scan in this
document remains the 2026-10-19 result, not a scan of the moved tag. A fresh scan
attempt could not run because the previously used local Trivy binary was absent.
No clean-scan claim or scanner suppression is implied.

## Remediation and checks

The current Java 21 / Boot 3.5.16 build pins Jackson BOM 2.21.7, Tomcat 10.1.60,
HttpClient 5.6.3 / HttpCore 5.4.3, Netty BOM 4.1.137.Final and Log4j BOM 2.25.5.
The non-root runtime has refreshed OS packages. The locked npm graph reports zero
advisories. No scanner suppression or untested major framework switch was added.

Population reuses actual PH parser/renderer artifacts. Fresh PH editor checks
guard creation, job observation, Stop and raw inventory. PH bearer tokens never
reach SUTs. The transport rejects redirects, disables automatic retries and cookie
sharing, bounds response size and cancels at a total deadline. SOAP parsing blocks
DTD, entities, XInclude and external resolution, caps XML depth at 256, and rejects
faults even with HTTP 200.
There is no arbitrary script engine. CSV outputs may contain sensitive values
and spreadsheet formulas: treat downloads as data, not trusted spreadsheets.

## Exact image scan

Trivy 0.76.0 with its 2026-10-19 database scanned the actual image:

- Image: `pocketdata-local:dev`
- ID: `sha256:7c74aff779261daba9828b9ac9096dc1aec7d6477f864094a87421e548c85350`
- Java findings: 2 scanner-rated Critical, 0 High.
- Ubuntu 22.04 package findings: 0 Critical/High, 27 Medium, 32 Low.
- Local report: `/tmp/pocket-family-security-review/pd-final-image.json`.

Both Java entries concern `spring-webmvc` 6.2.19:

- [CVE-2026-47884](https://spring.io/security/cve-2026-47884/) is rated Medium by
  Spring and requires XsltView with implicit view rendering through a catch-all
  mapping. PocketData configures no XsltView or MVC view rendering: it serves a
  static React application and explicit API responses.
- [CVE-2026-47890](https://spring.io/security/cve-2026-47890/) is rated Low by
  Spring and requires view fragments over SSE. PocketData uses neither.

The documented vulnerable features are absent in the reviewed configuration;
that is an applicability assessment, not a patched-dependency or clean-scan claim.
Upstream fixes are OSS 7.0.9 or enterprise-only 6.2.20. A Spring 7 / Boot 4 upgrade
needs its own compatibility/test gate. Reassess if these features are added.
OS Medium/Low findings remain open; no blanket waiver is recorded.

## Boundaries

Tests use synthetic data and local mock resource APIs. Real bank requests, WSDLs,
credentials, 24-hour/large-scale load and production identity infrastructure are
not qualified. The scan is not an independent audit of all JRE code or a guarantee
of no vulnerabilities. No operational inventory was copied or replaced, shared
Redis flushed, external deployment or release performed.
