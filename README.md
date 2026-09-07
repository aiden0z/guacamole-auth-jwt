# guacamole-auth-jwt

A small [Apache Guacamole](https://guacamole.apache.org/) authentication extension for on-demand remote connections authorized by a signed JWT.

A trusted application server signs connection claims. Guacamole verifies the JWT at `/guacamole/api/tokens` and returns its own opaque session token. The client uses that **Guacamole session token**, not the JWT, to open a tunnel.

## Install

The source in this branch targets Guacamole **1.6.0** and produces Java 8 bytecode. The extension JAR includes its JWT dependencies; Guacamole and container APIs are supplied by the host. For published versions, see [GitHub Releases](https://github.com/aiden0z/guacamole-auth-jwt/releases).

Build with a supported JDK for Gradle 8.14.3 (JDK 21 recommended), with JDK 8 installed for the compilation toolchain:

```sh
./gradlew check jar
```

Copy `build/libs/guacamole-auth-jwt-1.6.0.jar` to `$GUACAMOLE_HOME/extensions/`. **No additional dependency downloads are needed.** For a published release, verify its `SHA256SUMS` before installing the JAR.

Configure `secret-key` in `guacamole.properties` with a cryptographically random secret. Generate a suitable ASCII value with:

```sh
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

Set `secret-key: YOUR_GENERATED_VALUE` using the value you generated. Treat it as a **literal UTF-8 string**, not Base64 or hex-decoded bytes. The official Guacamole 1.6.0 Docker image also accepts the `SECRET_KEY` environment variable. Restart the Guacamole web application to load the extension; this disconnects active users.

For a complete local example, see [example-app](example-app/README.md).

## JWT contract

| Claim | Contract |
|---|---|
| `GUAC_ID` | Nonempty string connection ID. Always provide it in new integrations. Omission retains the legacy `DEFAULT` ID. |
| `exp` | Required expiration time, UNIX seconds (JWT NumericDate). Expired tokens are rejected. |
| `guac.protocol` | Required for ordinary/host connections; nonempty string, e.g. `vnc`, `rdp`, `ssh`. |
| `guac.hostname` | Required for ordinary/host connections; nonempty string, resolved by guacd. |
| `guac.port` | String, e.g. `"5900"`. Optional if the protocol supplies a default. |
| `guac.username`, `guac.password` | Optional strings. |
| `guac.*` | Other Guacamole connection parameters, as strings. Unknown non-`guac.*` claims do not become connection parameters. |

The configured HMAC key must meet the selected algorithm's minimum size: HS256 / HS384 / HS512 require at least 32 / 48 / 64 bytes respectively. Length is not entropy: use randomly generated secrets, not passphrases.

### Exchange a JWT for a session

This example runs **on your application server after authorization**, never in a browser. Install PyJWT and requests first. The example environment values must be populated by your own credential/configuration system.

```python
import os
import time
import jwt
import requests

payload = {
    'GUAC_ID': 'authorized-connection',
    'guac.protocol': 'vnc',
    'guac.hostname': os.environ['AUTHORIZED_HOSTNAME'],
    'guac.port': '5900',
    'guac.password': os.environ['AUTHORIZED_VNC_PASSWORD'],
    'exp': int(time.time()) + 60,
}
token = jwt.encode(payload, os.environ['JWT_SECRET_KEY'], algorithm='HS256')
response = requests.post(
    os.environ['GUACAMOLE_TOKEN_URL'],  # e.g. https://desktop.example.com/guacamole/api/tokens
    headers={'Guacamole-Auth-Jwt': token, 'Content-Type': 'application/x-www-form-urlencoded'},
    data={},
    timeout=10,
)
response.raise_for_status()
session = response.json()
# Return only the necessary Guacamole session fields to the authorized client.
```

The form alternative is `requests.post(url, data={'token': token}, timeout=10)`. Guacamole expects `application/x-www-form-urlencoded`, not a JSON object. If both a nonempty `Guacamole-Auth-Jwt` header and form/query parameter are supplied, the header wins; an invalid header never falls back to the body. Prefer the header or POST body over query strings.

A successful response contains `authToken`, `username`, `dataSource: "jwt"` and `availableDataSources`. Pass the opaque `authToken` to `Guacamole.WebSocketTunnel` with:

```text
GUAC_DATA_SOURCE=jwt&GUAC_ID=authorized-connection&GUAC_TYPE=c&token=GUACAMOLE_SESSION_TOKEN
```

Use `URLSearchParams` to encode the values. The tunnel is `/guacamole/websocket-tunnel` when the WAR is deployed at `/guacamole`. Adjust the context path to your deployment.

**The custom JWT header applies to token exchange only.** Browser WebSocket clients in this example still pass the Guacamole session token in the tunnel URL. Use HTTPS/WSS and ensure reverse-proxy, server access logs and monitoring do not record those query strings. Do not put tokens in portal navigation URLs.

## Independent official Web UI tabs

Open each independently authorized official Web UI tab with `jwt-tab=1`, for example `/guacamole/?jwt-tab=1#/`. The extension then keeps authentication in that tab's sessionStorage rather than the shared auth slot. Other preferences and ordinary, unmarked logins retain upstream behavior. This is a Guacamole **1.6.0** frontend adaptation and must be regression-tested when upgrading the host.

The example's **New independent official UI** link opens with `noopener` and performs a fresh server authorization. Its same-origin handoff uses `window.name` prefixed `jwt-session:` containing JSON `{ "authToken": "..." }`, immediately consumed and cleared by the extension. Do not send JWTs, desktop credentials or signing keys through this handoff. Do not navigate to an unrelated origin while a handoff is pending. Browser Duplicate Tab may clone sessionStorage and is not an independent authorization.

Logging out ends only that tab's session. Refresh restores the tab's still-valid token. If browser sessionStorage is disabled, authentication stays in page memory and refresh requires authorization again. Unmarked official UI tabs continue sharing upstream login state.

## Sharing an active connection

Keep `GUAC_ID` as the client-visible connection identifier. Add `GUAC_SHARE_ID` to a host JWT to permit joining that specific active connection. Generate a **new random ID for every host generation**, with at least 128 bits of entropy; accepted syntax is 22–128 base64url characters. A signer must never reissue a retired ID in a fresh host grant.

```python
import secrets
share_id = secrets.token_urlsafe(32)
host_payload = {**payload, 'GUAC_SHARE_ID': share_id}
# Sign and exchange host_payload on the backend using the normal flow.
# Only after the host connects may an authorized visitor join:
visitor_payload = {
    'GUAC_ID': 'visitor',
    'GUAC_JOIN_ID': share_id,
    'guac.read-only': 'true',
    'exp': int(time.time()) + 60,
}
```

A join JWT must not contain `GUAC_SHARE_ID`, protocol, host, password or other `guac.*` parameters. Only `guac.read-only` is accepted: `"true"` (default) or explicitly `"false"` for control. The signature authorizes this permission; clients cannot change it during tunnel creation. Read-only tunnels filter write instructions server-side, including key, mouse, clipboard, file and resize operations.

Joining resolves to a tracked **guacd active connection**, not a second connection to the same VNC address. Missing, closed or duplicate host IDs are rejected. Host/visitor grants must remain unexpired when their shared tunnel opens; expiry does not disconnect an already established tunnel. Closing the host ends its visitors. Reconnecting a shared host requires a new authorization and new ID; refreshing the embedded host also ends that generation. A successfully used host grant cannot be reused to start another shared connection.

Tracking is process-local, capped at 10,000 active/retired host records. Restart loses sharing state. Shared participants must reach the same Guacamole instance and guacd. Cross-instance coordination, individual visitor revocation, and forced disconnection at JWT expiry are not implemented. The [example](example-app/README.md) provides opaque five-minute invitation links; the extension itself does not add JDBC Sharing Profiles administration.

## Security and authorization boundary

- Only the trusted backend may possess the signing key or choose authorized hosts and credentials. Possession of this key grants authority to create arbitrary connection claims accepted by the extension.
- A signed JWT is **not encrypted**. Its connection credentials can be read by anyone holding it. Exchange the JWT on your backend and return only the Guacamole session token where possible.
- `exp` limits JWT acceptance. It is not a promise that an existing Guacamole session or tunnel is terminated at that time. Session termination/revocation follows Guacamole's lifecycle.
- The extension does not add issuer/audience policies, general JWT replay prevention, key rotation, target allowlists or per-user access control. Enforce authorization before signing; do not reuse generic login JWTs as connection grants.
- Do not log signing keys, JWTs, claims, passwords or Guacamole session tokens. Error categories are logged without JWT parser exception messages.

## Further documentation

- [Version changes](CHANGELOG.md)
- [Upgrade from 1.5.4](docs/upgrading.md)
- [Development and testing](docs/development.md)
- [Local example](example-app/README.md)

## License

MIT for this extension. Nested libraries retain their own licenses and notices within their JARs.
