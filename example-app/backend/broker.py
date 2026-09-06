"""Local single-user example broker. Replace its access token with portal authorization in production."""
import hmac
import json
import os
import secrets
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import jwt


@dataclass(frozen=True)
class Settings:
    signing_key: str
    access_token: str
    guacamole_url: str
    protocol: str
    hostname: str
    port: str
    username: str
    password: str

    def __post_init__(self):
        if len(self.signing_key.encode('utf-8')) < 32 or len(self.access_token) < 32:
            raise ValueError('Configure independent JWT_SECRET_KEY and DEMO_ACCESS_TOKEN of at least 32 bytes/characters')
        if self.signing_key == self.access_token:
            raise ValueError('The access token must not be the JWT signing key')

    @classmethod
    def from_environment(cls):
        return cls(os.environ['JWT_SECRET_KEY'], os.environ['DEMO_ACCESS_TOKEN'],
                   os.environ.get('GUACAMOLE_TOKEN_URL', 'http://guacamole:8080/guacamole/api/tokens'),
                   'vnc', os.environ.get('DEMO_HOSTNAME', 'desktop'),
                   os.environ.get('DEMO_PORT', '5900'), '', os.environ['DEMO_VNC_PASSWORD'])


class SharingStore:
    """Bounded process-local capabilities; restart invalidates all invitations."""
    def __init__(self, limit=1024, clock=time.time):
        self.limit = limit
        self.clock = clock
        self.lock = threading.RLock()
        self.owners = {}
        self.invitations = {}

    def prune(self):
        now = self.clock()
        for records in (self.owners, self.invitations):
            for key in list(records):
                if records[key]['expiresAt'] <= now:
                    del records[key]

    def host(self):
        with self.lock:
            self.prune()
            if len(self.owners) >= self.limit:
                return None
            owner = secrets.token_urlsafe(32)
            record = {'shareId': secrets.token_urlsafe(32), 'expiresAt': int(self.clock()) + 28800}
            self.owners[owner] = record
            return owner, record['shareId']


SHARING = SharingStore()


def create_session(authorization, payload, settings, store=SHARING):
    expected = ('Bearer ' + settings.access_token).encode('utf-8')
    if not hmac.compare_digest(authorization.encode('utf-8'), expected):
        return 401, {'error': 'Invalid demo access token'}
    if not isinstance(payload, dict) or set(payload) - {'connectionId', 'jwtLocation', 'shareable'}:
        return 400, {'error': 'Only connectionId, jwtLocation and shareable are accepted'}
    if payload.get('connectionId') != 'demo':
        return 403, {'error': 'Connection not authorized'}
    location = payload.get('jwtLocation', 'header')
    if location not in ('header', 'body'):
        return 400, {'error': 'Invalid JWT location'}

    if type(payload.get('shareable', False)) is not bool:
        return 400, {'error': 'shareable must be a boolean'}
    host = store.host() if payload.get('shareable') else None
    if payload.get('shareable') and host is None:
        return 503, {'error': 'Sharing capacity reached; try again later'}
    now = int(time.time())
    # The browser never controls host, credentials, protocol, claims, or lifetime.
    claims = {'GUAC_ID': 'demo', 'guac.protocol': settings.protocol,
                        'guac.hostname': settings.hostname, 'guac.port': settings.port,
                        'guac.username': settings.username, 'guac.password': settings.password,
                        'iat': now, 'exp': now + 60}
    if host:
        claims['GUAC_SHARE_ID'] = host[1]
    status, result = exchange(claims, location, settings)
    if host:
        if status == 200:
            result['ownerCapability'] = host[0]
        else:
            with store.lock:
                store.owners.pop(host[0], None)
    return status, result


def exchange(claims, location, settings):
    token = jwt.encode(claims, settings.signing_key, algorithm='HS256')
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    body = b''
    if location == 'header':
        headers['Guacamole-Auth-Jwt'] = token
    else:
        body = urlencode({'token': token}).encode('ascii')
    request = Request(settings.guacamole_url, data=body, headers=headers, method='POST')
    try:
        with urlopen(request, timeout=10) as response:
            result = json.load(response)
        if not isinstance(result, dict) or not isinstance(result.get('authToken'), str) or not result['authToken']:
            raise ValueError('Invalid upstream response')
        if result.get('dataSource') != 'jwt':
            raise ValueError('Unexpected authentication provider')
        return 200, {'authToken': result['authToken'], 'dataSource': 'jwt', 'connectionId': 'demo'}
    except (HTTPError, URLError, TimeoutError, ValueError, OSError):
        # Upstream response bodies may contain sensitive data. Never echo/log them.
        return 502, {'error': 'Guacamole authentication unavailable'}


def create_share(payload, store=SHARING):
    if (not isinstance(payload, dict) or set(payload) - {'ownerCapability', 'readOnly'}
            or not isinstance(payload.get('ownerCapability'), str)
            or type(payload.get('readOnly', True)) is not bool):
        return 400, {'error': 'Expected ownerCapability and optional boolean readOnly'}
    with store.lock:
        store.prune()
        owner = store.owners.get(payload['ownerCapability'])
        if owner is None:
            return 403, {'error': 'Host permission missing or expired; authorize a new host session'}
        if len(store.invitations) >= store.limit:
            return 503, {'error': 'Invitation capacity reached; try again later'}
        invitation = secrets.token_urlsafe(32)
        record = {'shareId': owner['shareId'], 'readOnly': payload.get('readOnly', True),
                  'expiresAt': min(int(store.clock()) + 300, owner['expiresAt'])}
        store.invitations[invitation] = record
        return 200, {'invitation': invitation, 'expiresAt': record['expiresAt'],
                     'readOnly': record['readOnly']}


def create_join(payload, settings, store=SHARING):
    if (not isinstance(payload, dict) or set(payload) != {'invitation'}
            or not isinstance(payload.get('invitation'), str)):
        return 400, {'error': 'Expected invitation capability only'}
    with store.lock:
        store.prune()
        record = store.invitations.get(payload['invitation'])
        if record is None:
            return 410, {'error': 'Invitation invalid or expired; ask the host for a new link'}
        now = int(store.clock())
        claims = {'GUAC_ID': 'demo', 'GUAC_JOIN_ID': record['shareId'],
                  'guac.read-only': str(record['readOnly']).lower(),
                  'iat': now, 'exp': min(now + 60, record['expiresAt'])}
    status, result = exchange(claims, 'header', settings)
    if status == 200:
        result['readOnly'] = record['readOnly']
    return status, result


class Handler(BaseHTTPRequestHandler):
    settings = None

    def do_GET(self):
        if self.path == '/health':
            self.respond(200, {'status': 'ok'})
        else:
            self.respond(404, {'error': 'Not found'})

    def do_POST(self):
        if self.path not in ('/session', '/share', '/join'):
            self.respond(404, {'error': 'Not found'})
            return
        if self.headers.get_content_type() != 'application/json':
            self.respond(415, {'error': 'Expected application/json'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 4096:
                self.respond(413, {'error': 'Invalid request size'})
                return
            payload = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError):
            self.respond(400, {'error': 'Invalid JSON'})
            return
        if self.path == '/session':
            result = create_session(self.headers.get('Authorization', ''), payload, self.settings)
        elif self.path == '/share':
            result = create_share(payload)
        else:
            result = create_join(payload, self.settings)
        self.respond(*result)

    def respond(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        # Do not log request URLs or authentication data.
        pass


def main():
    Handler.settings = Settings.from_environment()
    server = ThreadingHTTPServer(('0.0.0.0', 8000), Handler)
    server.serve_forever()


if __name__ == '__main__':
    main()
