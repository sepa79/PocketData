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

The local PH integration branch `/home/sepa/PocketHive-ph-ui` includes the device
registrations. Rebuild that profile, then PocketData:

```sh
cd /home/sepa/PocketHive-ph-ui
POCKETHIVE_COMPOSE_OVERRIDE=/home/sepa/PocketData/deploy/compose.ph-auth.yaml \
  ./build-hive.sh --quick --module auth-service --restart ui
cd /home/sepa/PocketData
docker compose up --build -d pocketdata
```

Open `http://localhost:8785/#suts` or its current forwarded preview. The PH DEV
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

Use the real official ingress for deployed browser tests. Isolated identity
fixtures cover denial/transport behavior only, never prove PH SSO. Two native app
origins can prove callback independence, but do not by themselves prove the desktop
preview forwarding path after an actual preview restart. Report that separately.
