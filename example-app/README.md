# Local JWT connection example

This example runs Guacamole 1.6.0, guacd, a disposable Xvfb/xterm VNC desktop, a Python authorization broker, and a static React client behind Nginx. Only Nginx is published, on loopback by default. No PostgreSQL database is required.

The broker accepts one randomly generated demo access token, which authorizes only the preconfigured `demo` desktop. This is a **local single-user example**, not a production identity service. In production, replace this check with your portal's authenticated user and per-connection authorization.

## Start

Prerequisites: Docker Compose, Python 3, Node 24, and the Java toolchains described in the root README. Run from the repository root:

```sh
./gradlew check stageExample
python3 example-app/setup.py
npm --prefix example-app/frontend ci
npm --prefix example-app/frontend run build
docker compose -p guac-jwt-example -f example-app/docker-compose.yaml up -d --build
```

`setup.py` creates an ignored `example-app/.env` with independent signing key, demo access token and VNC password, mode 0600. It never overwrites an existing file. Open that file locally and use its `DEMO_ACCESS_TOKEN` in the UI; do not publish it or commit it.

Open **http://localhost:8080/example-app/**, enter the demo access token, choose the server's JWT transport (header or form body), and connect. You should see an interactive xterm desktop. The frontend receives a Guacamole session token, connection details and, for shareable sessions, an opaque owner capability. It never receives the signing key, JWT or remote password.

The browser keeps its Guacamole session in per-tab sessionStorage with a page-memory fallback, never shared localStorage. A direct visit to `/console` without a session asks you to authorize. Shared host refresh, tunnel failure or session expiry requires a new authorization and new invitation.

## Multiple windows and sharing

Use **New independent Console** or **New independent official UI**. Each opens without an opener and asks for a fresh demo authorization. Official UI login is isolated using the extension's `jwt-tab=1` mode. Do not use browser Duplicate Tab as a substitute for authorization.

In a connected Console, choose **Generate sharing link**. Default visitors are read-only; select **Allow visitor control** before generating a link to grant keyboard/mouse control. The recipient can choose Console or official UI. The opaque invitation is consumed from the URL fragment and sent to the broker; no JWT or desktop credential is in the link. Anyone holding the link receives its permission.

Join within five minutes. Expiry stops new joins, not existing viewers. The host must stay connected; leaving or refreshing the host ends its visitors and requires new authorization/new invitations. Invitations cannot be individually revoked. Owner capabilities last at most eight hours; broker owner/invitation stores each hold at most 1,024 records and restart clears them. Production portals must replace the demo capability check with real per-user authorization.

## Testing

See [development and testing](../docs/development.md) for unit tests, real REST/WebSocket/VNC checks and browser regression commands.

## Configuration

| Setting in `.env` | Meaning |
|---|---|
| `JWT_SECRET_KEY` | Server-only literal UTF-8 HMAC signing key. Minimum 32 bytes; generated with cryptographic randomness. |
| `DEMO_ACCESS_TOKEN` | Independent random capability for the one demo desktop; minimum 32 characters. |
| `DEMO_VNC_PASSWORD` | Password for the disposable VNC server. VNC's legacy password length is limited, so the generated value is eight characters. Keep VNC on the private Compose network. |
| `DEMO_HTTP_PORT` | Optional loopback HTTP port, default `8080`. |

Signing tokens last 60 seconds. This controls acceptance of the JWT, not the duration of an established remote session.

The frontend uses `guacamole-common-js` **1.5.0** with Guacamole **1.6.0**. The npm package and Apache server have separate version numbers.

For UI development, start the Docker stack first, then run `npm --prefix example-app/frontend run dev`. Visit the Vite URL it prints with `/example-app/`; API and WebSocket requests proxy to port 8080. If you changed `DEMO_HTTP_PORT`, update the local Vite proxy target accordingly. Vite is bound to loopback.

## Stop

```sh
docker compose -p guac-jwt-example -f example-app/docker-compose.yaml down
```

The desktop is disposable; its filesystem is lost when the container is removed. This command affects only this named Compose project. Keep `.env` private or delete it when the example is no longer needed.

## Troubleshooting

- **403 from `/guacamole/api/tokens`:** check matching secrets, expiration, string-valued claims and the `jwt` data source. Do not print tokens or passwords to diagnose this.
- **502 from the broker:** Guacamole may still be starting, the extension may not be loaded, or the key/claims may not match. Inspect sanitized startup logs.
- **Missing extension/classes:** run `stageExample` and install only its self-contained 1.6.0 JAR. Do not copy the old manual dependency set into `lib`.
- **TLS failure:** configure a trusted certificate/CA and correct HTTPS/WSS URLs. Do not disable certificate verification.
- **Docker registry proxy failure:** the images are referenced by Docker Hub's explicit official registry hostname. If image downloads fail, check registry connectivity and proxy settings.
- **JDBC deployment upgrade:** this example does not migrate an existing Guacamole database. Use the upstream schema migration procedure for your deployment.
