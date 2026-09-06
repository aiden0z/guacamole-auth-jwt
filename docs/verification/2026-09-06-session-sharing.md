# 1.6.0 session/sharing verification — 2026-09-06

Outcome: #6 and #12 are implemented locally, including the example application. No commit, push, tag or release was performed. Hosted GitHub Actions and deployment acceptance remain pending.

## Implementation

- #6: manifest-loaded, explicit `jwt-tab=1` authentication isolation in official Guacamole 1.6.0. Other storage/preferences and unmarked login behavior remain upstream defaults. Separate portal windows use noopener; same-origin bootstrap is consumed and cleared without a token in the navigation URL.
- #12: signed host/join claims, provider-local registry of guacd connection IDs, server-side read-only instruction filtering, host closure propagation, expiration checks at shared tunnel creation, duplicate/retired host ID rejection.
- Example: independent embedded/official entries, backend-owned capabilities and five-minute invitations, read-only/control visitors, controlled failure/disconnect handling. Secrets and JWT signing remain in the backend.

## Verification evidence

| Check | Result and limits |
|---|---|
| Java 8 | `./gradlew test stageExample --no-daemon`: 22 tests passed. Includes strict share claims, join expiry, duplicate owners, failed handshake retry, raw protocol write filtering, close racing join, and closed-host replay rejection. |
| Java 17 | `./gradlew test --rerun-tasks -PtestJavaVersion=17 --no-daemon`: 22 tests passed. |
| Java 21 | Ran the same compiled production/test classes and resolved test runtime dependencies using JUnitCore inside the official Guacamole container: `OK (22 tests)`. This is a direct Java 21 test run, not a hosted Gradle matrix execution. |
| Backend | `python3 -m unittest discover -s example-app/backend -v`: 14 cases passed against a local HTTP fixture, including inherited baseline cases. Initial sandbox denied binding the fixture port; authorized rerun succeeded. |
| Browser-side units | `node --test scripts/tab-isolation.test.mjs example-app/frontend/src/tunnelLifecycle.test.mjs`: 11 passed. Storage tests run the actual decorator with an Angular fixture; lifecycle tests use the actual Guacamole Client with a fake transport/display boundary. |
| Frontend | TypeScript/Vite production build passed. `npm audit --audit-level=high`: zero reported vulnerabilities. Existing >500 kB chunk warning remains. |
| Baseline real integration | `COMPOSE_PROJECT_NAME=guac-jwt-upgrade node scripts/integration.mjs`: both JWT transports, broker authorization and fixed-target rejection, VNC frames and log redaction passed. |
| Shared real integration | `COMPOSE_PROJECT_NAME=guac-jwt-upgrade node scripts/sharing-integration.mjs`: owner + two visitors received frames; guacd logs within the run report three users on one actual connection. Duplicate/absent IDs, delayed-expiry join, closed-host JWT replay and stale joins rejected. Owner closure closes visitors. |
| Raw write protection | Java test sends key, mouse, clipboard, blob, file, put and resize instructions through the real Guacamole filtering writer and verifies only sync reaches its backing socket. Real integration additionally confirms raw attempted key/clipboard writes do not break the viewing tunnel. The frame-count assertion alone is not proof of a specific keystroke or absence of remote writes. |
| Manual browser input | A control visitor issued `echo shareok` using real key events. Control and read-only visitor screenshots both visibly contain the command and its remote output. See [control](shared-control.png) and [viewer](shared-readonly.png). |
| Browser gate | `python3 scripts/browser-integration.py`: official independent logins with distinct private token comparisons, no login DELETE, B logout DELETE targets exactly B and succeeds (204), A survives and refreshes. Embedded independent hosts, read-only/control invitations, visitor disconnect/session-storage cleanup and survival of the other host are covered. A further invitation enters the official UI, renders its desktop, clears bootstrap data, and shows “You have been disconnected.” when the host ends; see [official visitor](browser-ci/official-visitor-connected.png) and [ended](browser-ci/official-visitor-host-ended.png). Screenshots are supporting visual evidence; private token/network assertions establish login independence. |
| Review | Independent review found a closed-host replay defect; red regression confirmed it, retired-ID fix passed tests and scoped re-review. Manual browser check found stale Connected status after tunnel closure; lifecycle fix passed red/green tests and browser regression. |
| Hygiene | `git diff --check` passed; build and staged extension hashes match. |

Artifact: `build/libs/guacamole-auth-jwt-1.6.0.jar`

SHA-256: `de45eaf3dc922d4a7ef1151b1197dcb5cbfddf59f04bef637ff4ab6c84b87cd0`

## Decisions and remaining release conditions

Shared-host refresh/leave ends that generation and requires a new authorization and ID. Ordinary official sessions can refresh with their existing valid token. This explicitly resolves the conflict between transparent shared-host reconnect and preventing old invitations from joining a new generation.

Sharing is single-instance and process-local, with a 10,000-entry active/retired host bound. The signer must never reuse a share ID in a fresh grant. Owner capabilities in the demo expire after eight hours; invitations allow joins for up to five minutes. Neither invitation/JWT expiry promises immediate termination of existing visitors. No cross-instance coordination, individual visitor revocation, JDBC Sharing Profiles UI, RDP/SSH sharing proof or production deployment is claimed.

The local runtime is Linux ARM64 Docker on macOS with official Guacamole Web/guacd 1.6.0. The Web image's Java runtime is Temurin 21.0.7; this records the tested image, not a claim that its base-image security patches are current. Baseline environment details remain in [the first-batch report](2026-09-06-upgrade.md).

CI now includes Java 8/17/21, backend and JS tests, frontend build/audit, REST/VNC/sharing integration, and the pinned agent-browser 0.33.0 browser gate with uploaded screenshots. The release workflow depends on that reusable verification job. GitHub-hosted execution and target deployment rehearsal must pass before publishing 1.6.0.

Final scoped review closed with no outstanding findings after official visitor coverage and documentation reconciliation. The isolated test browser sessions and `guac-jwt-upgrade` Compose containers/network were stopped and removed. Generated demo secrets remain in the ignored local `.env`; cached build images remain available.
