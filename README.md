# PocketData

Small SUT and Redis DataSet manager in the PocketHive family. PocketData manages definitions and preparation; PocketHive runs the load; PocketPlanner owns the plan. Live records use the selected PH Redis, not a private PocketData database.

## Local working version

- Compact Hive-styled SUT → DataSet → CSV inventory views, with version in the header.
- Home landing page with workspace shortcuts and dedicated Redis/PH Auth configuration cards, separate from editing screens.
- Persistent, revision-protected SUT catalogue; dataset format metadata stored in Redis.
- Common field types, required subsets and preservation of extra CSV columns.
- UTF-8 CSV validation and durable inventory save **before** Redis publication. No auto-retry, clearing or repopulation.
- PocketHive identity checks on every mutation; anonymous view-only. Raw inventory is local-admin only.
- Shared React/TypeScript UI base imported from PH, not copied styles; one shared browser/JVM auth integration.
- PocketHive sign-in confirmed in a PH tab, then completed in the original PocketData window. No PocketData callback or preview-port registration.
- Bounded scripted population using actual PH request templates: JSON, SOAP 1.1/1.2, response-to-record mappings, explicit Run/Stop and durable response/record CSV before Redis publication.

There is no Groovy/arbitrary-code engine, checkout state, per-record tracking or
automatic retry/resume. For finite account/card creation, use **Population** with
an explicit SUT endpoint and an authored JSON recipe. The actual PH parser and
renderer are reused; there is no second template language or swarm runtime.
See [scripted HTTP/SOAP population](docs/POPULATION.md) for bounds, examples and
uncertain-result handling. Large-scale/24-hour production remains in PH Providers.

For a ready-to-use local SUT, DataSet and JSON → SOAP11 → SOAP12 flow, see the
opt-in [persistent demo](docs/DEMO.md). Its local mock and synthetic inventory
remain available after restart; normal installations are not populated implicitly.

## Run in Docker

```sh
cp .env.example .env
docker compose up --build -d
```

Open http://localhost:8785 directly or its current browser preview. The React UI is built into the Java backend; Node is only a build dependency. PocketData starts only its own app and inventory volume, never a private Redis. Records are published only by explicit CSV import or population jobs. See [PH Redis setup](docs/REDIS.md).

Configure `POCKETHIVE_AUTH_BASE_URL`, the exact PH `POCKETDATA_REDIS_URL` and their explicit Docker networks. Compose fails for a missing/empty Redis endpoint. There is no runtime switch to another server after failure. Redis credentials stay on the backend and are not returned in the API.

Choose **Sign in**, then confirm in PH's tab; its existing DEV provider offers `local-admin` for editing and `local-viewer` for read-only use. The original page does not navigate away. Local `.env` selects the explicit PH network overlay. Preview ports do not appear in auth configuration; see [auth setup](docs/AUTH.md).

PocketData owns only `pocketdata_inventory` (SUT definitions and CSV). The selected PH environment owns Redis persistence. The old private PocketData Redis was stopped; its volume was neither deleted nor copied. Do not use `docker compose down -v` for upgrades.

## Run from source

Java 21, Maven and Node 22.12+ are required. Shared npm archives/lockfiles and
`vendor/maven` are explicit local build inputs, not published dependencies:

```sh
mvn -B -ntp clean verify
POCKETDATA_DATA_DIR=./data POCKETDATA_REDIS_URL=redis://localhost:6379/0 java -jar target/pocketdata.jar
```

Maven builds the frontend as part of resource generation. Docker builds it in a
separate Node stage. To deliberately refresh shared snapshots, use
`bash scripts/refresh-shared-auth.sh /path/to/PH` and the frontend's documented
`npm run refresh:shared` command; retain archive checksums and lockfiles together.
No sibling checkout is needed to run or build an already prepared product.

The process runs without auth/Redis configuration for read-only empty-catalogue inspection; edits fail closed and Redis-dependent views explicitly report unavailable configuration. No local login bypass exists.

## Verification

`mvn test` runs unit/auth/HTTP regressions. `RedisAndCsvTest` only enables against an explicitly selected isolated Redis at `redis://127.0.0.1:16385/0`, via `POCKETDATA_TEST_REDIS_URL`; it does not use the application Redis URL. No operational data is copied for tests.

`tests/browser-smoke.js` is a Playwright function for an empty, isolated app at port 8786. `tests/auth-fixture.py` supplies synthetic identity only when explicitly opted into with `POCKETDATA_QA_AUTH_FIXTURE=1`; never configure the working app against it. The browser check covers view-only/editor access, SUT/DataSet creation, CSV import, inventory and desktop/mobile layout. It is not evidence of real PH sign-in.

`tests/ph-device-login.browser.js` verifies real PH-tab confirmation, original-window polling, session restoration, independent tokens, central SSO reuse, viewer denial and token revocation. It never creates SUTs or publishes records. `tests/restart.browser.js` verifies the synthetic inventory after restarting the isolated test app. These browser functions accept a Playwright page; the local PH official ingress is port 8088, not a backend service port. Native-origin checks do not claim that the desktop's private preview forwarding/restart was exercised.

`tests/preview-origins.cjs` runs the real sign-in check through two successive
native loopback proxies with randomly allocated ports. Set
`POCKETDATA_TEST_PLAYWRIGHT` to the explicit installed Playwright module path.
This verifies port independence without changing PH configuration, not the
desktop application's private forwarding implementation.

`tests/ph-redis-circulation.cjs` verifies a uniquely owned synthetic workload on
the existing PH Redis and real PH workers against local WireMock.
`tests/population.browser.cjs` exercises finite JSON/SOAP creation, failures,
Stop, CSV persistence and shared sign-in. They require explicit local container,
network/image and Playwright settings; see [verification](docs/VERIFICATION.md)
for scope and [security review](docs/SECURITY_REVIEW.md) for residual findings.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [PocketHive auth and registration](docs/AUTH.md)
- [Redis names, records and CSV](docs/DATASET.md)
- [API](docs/API.md)
- [Changelog](CHANGELOG.md)

`VERSION` owns the application version; `-dev` is not a published release. Source is
published at [sepa79/PocketData](https://github.com/sepa79/PocketData). No application
release, GHCR image publication or HF deployment has been performed.

## License

PocketData uses **GPL-3.0-or-later**, the same license as PocketHive. See [LICENSE](LICENSE).
Third-party dependencies retain their own licenses.
