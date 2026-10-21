# PocketData frontend

React/TypeScript/Vite product views consume `@pockethive/ui` shell/theme and the
shared `@pockethive/browser-auth` hook. There is no product OAuth implementation.
All mutation and raw-inventory authorization remains on the Java backend.

Build inputs are local versioned npm tarballs in `vendor/`, pinned by integrity in
`package-lock.json`. No sibling working directory is required in Docker or at runtime.

To deliberately refresh shared library snapshots from a PH checkout:

```sh
npm run refresh:shared -- /path/to/PocketHive
npm install
npm test
npm run build
```

Keep the refreshed tarballs and lockfile together. This does not publish packages.
For a normal reproducible build, use `npm ci && npm run build`. Vite development
proxies `/api` to the local Java app at port 8785. Production serves `dist/` as Java
static resources; Node is only a build dependency.

`usePocketAuth({storageKey,onError})` owns sign-in/polling, session restoration,
cancellation and sign-out. PocketData consumes its session and authenticated fetch;
it never infers editing rights from a username. The hook/backend routes are
`/api/session`, `/api/session/device/start`, `/api/session/device/poll` and
`/api/session/logout`.

Tests use synthetic HTTP responses and a mocked hook at the view boundary. They
do not constitute PH SSO proof; the shared auth package/real-ingress integration
tests own that protocol. No test needs an operational catalogue or Redis records.

## Population authoring

The editor sends the current recipe unchanged: `{name,count,values,params,steps}`.
`values` and `params` are independent string maps; identifiers retain leading
zeroes. Each step is `{name,endpoint,call}`. `call` is the shared PH portable
contract with exactly `{profile:'portable-v1',requires,request,response}`, not a
PD-specific request format. The backend/shared PH libraries own complete schema,
capability and template validation; the frontend does not rewrite legacy input.

Only `record`, `params` and `endpoint.path` are template context. PD replaces
reserved `params.iteration` with a one-based numeric string for each iteration.
Declare each function in `requires`: `json_path`, `json_string`, `xml_path`,
`xml_text` or `xml_attr`. JSON response extraction requires `json_path`; SOAP
requires `xml_path` plus `soap11` or `soap12`. Use `json_path(record, '/field')`
for a direct JSON lookup and `xml_path(source, xpath, namespaceMap)` for XML.
Dynamic JSON strings use `{{ json_string(record.customer) }}` without surrounding
quotes: the function returns a full quoted/escaped JSON string. XML text and
attributes use `xml_text(record.accountNumber)` and `xml_attr(...)` respectively.
There is no eval, SpEL, context aliasing or automatic escaping/profile downgrade.

`src/data/population-example.json` is the synthetic JSON default;
`../examples/population-soap.json` is a complete synthetic SOAP11 recipe. Its
`steps[0].call` can be saved unchanged as a standalone PH portable call file;
the recipe's loop and endpoint-name binding stay in PD. PH owns the canonical
cross-adapter fixtures; these product examples are not a second canonical owner.

Run `npm test`, `npm run typecheck` and `npm run build` for frontend checks.
`src/test/population.browser.cjs` verifies the real shared PH shell, portable help
and existing Run/Stop/permission behavior against intercepted synthetic APIs,
including desktop/mobile layout. Set `PD_POPULATION_UI_ORIGIN` to a local Vite
origin, `PD_TEST_PLAYWRIGHT` to an installed Playwright module and
`PD_TEST_BROWSER` to a browser executable. It neither executes SUT requests nor
proves real PH sign-in or backend response escaping.
