# Redis and CSV contract

## Selected PH Redis

Live DataSet lists and format metadata belong to the Redis used by the selected
PocketHive environment, not a private PocketData instance. `POCKETDATA_REDIS_URL`
explicitly selects its endpoint and logical database; Compose has no default and
does not provide a Redis service or Redis volume. Connection/network selection and
the local instance identity are documented in [Redis deployment](REDIS.md).

PocketData does not own Redis recovery, persistence settings or PH list consumers.
`RedisDatasets` remains the single PocketData connection/list-operation owner;
changing the endpoint adds no connection fallback or second metadata catalogue.
The single application writer still owns the SUT catalogue and durable CSV volume.
Removing the old service definition does not move data or delete its old volume.

## Names

The first PocketData convention is `<sut>:<dataset>:data:<list>` for reusable record lists and `<sut>:<dataset>:meta:format` for one JSON format definition. Namespace components use 1–64 lowercase letters, digits, underscore or hyphen. Metadata is never inserted as a card/account row.

Format definition:

```json
{"sutId":"lab","name":"example","description":"Synthetic example","fields":[{"name":"accountNumber","type":"string","required":true}],"lists":["ready"]}
```

External scripts may create the same metadata/list keys without calling PocketData. The manager discovers format keys with SCAN, not KEYS or record downloads. Empty data lists remain describable through format metadata. First-version listing is limited to 200 DataSets per SUT, explicitly reported rather than silently truncated.

Supported field types: string, integer, number, boolean. Required means a CSV column must be present. Extra columns survive unchanged; string identifiers retain leading zeroes. Scenarios can later require subsets, but PocketData does not yet provide a Scenario compatibility picker. No magic renaming or automatic schema inference.

## CSV import

UTF-8 with optional BOM, comma-separated, normal quoted cells, unique named headers; maximum 25 MiB and 200 columns per import. Processing is streamed. CSV stays data, never executable instructions. Imported CSV can contain sensitive card/account values; inventory endpoints are editor-only. Treat downloaded CSV as data, not a trusted spreadsheet formula source.

Validation completes before publication. A CSV copy is fsynced and atomically placed under `/data/inventory/<sut>/<dataset>/<uuid>.csv` before any Redis RPUSH. Saved inventory is independent of Redis. Import does not create real accounts/cards in the target system, clear existing lists or automatically repopulate them.

Redis publication is not an atomic whole-file operation. A timeout may leave some rows published or a last write uncertain. The API reports the saved inventory identity and acknowledged progress; it never retries or resumes automatically. Inspect before repeating an import. A process crash does not prove that the CSV was never published. Initial scope has no duplicate-record guarantee, import ledger or exactly-once semantics.

Metadata creation uses SET NX; this version deliberately does not edit an existing format or delete a DataSet. No operational keys are cleared by the application. Operator recovery remains stop affected work, clean queues, clear the intended namespace, restore format/data from inventory, then resume. Refill does not repeat SUT creation.

Inventory listing is limited to 500 files per DataSet with an explicit error above that limit, never an unlabelled truncated result.

## Deferred

Per-swarm observations, producer labels, CSV-to-PH binding and optional recordId
tracking remain planned. Bounded template-driven HTTP/SOAP creation is implemented
separately in [POPULATION.md](POPULATION.md), with response evidence and validated
CSV before Redis publication. It is not implied by CSV import. No checkout, lease
or automatic record recovery exists.
