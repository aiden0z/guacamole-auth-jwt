// Node 24+: real broker, Guacamole REST API, guacd and VNC frame checks.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = Object.fromEntries(readFileSync('example-app/.env', 'utf8').trim().split('\n').map(line => {
  const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
}));
const origin = process.env.DEMO_ORIGIN || `http://127.0.0.1:${process.env.DEMO_HTTP_PORT || env.DEMO_HTTP_PORT || 8080}`;
const secret = env.JWT_SECRET_KEY;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = claims => {
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
};
const claims = () => ({ GUAC_ID: 'demo', exp: Math.floor(Date.now() / 1000) + 60,
  'guac.protocol': 'vnc', 'guac.hostname': 'desktop', 'guac.port': '5900',
  'guac.password': env.DEMO_VNC_PASSWORD });
const issued = [];
const revoke = async token => {
  await fetch(`${origin}/guacamole/api/tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
};
async function authenticate(jwt, location) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (location === 'header') headers['Guacamole-Auth-Jwt'] = jwt;
  return fetch(`${origin}/guacamole/api/tokens`, { method: 'POST', headers,
    body: location === 'body' ? new URLSearchParams({ token: jwt }) : '' });
}
async function frame(authToken) {
  const query = new URLSearchParams({ token: authToken, GUAC_DATA_SOURCE: 'jwt', GUAC_ID: 'demo',
    GUAC_TYPE: 'c', GUAC_WIDTH: '1024', GUAC_HEIGHT: '768', GUAC_DPI: '96' });
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/guacamole/websocket-tunnel?${query}`);
    let instructions = '';
    const timeout = setTimeout(() => { ws.close(); reject(new Error('No VNC image received')); }, 20000);
    const finish = error => { clearTimeout(timeout); ws.close(); error ? reject(error) : resolve(); };
    ws.onmessage = ({ data }) => {
      instructions += data;
      if (instructions.includes('5.error,')) return finish(new Error('Guacamole protocol error'));
      if (instructions.includes('4.size,') && /(?:3.img,|3.png,|4.jpeg,)/.test(instructions)) finish();
    };
    ws.onerror = () => finish(new Error('WebSocket failed'));
    ws.onclose = () => { clearTimeout(timeout); reject(new Error('Tunnel closed before a VNC frame')); };
  });
}

for (let attempt = 0; ; attempt++) {
  try {
    const response = await fetch(`${origin}/example-api/health`);
    if (response.ok) break;
  } catch {}
  if (attempt >= 90) throw new Error('Example did not become ready');
  await new Promise(resolve => setTimeout(resolve, 1000));
}
// Broker health alone does not prove the Guacamole extension has finished loading.
for (let attempt = 0; ; attempt++) {
  try {
    const response = await authenticate(sign(claims()), 'header');
    if (response.ok) { await revoke((await response.json()).authToken); break; }
  } catch {}
  if (attempt >= 90) throw new Error('JWT extension did not become ready');
  await new Promise(resolve => setTimeout(resolve, 1000));
}

try {
  for (const location of ['header', 'body']) {
    const token = sign(claims()); issued.push(token);
    const response = await authenticate(token, location);
    assert.equal(response.status, 200, `${location} authentication`);
    const result = await response.json();
    assert.equal(result.dataSource, 'jwt');
    try { await frame(result.authToken); } finally { await revoke(result.authToken); }
    console.log(`PASS ${location}: JWT -> Guacamole session -> WebSocket -> VNC image`);
  }
  for (const mutation of [c => { c.exp = 1; }, c => { delete c.exp; },
    c => { delete c['guac.hostname']; }, c => { delete c['guac.protocol']; },
    c => { c.GUAC_ID = 123; }, c => { c['guac.port'] = 5900; }]) {
    const payload = claims(); mutation(payload);
    const token = sign(payload); issued.push(token);
    assert.equal((await authenticate(token, 'body')).status, 403);
  }
  const wrongSignature = sign(claims()).split('.').slice(0, 2).join('.') + '.invalid-signature';
  assert.equal((await authenticate(wrongSignature, 'header')).status, 403);
  const broker = (body, access = env.DEMO_ACCESS_TOKEN) => fetch(`${origin}/example-api/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
    body: JSON.stringify(body),
  });
  assert.equal((await broker({ connectionId: 'demo' }, 'wrong')).status, 401);
  assert.equal((await broker({ connectionId: 'demo', hostname: 'unauthorized' })).status, 400);
  assert.equal((await broker({ connectionId: 'other' })).status, 403);
  for (const location of ['header', 'body']) {
    const response = await broker({ connectionId: 'demo', jwtLocation: location });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), ['authToken', 'connectionId', 'dataSource']);
    try { await frame(result.authToken); } finally { await revoke(result.authToken); }
  }
  console.log('PASS rejected JWTs, broker authorization, fixed target, response redaction, both broker transports');
  if (process.env.COMPOSE_PROJECT_NAME) {
    const logs = execFileSync('docker', ['compose', '-p', process.env.COMPOSE_PROJECT_NAME,
      '-f', 'example-app/docker-compose.yaml', 'logs', '--no-color'], { encoding: 'utf8' });
    for (const value of [secret, env.DEMO_ACCESS_TOKEN, env.DEMO_VNC_PASSWORD, ...issued]) {
      assert.ok(!logs.includes(value), 'Sensitive data appeared in container logs');
    }
    console.log('PASS container logs do not contain tested secrets or JWTs');
  }
} catch (error) {
  console.error('FAIL integration:', error.message);
  process.exitCode = 1;
}
