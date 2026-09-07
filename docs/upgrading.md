# Upgrading from 1.5.4

These steps apply when moving to the changes described in [1.6.0 (Unreleased)](../CHANGELOG.md#160-unreleased).

1. Back up configuration and plan a maintenance window. Upgrade both Guacamole Web **and guacd** to 1.6.0; upgrading this JAR alone does not fix guacd vulnerabilities.
2. Replace the old JWT extension with exactly one 1.6.0 JAR. Remove old JWT-specific JJWT JARs from `GUACAMOLE_HOME/lib` after confirming no other extension needs them. Do not blindly delete shared Jackson libraries used by other extensions.
3. Retain `secret-key`, the `jwt` data-source identifier, `Guacamole-Auth-Jwt`, and the existing string-valued claim format. Existing ASCII secrets retain their meaning; non-ASCII secrets are now explicitly UTF-8.
4. Audit payloads: non-string `guac.*` values and non-string/blank IDs are now rejected rather than ignored or allowed to fail internally. Missing `GUAC_ID` still uses `DEFAULT`; supply an explicit ID when updating callers.
5. The old browser-signing demo has been replaced. Use [the example setup](../example-app/README.md); do not expose old `REACT_APP_GUACAMOLE_JWT_SECRET` values in a frontend build. Rotate any real key that was previously exposed in browser assets or logs.
6. If you use JDBC authentication, apply Guacamole's database upgrade instructions, including the pre-1.6.0 schema migration where applicable. The local JWT example no longer requires PostgreSQL; existing databases are not modified by this project.
