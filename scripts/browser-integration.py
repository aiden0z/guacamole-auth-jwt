#!/usr/bin/env python3
"""Guacamole 1.6.0 official two-tab and embedded sharing browser regressions.

Requires the running example stack and DEMO_ACCESS_TOKEN (environment or ignored
example-app/.env). Browser JSON, tokens, headers and snapshots stay in memory;
only fixed check names and desktop screenshots are emitted. This gate tests
separate authentication sessions, not independent VNC servers.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

VERSION = '0.33.0'
AUTH = 'angular.element(document.body).injector().get("authenticationService")'
DISPLAY_READY = '''(() => {
    const c = Array.from(document.querySelectorAll('canvas')).find(c => c.width >= 640 && c.height >= 480);
    if (!c || /Waiting for response|Disconnected|Connection Error/i.test(document.body.innerText)) return false;
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < data.length; i += 4) if (data[i] || data[i+1] || data[i+2]) return true;
    return false;
})()'''


class CheckFailed(Exception):
    pass


def require(condition, label):
    if not condition:
        raise CheckFailed(label)


class Browser:
    def __init__(self):
        self.session = 'guac-jwt-ci-' + uuid.uuid4().hex[:12]

    def call(self, *args, source=None):
        result = subprocess.run(
            ['agent-browser', '--session', self.session, *args, '--json'],
            input=source, capture_output=True, text=True, timeout=60)
        # Never include command arguments or raw CLI output in an error: they
        # may contain a credential or a private network/snapshot response.
        require(result.returncode == 0, 'browser command failed: ' + args[0])
        try:
            payload = json.loads(result.stdout)
        except ValueError:
            raise CheckFailed('browser returned invalid JSON') from None
        require(payload.get('success'), 'browser operation rejected: ' + args[0])
        return payload.get('data') or {}

    def evaluate(self, source):
        return self.call('eval', '--stdin', source=source).get('result')

    def ref(self, role, name):
        # AX snapshots can lag a newly opened page or animated dropdown.
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            refs = self.call('snapshot', '-i')['refs']
            matches = [key for key, value in refs.items()
                       if value.get('role') == role and value.get('name', '').strip() == name]
            if len(matches) == 1:
                return '@' + matches[0]
            time.sleep(0.2)
        raise CheckFailed('expected unique control: ' + name)

    def active_tab(self):
        return next(t['tabId'] for t in self.call('tab')['tabs'] if t['active'])

    def connected(self):
        self.call('wait', '--fn', DISPLAY_READY)
        require(self.evaluate(DISPLAY_READY), 'remote display not rendered')

    def token(self):
        return self.evaluate(AUTH + '.getCurrentToken()')

    def valid(self):
        return self.evaluate(AUTH + '.getValidity()') is True

    def deletes(self):
        return [r for r in self.call('network', 'requests')['requests']
                if r.get('method') == 'DELETE']

    def launch_official(self, landing, credential):
        self.call('tab', landing)
        self.call('click', self.ref('link', 'New independent official UI'))
        tab = self.active_tab()
        require(tab != landing, 'official authorization did not open a new tab')
        self.call('fill', self.ref('textbox', '* Demo access token'), credential)
        self.call('click', self.ref('button', 'Connect in official Guacamole UI'))
        self.call('wait', '--url', '**/guacamole/**')
        self.connected()
        require(self.evaluate('window.opener === null'), 'official tab has opener')
        require(self.evaluate('window.name === ""'), 'bootstrap transport not cleared')
        require(self.evaluate('localStorage.getItem("GUAC_AUTH_TOKEN") === null'),
                'official tab wrote shared authentication token')
        require(self.valid(), 'official session invalid after bootstrap')
        return tab



def embedded_sharing(browser, landing, credential, output):
    status = "document.querySelector('[role=status]')?.textContent"

    def connected():
        browser.call('wait', '--fn', status + " === 'Connected'")
        browser.connected()

    def new_host():
        browser.call('tab', landing)
        browser.call('click', browser.ref('link', 'New independent Console'))
        tab = browser.active_tab()
        require(tab != landing, 'embedded host did not open independently')
        browser.call('fill', browser.ref('textbox', '* Demo access token'), credential)
        browser.call('click', browser.ref('button', 'Connect to demo desktop'))
        connected()
        require(browser.evaluate('window.opener === null'), 'embedded host has opener')
        return tab

    def visitor(host, read_only, official=False):
        browser.call('tab', host)
        browser.call('uncheck' if read_only else 'check',
                     browser.ref('checkbox', 'Allow visitor control (default is read-only)'))
        browser.call('click', browser.ref('button', 'Generate sharing link'))
        browser.call('wait', '--fn', "!!document.querySelector('input[aria-label=\"Sharing link\"]')?.value")
        invitation = browser.evaluate("document.querySelector('input[aria-label=\"Sharing link\"]').value")
        require(isinstance(invitation, str) and '/example-app/join#' in invitation,
                'host did not generate a sharing link')
        # Neither capability nor complete URL appears in command arguments/output.
        browser.call('tab', 'new', 'about:blank')
        guest = browser.active_tab()
        browser.evaluate('window.location.replace(' + json.dumps(invitation) + '); undefined')
        browser.call('click', browser.ref('button', 'Join in official UI' if official else 'Join in Console'))
        if official:
            browser.call('wait', '--url', '**/guacamole/**')
            browser.connected()
            require(browser.valid(), 'official visitor bootstrap did not authenticate')
            require(browser.evaluate('window.name === ""'), 'official visitor bootstrap was not cleared')
            require(browser.evaluate('localStorage.getItem("GUAC_AUTH_TOKEN") === null'),
                    'official visitor wrote a shared authentication token')
            require(browser.evaluate('sessionStorage.getItem("jwt-example-session") === null'),
                    'official visitor retained the broker session handoff')
            browser.call('screenshot', str(output / 'official-visitor-connected.png'))
            return guest
        connected()
        require(browser.evaluate('window.location.hash === ""'), 'visitor capability remains in URL')
        saved = browser.evaluate('JSON.parse(sessionStorage.getItem("jwt-example-session") || "null")')
        require(saved and saved.get('readOnly') is read_only, 'visitor permission differs from invitation')
        label = 'read-only' if read_only else 'control allowed'
        require(browser.evaluate('document.body.innerText.includes(' + json.dumps('Visitor: ' + label) + ')'),
                'visitor permission is not displayed')
        browser.call('screenshot', str(output / ('embedded-visitor-' + ('readonly' if read_only else 'control') + '.png')))
        return guest

    host = new_host()
    unrelated_host = new_host()
    readonly_guest = visitor(host, True)
    control_guest = visitor(host, False)
    official_guest = visitor(host, True, official=True)
    print('PASS: official UI visitor authenticates through invitation handoff and renders the desktop')
    print('PASS: embedded read-only and control visitors join and render the shared desktop')
    browser.call('tab', host)
    browser.call('click', browser.ref('link', 'Back to connections'))
    for guest in [readonly_guest, control_guest]:
        browser.call('tab', guest)
        browser.call('wait', '--fn', "(() => { const s = " + status + "; return !!s && (s.startsWith('Disconnected') || s.startsWith('Cannot join:')); })()")
        require(browser.evaluate(status + " !== 'Connected'"), 'visitor falsely remains Connected after host ends')
        require(browser.evaluate('sessionStorage.getItem("jwt-example-session") === null'),
                'ended visitor retains session recovery credentials')
    browser.call('screenshot', str(output / 'embedded-visitor-host-ended.png'))
    browser.call('tab', official_guest)
    official_disconnected = "(/disconnected|connection error|server error|connection has been closed/i).test(document.body.innerText)"
    browser.call('wait', '--fn', official_disconnected)
    require(browser.evaluate(official_disconnected), 'official visitor did not report host termination')
    browser.call('screenshot', str(output / 'official-visitor-host-ended.png'))
    print('PASS: official UI visitor reports disconnection when its host ends')
    browser.call('tab', unrelated_host)
    connected()
    require(browser.evaluate('!!JSON.parse(sessionStorage.getItem("jwt-example-session") || "null")?.authToken'),
            'ending another host cleared independent embedded session')
    browser.call('screenshot', str(output / 'embedded-independent-host-survives.png'))
    print('PASS: ending host disconnects both visitors, clears recovery state, and preserves independent host')

def demo_credential():
    value = os.environ.get('DEMO_ACCESS_TOKEN')
    if value:
        return value
    path = Path(__file__).resolve().parents[1] / 'example-app' / '.env'
    if path.exists():
        for line in path.read_text().splitlines():
            if line.startswith('DEMO_ACCESS_TOKEN='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    raise CheckFailed('DEMO_ACCESS_TOKEN is not configured')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://localhost:8080')
    parser.add_argument('--output-dir', default='docs/verification/browser-ci')
    args = parser.parse_args()
    version = subprocess.run(['agent-browser', '--version'], capture_output=True, text=True, check=True)
    require(version.stdout.strip() == 'agent-browser ' + VERSION,
            'install the pinned agent-browser version ' + VERSION)
    credential = demo_credential()
    output = Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)
    browser = Browser()
    try:
        browser.call('open', args.base_url.rstrip('/') + '/example-app/')
        landing = browser.active_tab()
        tab_a = browser.launch_official(landing, credential)
        token_a = browser.token()
        require(bool(token_a), 'A has no token')
        tab_b = browser.launch_official(landing, credential)
        token_b = browser.token()
        require(bool(token_b) and token_a != token_b, 'independent tabs share a token')
        require(not browser.deletes(), 'a login unexpectedly revoked a session')
        browser.call('screenshot', str(output / 'official-b-connected.png'))
        browser.call('tab', tab_a)
        require(browser.token() == token_a and browser.valid(), 'B login invalidated A')
        browser.connected()
        browser.call('screenshot', str(output / 'official-a-both-connected.png'))
        print('PASS: independent official UI tabs have distinct valid tokens and rendered desktops')

        browser.call('tab', tab_b)
        username = browser.evaluate(AUTH + '.getCurrentUsername()')
        browser.call('press', 'Control+Alt+Shift')
        browser.call('wait', '--fn', "Math.abs(document.querySelector('#guac-menu').getBoundingClientRect().left) < 0.5")
        browser.call('find', 'text', username, 'click', '--exact')
        browser.call('wait', '--fn', "Array.from(document.querySelectorAll('a.logout')).some(e => e.getClientRects().length > 0)")
        browser.call('click', browser.ref('link', 'Logout'))
        browser.call('wait', '--text', 'Re-login')
        deletes = browser.deletes()
        require(len(deletes) == 1, 'expected only the B logout DELETE')
        headers = {key.lower(): value for key, value in deletes[0].get('headers', {}).items()}
        require(headers.get('guacamole-token') == token_b,
                'logout DELETE targeted a session other than B')
        require(deletes[0].get('status') == 204, 'B logout did not complete successfully')
        browser.call('tab', tab_a)
        require(browser.token() == token_a and browser.valid(), 'B logout invalidated A')
        browser.connected()
        print('PASS: B UI logout revokes only B; A remains valid and connected')

        browser.call('reload')
        browser.connected()
        require(browser.token() == token_a and browser.valid(), 'A refresh lost its own valid token')
        require(browser.evaluate('localStorage.getItem("GUAC_AUTH_TOKEN") === null'),
                'refresh wrote shared authentication token')
        browser.call('screenshot', str(output / 'official-a-refreshed.png'))
        print('PASS: A refresh retains its token and renders the remote desktop')
        print('PASS: official browser regression complete')
        embedded_sharing(browser, landing, credential, output)
        print('PASS: embedded sharing browser regression complete')
    finally:
        # Close only this fresh test browser session, never the stack or other sessions.
        subprocess.run(['agent-browser', '--session', browser.session, 'close'],
                       capture_output=True, text=True, timeout=30)


if __name__ == '__main__':
    try:
        main()
    except CheckFailed as error:
        print('FAIL: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        # Raw subprocess exceptions can echo credential arguments.
        print('FAIL: browser regression encountered an unexpected execution error', file=sys.stderr)
        sys.exit(1)
