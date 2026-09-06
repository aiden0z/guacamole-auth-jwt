import test from 'node:test';
import assert from 'node:assert/strict';
import Guacamole from 'guacamole-common-js';
import { bindTunnelLifecycle } from './tunnelLifecycle.js';

// The real Client owns protocol state and keepalive. Only DOM rendering and
// the network boundary are replaced; neither is exercised by this regression.
Guacamole.Display = function () { this.flush = callback => callback(); };
function connectedFixture() {
    const timers = new Map();
    let nextTimer = 0;
    globalThis.window = {
        setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
        clearTimeout: id => timers.delete(id),
    };
    const tunnel = new Guacamole.Tunnel();
    tunnel.connect = () => tunnel.setState(Guacamole.Tunnel.State.OPEN);
    tunnel.disconnect = () => tunnel.setState(Guacamole.Tunnel.State.CLOSED);
    tunnel.sendMessage = () => {};
    const client = new Guacamole.Client(tunnel);
    const states = [];
    let failures = 0;
    client.onstatechange = state => states.push(state);
    const dispose = bindTunnelLifecycle(tunnel, client, () => failures++);
    client.connect('fixture');
    tunnel.oninstruction('sync', ['1']);
    assert.equal(states.at(-1), Guacamole.Client.State.CONNECTED);
    assert.equal(timers.size, 1);
    return { tunnel, client, states, timers, dispose, failures: () => failures };
}

test('remote tunnel close disconnects actual Client and cancels pending keepalive', () => {
    const fixture = connectedFixture();
    fixture.tunnel.setState(Guacamole.Tunnel.State.CLOSED);
    assert.equal(fixture.states.at(-1), Guacamole.Client.State.DISCONNECTED);
    assert.equal(fixture.timers.size, 0);
});

test('tunnel error reports controlled failure and stops client; cleanup suppresses callbacks', () => {
    const fixture = connectedFixture();
    fixture.tunnel.onerror?.(new Guacamole.Status(512, 'untrusted upstream detail'));
    assert.equal(fixture.failures(), 1);
    assert.equal(fixture.states.at(-1), Guacamole.Client.State.DISCONNECTED);
    assert.equal(fixture.timers.size, 0);
    fixture.dispose();
    assert.equal(fixture.tunnel.onstatechange, null);
    assert.equal(fixture.tunnel.onerror, null);
    fixture.tunnel.setState(Guacamole.Tunnel.State.OPEN);
    fixture.tunnel.setState(Guacamole.Tunnel.State.CLOSED);
    assert.equal(fixture.failures(), 1);
});
