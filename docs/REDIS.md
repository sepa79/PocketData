# Selected PocketHive Redis

PocketData uses the Redis instance and logical database selected for the PH
environment. It does not start or own a separate Redis. The only PocketData volume
is `pocketdata_inventory`, which holds SUT definitions and durable CSV inventory.
PH owns its Redis deployment and persistence configuration. One PocketData replica
owns the inventory volume; this change does not introduce additional writers.

## Explicit configuration

`POCKETDATA_REDIS_COMMANDER_URL` optionally sets the browser-facing HTTP(S)
address of an existing Redis Commander, for example `http://localhost:8081/`.
DataSet details show **Open Redis Commander** beside the lists; use their full
Redis keys to find records. The link opens a separate tab. Empty disables it;
invalid schemes, credentials, query strings and fragments fail startup.
Configure Commander to inspect the same Redis endpoint and logical database as
PocketData. This URL is a public browser address, not the internal Redis URL or
a Docker service name. It is not inferred from the PocketData preview port.
PocketData neither starts nor proxies Commander, checks its availability nor
passes a PH bearer token to it. Commander's access policy is managed separately;
protect it appropriately for the records it exposes. The link is not an access
control boundary or a new PocketData raw-record API.

`POCKETDATA_REDIS_URL` is the sole connection selector. It is required by Compose:
missing or empty values fail configuration validation. There is no default Redis
host, alternate instance or automatic retry against another server. Existing
backend handling still allows catalogue-only inspection outside Compose without
Redis configuration, but any DataSet operation then fails explicitly with 503.
An explicit URL is configuration, not evidence of successful connectivity.

Use the same Redis endpoint and logical database as the PH Providers/Executors.
Select the actual project-qualified container hostname, or an explicitly managed
unique DNS name; a bare `redis` alias can resolve to an unrelated container when
multiple Docker networks are attached. Do not hard-code container IP addresses.

For the local Docker profile, `COMPOSE_FILE=compose.yaml:compose.ph.yaml` attaches
the app to two explicitly selected external networks:

- `POCKETHIVE_NETWORK_NAME`: the existing PH ingress/auth network, unchanged here.
- `POCKETHIVE_REDIS_NETWORK_NAME`: the existing network of the selected PH Redis.

The networks may refer to the same PH network. No PocketData default network or
private Redis is attached by this profile. Networks must already exist; PocketData
does not create, connect or reconfigure PH services. If using a remote endpoint
instead, base `compose.yaml` can use that reachable endpoint without the local
network profile. Supply the required URL explicitly in either case.

For Redis deployments with ACL/TLS, use the existing PH credentials and trust
requirements, and `rediss://` where required. Do not disable TLS verification or
publish a Redis host port to work around container routing. URLs with credentials
belong only in protected local/deployment configuration, never source control,
browser configuration, reports or shared output from `docker compose config`.

## Local selection, 2026-10-19

Read-only Docker metadata identifies the selected existing PH instance:

| Setting | Value |
| --- | --- |
| Compose project/service | `pockethive` / `redis` |
| Container | `pockethive-redis-1` |
| Existing Redis network | `pockethive` |
| `POCKETDATA_REDIS_URL` | `redis://pockethive-redis-1:6379/0` |
| `POCKETHIVE_REDIS_NETWORK_NAME` | `pockethive` |
| Existing auth network | `pp-ph-integration` (unchanged) |

The selected Redis container is **stopped**. No successful DNS, connection,
authentication, shared-worker visibility or restart-persistence test is claimed.
Only container/network metadata was inspected; no record contents were read.
The existing private `pocketdata-redis-1` container and its volume were left intact;
they are not a fallback and must not be selected by the new configuration.

Changing these files alone does not reconfigure the running PocketData container.
A deployment owner must explicitly start the selected PH Redis through PH's normal
workflow, then apply the PocketData configuration without deleting old volumes or
using `--remove-orphans`. Nothing from the previous Redis is copied or republished.
Authentication configuration and PH services remain outside this Redis change.

## Verification before deployment acceptance

Configuration validation does not require a running Redis or Docker daemon:

```sh
docker compose --env-file .env -f compose.yaml -f compose.ph.yaml config --quiet
mvn -B -ntp -Dtest=RedisComposeConfigurationTest test
```

The configuration tests check the absence of a bundled Redis/service dependency,
the required explicit URL and external networks, and the single inventory volume.
The local tests also render the Compose model and verify missing/empty URL errors;
they never run `up`, `down`, `start`, `stop` or Redis commands.

After an explicitly authorized deployment, verify resolution and connectivity
from the PocketData container to the selected PH Redis, and confirm that PH workers
use the same endpoint/database. Any write-based acceptance test must use a separate
isolated Redis fixture and synthetic records, not operational datasets. Preserve
the existing CSV save-before-publication tests and extra-field preservation tests.
An unreachable PH Redis must report an error, never silently use the old instance.

## Data circulation and recovery

Local first-slice verification (2026-10-19): the app uses
`redis://pockethive-redis-1:6379/0` on network `pockethive`; a PING from its
container returned PONG. The old private Redis was stopped and its volume kept.
PH workload/Provider qualification against this endpoint remains pending.

The local PH Redis host port is loopback-only. Start this selected PH service with
its own Compose project and the local port-binding override, not a private
PocketData Redis:

```sh
cd /home/sepa/PocketHive
docker compose -f docker-compose.yml \
  -f /home/sepa/PocketData/deploy/compose.ph-redis.yaml up -d --no-deps redis
```

This retains the PH Redis volume and does not start workloads, clear records or
publish the development Redis on all LAN interfaces. Container clients keep using
the internal PH network endpoint. CSV/record write tests use isolated fixtures.

Names and format metadata remain governed by [the DataSet contract](DATASET.md):
`<sut>:<dataset>:data:<list>` and `<sut>:<dataset>:meta:format`. Executors keep the
existing Redis pop/process/push circulation; an empty pool makes the generator
wait for data. No checkout, lease, ownership state or new PH service is introduced.
Unused fields survive and CSV inventory is durable before records are published.

Recovery is still an operator decision: clear the intended Redis namespace and
repopulate through Providers or explicitly selected CSV inventory. Providers retain
the knowledge of the accounts/cards they created. PocketData does not flush Redis,
automatically republish CSV or create resources again after an uncertain result.
Existing unrelated Redis keys, containers and volumes are not migration cleanup.
