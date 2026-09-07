# Development and testing

Run commands from the repository root. Use a JDK supported by Gradle 8.14.3 and install JDK 8 for compilation. The Java CI matrix tests JDK 8, 17 and 21.

## Unit tests and build

```sh
./gradlew check jar
./gradlew test -PtestJavaVersion=17 --rerun-tasks
./gradlew test -PtestJavaVersion=21 --rerun-tasks
npm --prefix example-app/frontend ci
npm --prefix example-app/frontend run build
node --test scripts/tab-isolation.test.mjs example-app/frontend/src/tunnelLifecycle.test.mjs
npm --prefix example-app/frontend audit --audit-level=high
```

Install the backend test dependencies before running its HTTP-fixture tests:

```sh
python3 -m venv /tmp/guac-jwt-tests
/tmp/guac-jwt-tests/bin/pip install -r example-app/backend/requirements.txt
/tmp/guac-jwt-tests/bin/python -m unittest discover -s example-app/backend -v
```

## Integration and browser tests

Build and start the [local example](../example-app/README.md#start) before running these checks.

Start a test stack with the test-only failed-attempt limit before running the deliberate invalid JWT cases. This recreates Guacamole and disconnects current example sessions; the normal demo retains upstream ban defaults. Run all commands from the repository root:

```sh
docker compose -p guac-jwt-example -f example-app/docker-compose.yaml -f example-app/compose.test.yaml up -d
COMPOSE_PROJECT_NAME=guac-jwt-example node scripts/integration.mjs
COMPOSE_PROJECT_NAME=guac-jwt-example node scripts/sharing-integration.mjs
```

This checks actual header/body JWT authentication, malformed/expired/signature rejection, broker access control, fixed-target authorization, and WebSocket delivery of VNC image instructions through guacd. It also checks container logs against the test secrets and JWTs. Test sessions are revoked afterward. It does not replace browser checks of rendered pixels, keyboard and mouse input. The repeatable browser gate exercises official independent tabs plus embedded invitations and disconnect propagation:

```sh
npm install --global agent-browser@0.33.0
agent-browser install --with-deps
python3 scripts/browser-integration.py
```

It creates its own browser session, keeps authentication data out of output, writes desktop screenshots under `docs/verification/browser-ci`, and closes that browser when finished.

## CI and publishing

Pull requests and pushes to `master` run [.github/workflows/ci.yml](../.github/workflows/ci.yml). Tagged releases run [.github/workflows/release.yml](../.github/workflows/release.yml), which requires the same verification and publishes its verified artifact. The tag must match the version in `build.gradle`.

Record user-facing changes under the planned version, marked `Unreleased`, in [CHANGELOG.md](../CHANGELOG.md). At release time, replace `Unreleased` with the release date and use those entries to prepare GitHub Release notes. Keep environment-specific test results in `docs/verification/` rather than in README or release notes.
