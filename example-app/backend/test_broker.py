import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

import jwt
from broker import Settings, create_session

KEY = 'a-test-only-signing-key-with-more-than-32-bytes'
ACCESS = 'test-only-demo-access-token-12345678'


class Upstream(BaseHTTPRequestHandler):
    received = []

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        type(self).received.append((dict(self.headers), parse_qs(body)))
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'authToken': 'opaque-session', 'username': 'demo',
                                    'dataSource': 'jwt', 'availableDataSources': ['jwt'],
                                    'unexpected': 'must-not-leak'}).encode())

    def log_message(self, *_):
        pass


class BrokerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        Upstream.received.clear()
        self.settings = Settings(KEY, ACCESS,
            f'http://127.0.0.1:{self.server.server_port}/guacamole/api/tokens',
            'vnc', 'fixed-host', '5900', '', 'remote-password')

    def call(self, payload, authorization='Bearer ' + ACCESS):
        return create_session(authorization, payload, self.settings)

    def test_unauthorized_request_never_reaches_guacamole(self):
        for auth in ['', 'Bearer wrong', 'Basic ' + ACCESS]:
            self.assertEqual(401, self.call({'connectionId': 'demo'}, auth)[0])
        self.assertEqual([], Upstream.received)

    def test_client_cannot_choose_target_or_inject_claims(self):
        for body in [{'connectionId': 'other'}, {'connectionId': 'demo', 'hostname': 'attacker'},
                     {'connectionId': 'demo', 'guac.password': 'attacker'}, [], None,
                     {'connectionId': 'demo', 'jwtLocation': 'query'}]:
            self.assertIn(self.call(body)[0], (400, 403))
        self.assertEqual([], Upstream.received)

    def test_exchange_supports_header_and_form_without_disclosing_jwt(self):
        for location in ['header', 'body']:
            status, result = self.call({'connectionId': 'demo', 'jwtLocation': location})
            self.assertEqual(200, status)
            self.assertEqual({'authToken': 'opaque-session', 'dataSource': 'jwt',
                              'connectionId': 'demo'}, result)
            headers, body = Upstream.received[-1]
            token = headers.get('Guacamole-Auth-Jwt') if location == 'header' else body['token'][0]
            claims = jwt.decode(token, KEY, algorithms=['HS256'])
            self.assertEqual('fixed-host', claims['guac.hostname'])
            self.assertEqual('remote-password', claims['guac.password'])
            self.assertEqual('5900', claims['guac.port'])
            self.assertEqual('demo', claims['GUAC_ID'])
            self.assertLessEqual(claims['exp'] - claims['iat'], 60)

    def test_invalid_server_secrets_fail_at_startup(self):
        for key, access in [('short', ACCESS), (KEY, ''), (KEY, 'short')]:
            with self.assertRaises(ValueError):
                Settings(key, access, 'http://guacamole/api/tokens', 'vnc', 'fixed', '5900', '', '')



class SharingTest(BrokerTest):
    def test_shareable_session_has_opaque_owner_and_unique_host(self):
        first = self.call({'connectionId': 'demo', 'shareable': True})
        self.assertEqual(200, first[0])
        self.assertRegex(first[1]['ownerCapability'], r'^[A-Za-z0-9_-]{43}$')
        claims = jwt.decode(Upstream.received[-1][0]['Guacamole-Auth-Jwt'], KEY, algorithms=['HS256'])
        self.assertRegex(claims['GUAC_SHARE_ID'], r'^[A-Za-z0-9_-]{43}$')
        self.call({'connectionId': 'demo', 'shareable': True})
        second = jwt.decode(Upstream.received[-1][0]['Guacamole-Auth-Jwt'], KEY, algorithms=['HS256'])
        self.assertNotEqual(claims['GUAC_SHARE_ID'], second['GUAC_SHARE_ID'])

    def test_invite_permissions_and_expiry_limit_join_claims(self):
        import broker
        self.assertTrue(hasattr(broker, 'create_share'), 'share endpoint is missing')
        clock = [1000]
        store = broker.SharingStore(clock=lambda: clock[0])
        owner, share_id = store.host()
        for readonly in [True, False]:
            status, invite = broker.create_share({'ownerCapability': owner, 'readOnly': readonly}, store)
            self.assertEqual(200, status)
            self.assertEqual(1300, invite['expiresAt'])
            clock[0] = 1290
            status, result = broker.create_join({'invitation': invite['invitation']}, self.settings, store)
            self.assertEqual(200, status)
            claims = jwt.decode(Upstream.received[-1][0]['Guacamole-Auth-Jwt'], KEY,
                                algorithms=['HS256'], options={'verify_exp': False})
            self.assertEqual({'GUAC_ID', 'GUAC_JOIN_ID', 'guac.read-only', 'iat', 'exp'}, set(claims))
            self.assertEqual(share_id, claims['GUAC_JOIN_ID'])
            self.assertEqual(str(readonly).lower(), claims['guac.read-only'])
            self.assertEqual(1300, claims['exp'])
            self.assertEqual(readonly, result['readOnly'])
            clock[0] = 1300
            before = len(Upstream.received)
            self.assertEqual(410, broker.create_join({'invitation': invite['invitation']}, self.settings, store)[0])
            self.assertEqual(before, len(Upstream.received))
            clock[0] = 1000

    def test_invitation_requires_owner_and_rejects_parameter_injection(self):
        import broker
        self.assertTrue(hasattr(broker, 'create_share'), 'share endpoint is missing')
        store = broker.SharingStore()
        owner, share_id = store.host()
        for payload in [{'ownerCapability': share_id}, {'ownerCapability': 'wrong'},
                        {'ownerCapability': owner, 'readOnly': 'false'},
                        {'ownerCapability': owner, 'shareId': share_id}, []]:
            self.assertIn(broker.create_share(payload, store)[0], [400, 403])
        _, invite = broker.create_share({'ownerCapability': owner}, store)
        self.assertTrue(invite['readOnly'])
        self.assertEqual(400, broker.create_join({'invitation': invite['invitation'],
                                                'readOnly': False}, self.settings, store)[0])
        self.assertEqual([], Upstream.received)

    def test_storage_capacity_prunes_expired_records(self):
        import broker
        clock = [1000]
        store = broker.SharingStore(limit=1, clock=lambda: clock[0])
        first = store.host()
        self.assertIsNone(store.host())
        clock[0] = 29800
        self.assertIsNotNone(store.host())
        self.assertNotIn(first[0], store.owners)

    def test_concurrent_invitation_creation_respects_capacity(self):
        import broker
        from concurrent.futures import ThreadPoolExecutor
        store = broker.SharingStore(limit=3)
        owner, _ = store.host()
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: broker.create_share({'ownerCapability': owner}, store), range(20)))
        self.assertEqual(3, sum(status == 200 for status, _ in results))
        self.assertEqual(17, sum(status == 503 for status, _ in results))
        self.assertEqual(3, len({result['invitation'] for status, result in results if status == 200}))

    def test_http_share_join_responses_disable_cache(self):
        import broker
        from urllib.request import Request, urlopen
        from urllib.error import HTTPError
        class FixtureHandler(broker.Handler):
            settings = self.settings
        server = ThreadingHTTPServer(('127.0.0.1', 0), FixtureHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for route, payload, expected in [('/share', {'ownerCapability': 'invalid'}, 403),
                                              ('/join', {'invitation': 'invalid'}, 410)]:
                request = Request(f'http://127.0.0.1:{server.server_port}{route}',
                                  data=json.dumps(payload).encode(),
                                  headers={'Content-Type': 'application/json'}, method='POST')
                try:
                    response = urlopen(request)
                except HTTPError as error:
                    response = error
                with response:
                    self.assertEqual(expected, response.status)
                    self.assertEqual('no-store', response.headers['Cache-Control'])
                    self.assertNotIn('invalid', json.dumps(json.load(response)).replace('Invitation invalid', ''))
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
