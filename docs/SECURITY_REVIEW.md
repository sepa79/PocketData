# Local dependency and image review

Date: 2026-10-23. Local release preparation, not a security certification.

This qualifies the exact 0.1.0 image below, not the running dev image. Functional
and artifact evidence is in RELEASE_VERIFICATION.md. No clean-scan claim,
suppression, runtime replacement or publication is implied.

## Remediation and checks

The current Java 21 / Boot 3.5.16 build pins Jackson BOM 2.21.7, Tomcat 10.1.60,
HttpClient 5.6.3 / HttpCore 5.4.3, Netty BOM 4.1.137.Final and Log4j BOM 2.25.5.
The non-root runtime has refreshed OS packages. The locked npm graph reports zero
advisories after updating Vitest to 4.1.12. No scanner suppression or untested
major framework switch was added.

Population reuses actual PH parser/renderer artifacts. Fresh PH editor checks
guard creation, job observation, Stop and raw inventory. PH bearer tokens never
reach SUTs. The transport rejects redirects, disables automatic retries and cookie
sharing, bounds response size and cancels at a total deadline. SOAP parsing blocks
DTD, entities, XInclude and external resolution, caps XML depth at 256, and rejects
faults even with HTTP 200.
There is no arbitrary script engine. CSV outputs may contain sensitive values
and spreadsheet formulas: treat downloads as data, not trusted spreadsheets.

## Exact image scan

Trivy 0.76.0 uses the vulnerability and Java databases downloaded on 2026-10-23,
reused from the same day's PP scan. Vulnerability metadata was updated at
13:13 UTC. It scanned the exact image:

- Image: `pocketdata-local:0.1.0`
- ID: `sha256:a97724aa692260966430047387a91085e18558e7e331e35cd1b5d848322f75dd`
- Java findings: 2 scanner-rated Critical, 0 High.
- Ubuntu 22.04 package findings: 0 Critical/High, 27 Medium, 16 Low.
- Local report: `/tmp/pd-release-0.1.0-20261023/image-scan.json`.

Both Java entries concern `spring-webmvc` 6.2.19:

- [CVE-2026-47884](https://spring.io/security/cve-2026-47884/) is rated Medium by
  Spring and requires XsltView with implicit view rendering through a catch-all
  mapping. PocketData configures no XsltView or MVC view rendering: it serves a
  static React application and explicit API responses.
- [CVE-2026-47890](https://spring.io/security/cve-2026-47890/) is rated Low by
  Spring and requires view fragments over SSE. PocketData renders no MVC view
  fragments; the MCP SDK streaming transport is not MVC view-fragment rendering.

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
