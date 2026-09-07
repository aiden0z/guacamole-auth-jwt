# Changelog

User-facing changes are recorded here. Entries under **Unreleased** have not been published as a release. Historical entries summarize GitHub Release notes and use their publication dates in UTC, ordered newest first. Original release tags are preserved.

## 1.6.0 (Unreleased)

### Added

- Independent official Web UI authentication per tab through the opt-in `jwt-tab=1` mode. Portal-launched sessions no longer replace another isolated tab's login. ([#6](https://github.com/aiden0z/guacamole-auth-jwt/issues/6))
- Sharing of active guacd connections through signed `GUAC_SHARE_ID` and `GUAC_JOIN_ID` grants, with read-only or control permissions and visitor disconnection when the host ends. ([#12](https://github.com/aiden0z/guacamole-auth-jwt/issues/12))
- Example application flows for independent windows and five-minute sharing invitations in embedded and official clients.
- CI coverage for Java 8/17/21, backend and frontend checks, real connection/sharing integration and browser regression.

### Changed

- Target Guacamole Web and guacd 1.6.0 while retaining Java 8 bytecode compatibility.
- Upgrade Gradle to 8.14.3 and JJWT to 0.13.0. Bundle JWT/Gson dependencies in the extension JAR so installation no longer requires separate JWT library downloads.
- Move example authorization and JWT signing to a backend broker; replace the frontend build with Vite and use a disposable VNC desktop without a PostgreSQL dependency.
- Require verification before tagged releases and publish checksums alongside the verified extension artifact.

### Fixed

- Reject missing expiration, malformed connection IDs and non-string connection parameters without uncontrolled authentication errors. Preserve the legacy `DEFAULT` ID when `GUAC_ID` is omitted.
- Prevent raw signing keys, JWTs and claims from appearing in authentication diagnostic logs.
- Reject conflicting sharing roles, target overrides, duplicate active host IDs and replay of a closed host grant. Check shared authorization expiry when opening a tunnel.
- Propagate tunnel closure and errors to the example client so disconnected visitors do not remain displayed as connected.

### Upgrade notes

See [Upgrading from 1.5.4](docs/upgrading.md) before replacing an existing installation, including dependency cleanup, JWT validation changes and replacement of the browser-signing example.

Sharing is currently limited to one Guacamole instance. A shared host reconnect or refresh requires a new authorization and sharing ID. Individual visitor revocation and cross-instance coordination are not included. See the [usage and limits](README.md#sharing-an-active-connection).

## [v1.5.4](https://github.com/aiden0z/guacamole-auth-jwt/releases/tag/v1.5.4) - 2024-03-21

- Support Guacamole 1.5.4.
- Accept JWTs through the `Guacamole-Auth-Jwt` HTTP header when obtaining a Guacamole authorization token.
- Add a React example application demonstrating use of the extension.

## [0.9.14](https://github.com/aiden0z/guacamole-auth-jwt/releases/tag/0.9.14) - 2018-03-16

- Support Guacamole 0.9.14.
- Align the extension version number with the Guacamole version. Earlier extension releases used their own version numbering.

## [1.0.1](https://github.com/aiden0z/guacamole-auth-jwt/releases/tag/1.0.1) - 2017-08-16

- Support Guacamole 0.9.13-incubating.

## [1.0.0](https://github.com/aiden0z/guacamole-auth-jwt/releases/tag/1.0.0) - 2017-08-14

- Provide a JWT authentication extension for Guacamole 0.9.9.
