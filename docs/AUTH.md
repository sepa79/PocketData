# PocketHive authentication

PH is the only identity/token/session owner. PocketData is public view-only;
every mutation and raw inventory read requires freshly verified active PH
`local-admin`. No local account, cached role, machine credential or auth bypass
grants editing. PH failures deny privileged requests explicitly.

## Browser login without callbacks

PocketData uses the registered **pocketdata-device** OAuth device client, audience
`urn:pockethive:web`, scope `pockethive:web`. Sign in opens a PH tab. Confirm there;
the original PocketData tab completes sign-in automatically by polling its own
backend. Its selected view stays unchanged. No preview origin, callback allowlist,
copied code or return address is configured. A changing preview port therefore
does not require rebuilding PH or changing auth configuration.

PH's device grant owns the pending authorization, expiry, consent and access token.
The shared `@pockethive/browser-auth` module owns browser polling/sessionStorage.
The shared JVM `auth-client` owns bounded no-redirect HTTP/JSON requests. Product
controllers only adapt these operations; `AuthService` owns PocketData access
policy. There is no PocketData login transaction store, second protocol client,
token issuer or authorization-code fallback.

The browser module honors `interval` (five seconds when omitted), `slow_down`,
expiry and cancellation. Codes/tokens never appear in app URLs or logs. Tokens
stay in the tab's sessionStorage, not persistent localStorage or the data volume.
The backend still reads identity from PH on each privileged request.

## Configuration and startup

`POCKETHIVE_AUTH_BASE_URL` is the fixed **server-side** official PH ingress,
including `/auth-service`. The current Docker profile uses
`http://ui:8088/auth-service` on network `pp-ph-integration`. PH advertises its
canonical **browser-side** issuer `http://localhost:8088/auth-service`. Container
DNS names must never become public browser links. Neither address is inferred
from Host/forwarded headers or from PocketData's preview port.

`POCKETHIVE_ALLOW_REMOTE_HTTP` explicitly selects the shared Java device client's
policy for public verification and central logout URLs. Its default is `false`:
HTTPS and loopback HTTP are allowed. Set it to `true` only when the selected PH
deployment deliberately advertises a remote HTTP issuer. The internal
`POCKETHIVE_AUTH_BASE_URL` may still use Docker HTTP with this flag disabled;
an internal service address never grants permission for public remote HTTP.
URI checks remain owned by the shared PH transport policy.

PH 0.15.38 includes the device registrations; no further PH runtime changes are
required for PocketData 0.1.0. Shared libraries are bundled in the PD build, not
installed separately on PH. The following is the existing local integration
profile, not a requirement to rebuild PH from source on each PD installation:

```sh
cd /home/sepa/PocketHive-ph-ui
POCKETHIVE_COMPOSE_OVERRIDE=/home/sepa/PocketData/deploy/compose.ph-auth.yaml \
  ./build-hive.sh --quick --module auth-service --restart ui
cd /home/sepa/PocketData
docker compose up --build -d pocketdata
```

When those integration containers already exist, start just their auth-service
and UI rather than the old release profile. Only one PH ingress may bind 8088;
stop the other profile's UI/auth first without deleting volumes. The local
integration containers are `pp-ph-integration-auth-service-1` and
`pp-ph-integration-ui-1`. Redis and worker stacks need no restart for login.

Open `http://localhost:8785/#/suts` or its current forwarded preview. The PH DEV
provider's `local-admin` and `local-viewer` accounts are configured by PH, not
PocketData. Production uses PH's configured identity provider and HTTPS public
issuer. Device clients have no callback URI, client secret or refresh grant.

## Sign out

PocketData revokes its own device token through PH, clears its tab session and
opens PH's central CSRF-protected sign-out confirmation. Confirming ends the
central browser session on a fixed PH completion page: no callback to PocketData.
Closing that tab before confirmation leaves central SSO signed in, although this
app's token has been revoked. Central logout does not promise revocation of all
independent tokens already issued to other applications.

## Verification boundaries

The [MCP endpoint](MCP.md) applies this same fresh PH identity policy to its
private tools. Native agents obtain their own device session and place the bearer
in client secret/header configuration; MCP does not borrow browser tab storage
or create a second login authority.

Use the real official ingress for deployed browser tests. Isolated identity
fixtures cover denial/transport behavior only, never prove PH SSO. Two native app
origins can prove callback independence, but do not by themselves prove the desktop
preview forwarding path after an actual preview restart. Report that separately.
