# Scripted population

PocketData runs finite sequences of PH HTTP templates in its own process. JSON
and SOAP 1.1/1.2 responses can supply fields to later steps. This is a small
resource-creation helper, not another swarm engine, arbitrary Groovy/JavaScript,
WSDL generator or replacement for PH Providers.

## Run and inspect

Select a SUT, one of its DataSets and an existing target list. Open **Population**,
load/edit JSON and explicitly confirm Run. Active PH local-admin is required for
start, status, stop and raw response downloads. PH tokens never reach the SUT.

One job runs per process, with 1–1000 iterations and 1–20 named steps. Each
iteration starts with a fresh copy of `values`; extracted fields are added to the
record for later requests. Extra fields and leading-zero string IDs survive.
Invalid fields, references, selectors and missing required output columns fail
preflight. The synthetic authored example is
`frontend/src/data/population-example.json`; adapt it to your actual API.
For a complete synthetic SOAP envelope, load
[`examples/population-soap.json`](../examples/population-soap.json). It expects a
SUT endpoint named `cards` with its service path and a DataSet requiring the
returned `cardNumber`; replace the example operation, action, namespaces and
values to match the actual service. It is not an actual bank request.

## Request and response contract

The shared PH contract is `docs/contracts/portable-http-templates.md` in the
selected PH source. Pinned template-data, request-templates and templating
artifacts own decoding, JSON Pointer/XPath, SOAP, admission and rendering. PD
only binds product values and maps errors; no local reader/parser is retained.

A recipe has exactly `name`, `count`, `values`, `params`, `steps`. Each step has
`name`, a SUT `endpoint` key and `call`. That call is independently portable:
`profile: "portable-v1"`, explicit `requires`, `request`, `response`. The request
is the canonical PH HTTP definition. Response declares `kind` (JSON/SOAP11/SOAP12),
`soapAction`, `expectedStatus`, `extract`, `namespaces`. The same call is a PH HTTP
Sequence template file without PD loop, SUT name, CSV path or Redis binding.
There is no automatic old-format conversion.

Portable context has only `record`, `params` and `endpoint.path`. Record starts
from values; params stays independent. PD owns reserved `params.iteration`, a
one-based decimal string; authored params must not overwrite it. endpoint.path
includes the selected endpoint path/query. String identifiers retain their type.
No payload/vars aliases or guessed responseAsXML are injected into this profile;
existing PH native contexts remain separate and retain their interfaces.

Use explicit json_path, xml_path, json_string, xml_text and xml_attr functions and
declare them in requires. json_string produces a complete quoted JSON string;
do not put extra quotes around it. XML helpers validate/escape text/attributes.
Missing/null required values are errors, not empty data. The real Pebble compiler
admits text/output expressions, properties, declared functions and literal/map/
array arguments. Loops, conditionals, filters, operators, Java methods, imports,
eval/SpEL/sequence are not portable-v1. No source/token scanner or trial execution
guesses support. Product iteration remains outside the renderer.

Unsupported profiles/capabilities/syntax in any step fail before files or SUT
requests; dynamic later-step values are checked before send. Fixed-origin paths/
headers and 64 KiB text/output bounds belong to the shared renderer. authRef and
resultRules are explicitly unsupported. Credentials must be authored explicitly;
PH bearer tokens are never forwarded.

- JSON uses RFC 6901 pointers and requires non-null scalar results.
- SOAP uses explicit XML body templates. SOAP11 adds `text/xml` and quoted
  SOAPAction; SOAP12 adds `application/soap+xml` with action parameter. Those
  headers belong to the response kind/soapAction, not headersTemplate.
- SOAP uses namespace-aware XPath, with automatic reserved `soap` prefix and
  explicit other namespaces. Exactly one node is required. Wrong envelopes,
  versions, Faults (including HTTP 200 Faults), ambiguous/missing results, DTD,
  external entities and XInclude fail safely.
  XML depth is capped at 256 elements before XPath traversal.
- UTF-8 responses are bounded to one MiB. HTTP uses normal TLS validation, no
  redirects/retries, three-second connect/admission and five-second idle bounds,
  plus a ten-second total cancellation deadline.
  There is no automatic cookie jar or authentication cache across jobs/SUTs.

References: [SOAP 1.1](https://www.w3.org/TR/SOAP/),
[SOAP 1.2](https://www.w3.org/TR/soap12/),
[Java XML security](https://docs.oracle.com/en/java/javase/21/security/java-api-xml-processing-jaxp-security-guide.html).

## Durable output and failure

CsvInventory creates two bounded CSV files with the same job/inventory ID:

1. `/data/population/<sut>/<dataset>/<id>.csv`: each complete response (iteration,
   step, HTTP status, body), fsynced before extraction or another request. Earlier
   confirmed resource creation remains inspectable if a later step fails.
   Missing/timeout replies are marked unknown, never retried or guessed successful.
2. `/data/inventory/<sut>/<dataset>/<id>.csv`: only complete, validated DataSet
   records. Each row is fsynced before the existing Redis owner publishes it.

Both files have a 25 MiB limit and may contain sensitive values. Downloads are
editor-only and return 409 while the writer is active, avoiding half-written rows.
Terminal success is reported after writers close. Completed counts durable valid
records; published counts acknowledged Redis pushes, not exactly-once delivery.
Treat CSV as data, not trusted spreadsheet formulas.

Any request/extraction/schema/disk/Redis failure stops the loop. Created resources
are not rolled back. Inspect response CSV and the SUT before repeating: timeout
can hide successful creation/publication. No automatic retry/resume, checkout,
partial-record repair or deduplication is introduced. Format metadata is rechecked
between iterations and before publication.

Stop finishes the current bounded request and saves its response; later steps
and iterations do not start. A fully completed record may still reach CSV/Redis.
There is no rollback of in-flight external side effects.

Job state lives in process, with at most 20 recent jobs. Restart never resumes or
infers completion. CSV survives; raw response CSV can be downloaded by known ID
after restart. Repopulation uses explicit inventory/producer knowledge, not
repeated SUT creation. Large-scale/24-hour production belongs to PH Providers.

## Local acceptance

The Docker build runs the Java population/transport/XML/access tests and frontend
tests before packaging. `tests/population.browser.cjs` runs actual UI Run/Stop,
JSON → SOAP11 → SOAP12, HTTP-200 Fault, protected CSV downloads and a genuine
application restart on a dynamically allocated port. It uses the existing PH
auth/Redis but creates only uniquely owned synthetic data and a local mock API.

For this local environment, provide all selections explicitly:

```sh
POCKETDATA_TEST_PLAYWRIGHT=/absolute/path/to/node_modules/playwright \
POCKETDATA_ACCEPTANCE_REDIS_CONTAINER=pockethive-redis-1 \
POCKETDATA_ACCEPTANCE_REDIS_NETWORK=pockethive \
POCKETDATA_ACCEPTANCE_PH_NETWORK=pp-ph-integration \
POCKETDATA_ACCEPTANCE_IMAGE=pocketdata-local:dev \
POCKETDATA_TEST_ARTIFACTS=/tmp/pocketdata-population-browser \
node tests/population.browser.cjs
```

The test requires Docker access, Chrome at `/opt/google/chrome/chrome`, native PP
on 8765 for a read-only initial sign-in, PH on 8089 and its existing local DEV
provider. It refuses unexpected Redis/network identities, never copies a working
catalogue/inventory, and removes only its own container, volume and three keys.
Do not adapt it into a production endpoint test without a separate authorization.

The complementary `tests/ph-portable-soap.cjs` uses the same authored call files
in real PH HTTP Sequence workers, not a simulated runner. It publishes only
owned synthetic scenarios against its local mock, submits one journey per case,
checks SOAP11/12 extraction and HTTP-200 Fault/no-retry through taps/journal,
then removes its exact scenarios, swarms and taps. Select the approved local
environment explicitly:

```sh
POCKETDATA_ACCEPTANCE_PH_ORIGIN=http://localhost:8089 \
POCKETDATA_ACCEPTANCE_AUTH_USER=local-admin \
POCKETDATA_ACCEPTANCE_PH_NETWORK=pp-ph-integration \
POCKETDATA_ACCEPTANCE_PH_SOURCE=/home/sepa/PocketHive-ph-ui \
node tests/ph-portable-soap.cjs
```

This requires the selected local PH stack and rebuilt worker images. It does not
start/rebuild the stack or bypass ingress with direct backend ports. Evidence is
written to a unique temporary directory; working plan and DataSet data are not
read, exported or replaced.

`tests/family-auth.browser.cjs` separately checks PP recreation/SSO and journals.
Set `POCKETDATA_TEST_PLAYWRIGHT`, absolute `PD_FAMILY_AUTH_ARTIFACTS`, and explicitly
opt in with `PD_FAMILY_AUTH_CREATE_SWARM=yes` for a fresh mock-targeted PH run.
It reports a gap rather than passing if the stored PP-linked journal is missing;
direct fresh journal HTTP 200 does not hide that gap. It never changes PH's
configured Planner master or imports into the primary plan database.

## API

All routes require fresh editor authorization:

- `POST /api/suts/{sut}/datasets/{dataset}/population?list={list}`: recipe JSON,
  HTTP 202 snapshot.
- `GET .../population/{id}`: exact in-process job snapshot.
- `POST .../population/{id}/stop`: request stop.
- `GET .../population/{id}/responses`: protected response CSV.

Snapshot fields: id, status, total, completed, published, iteration, step, error,
inventoryId. Status: RUNNING, STOPPING, STOPPED, SUCCEEDED, FAILED. A second active
job returns 409; unknown/cross-DataSet jobs return 404. Existing body owner limits
recipe JSON to one MiB.
