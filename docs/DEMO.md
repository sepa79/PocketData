# Persistent local demo

This is an explicitly installed demo, not automatic application seed data or a
temporary acceptance fixture. It stays available after restart. No bank or real
payment API is contacted; identifiers beginning `000-demo-` are deliberately not
usable card/account identifiers.

## What is installed

- SUT **Demo · JSON + SOAP**, ID `pocketdata-demo`.
- DataSet **cards**, with **ready** and **returned** lists on the selected PH Redis.
- Three generated records and their durable response/record CSV files.
- A separate pinned WireMock container, **pocketdata-demo**, on a dedicated internal
  network. Its optional admin endpoint is bound only to `127.0.0.1:8787`.
- The default Population example: JSON account creation → SOAP 1.1 card creation
  → SOAP 1.2 card creation. Each step extracts fields for the final shared record.

The catalogue and CSV files stay on PocketData's existing inventory volume.
Live list durability follows PH Redis configuration. No private Redis or PH swarm
is started for this demo. The mock has authored mappings, not durable bank state;
created fake identifiers remain in the saved inventory even when the mock restarts.

## Start and populate explicitly

Keep the normal Redis/auth environment configuration and append `compose.demo.yaml`
to the local `COMPOSE_FILE` selection, or supply all selected files explicitly:

```sh
docker compose -f compose.yaml -f compose.ph.yaml -f compose.demo.yaml up --build -d --wait
node scripts/seed-demo.mjs --origin http://localhost:8785 --auth-origin http://localhost:8089 --confirm
```

The setup helper is local DEV tooling: it obtains the actual PH `local-admin`
identity through the selected official ingress. It neither creates a local
account nor bypasses PocketData authorization. It accepts native localhost
origins only and does not configure any browser preview/callback port.

`examples/demo/sut.json` and `dataset.json` own the authored definitions. The
default recipe in `frontend/src/data/population-example.json` is also the setup
helper's recipe; it is not copied into a second workflow. Catalogue validation,
metadata, population and durable output still belong to the normal backend owners.

Setup appends the SUT with revision checking and refuses conflicting definitions.
It does not overwrite other SUTs, clear lists or repeat a creation job when demo
inventory already exists. Existing inventory is not proof that an earlier partial
job completed; inspect it rather than automatically retrying uncertain creation.
There is no automatic cleanup or reseeding on application startup.

## Try it

1. Refresh PocketData and select **Demo · JSON + SOAP** in the header.
2. Open **DataSets** to inspect the **cards** list counts.
3. Open **Population**, choose **cards / ready**, and sign in through PH.
4. The JSON/SOAP script is already in the editor. **Run script… → Confirm Run**
   creates one additional record by default. Change `count` for more iterations.
5. Use Inventory/downloads to inspect saved records and the response audit.

The demo is opt-in and not intended for public exposure or production. Removing
the mock stops resource creation but does not delete the SUT, Redis namespace or
saved CSV files. Do not use `down -v` or flush shared Redis to tidy the demo.

## Verification

`tests/demo.browser.cjs` exercises setup, repeated setup without additional writes,
preservation of another SUT, the actual default UI JSON/SOAP workflow and restart
persistence. It uses its own temporary PD volume and `pd-ph-qa-*` Redis namespace,
not the installed `pocketdata-demo` namespace. Only those owned QA resources are
removed; the installed demo mock and requested persistent demo remain available.
