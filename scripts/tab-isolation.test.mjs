import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const resources = new URL('../src/main/resources/', import.meta.url);
const AUTH = 'GUAC_AUTH_TOKEN';

function storage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, String(value)); },
        removeItem: key => { values.delete(key); }
    };
}

// The real Guacamole 1.6.0 service presents JSON values, not Storage strings.
function delegateFor(shared) {
    return {
        getItem(key) { const value = shared.getItem(key); return value ? JSON.parse(value) : null; },
        setItem(key, value) { shared.setItem(key, JSON.stringify(value)); },
        removeItem(key) { shared.removeItem(key); }
    };
}

function openTab({ shared = storage(), session = storage(), search = '?jwt-tab=1', hash = '', name = '', onWindow = () => {} } = {}) {
    const delegate = delegateFor(shared);
    let decorated = delegate;
    const window = { location: { search, hash }, name };
    onWindow(window);
    Object.defineProperty(window, 'sessionStorage', {
        get() { if (session instanceof Error) throw session; return session; }
    });
    function invoke(definition, values) {
        const names = definition.slice(0, -1);
        return definition.at(-1)(...names.map(name => {
            assert.ok(name in values, `Unexpected dependency ${name}`);
            return values[name];
        }));
    }
    const angular = {
        module(name) {
            assert.equal(name, 'index');
            return { config(definition) {
                invoke(definition, { $provide: {
                    decorator(name, factory) {
                        assert.equal(name, 'localStorageService');
                        decorated = invoke(factory, { $delegate: delegate, $window: window });
                    }
                } });
            } };
        }
    };
    const manifest = JSON.parse(fs.readFileSync(new URL('guac-manifest.json', resources), 'utf8'));
    for (const path of manifest.js ?? []) {
        vm.runInNewContext(fs.readFileSync(new URL(path, resources), 'utf8'), { angular, window, URLSearchParams });
    }
    return decorated;
}

test('independently opened tabs never consume shared or each other\'s auth tokens', () => {
    const shared = storage();
    delegateFor(shared).setItem(AUTH, 'ordinary-token');
    const a = openTab({ shared });
    const b = openTab({ shared });
    assert.equal(a.getItem(AUTH), null);
    assert.equal(b.getItem(AUTH), null);
    a.setItem(AUTH, 'a-token');
    b.setItem(AUTH, 'b-token');
    assert.equal(a.getItem(AUTH), 'a-token');
    b.removeItem(AUTH);
    assert.equal(b.getItem(AUTH), null);
    assert.equal(a.getItem(AUTH), 'a-token');
    assert.equal(delegateFor(shared).getItem(AUTH), 'ordinary-token');
});

test('persisted tab mode survives reload and remains isolated after logout', () => {
    const session = storage();
    const shared = storage();
    openTab({ session, shared }).setItem(AUTH, 'a-token');
    const refreshed = openTab({ session, shared, search: '' });
    assert.equal(refreshed.getItem(AUTH), 'a-token');
    refreshed.removeItem(AUTH);
    delegateFor(shared).setItem(AUTH, 'ordinary-token');
    assert.equal(openTab({ session, shared, search: '' }).getItem(AUTH), null);
});

test('unmarked normal tabs keep the shared service and non-auth keys are delegated', () => {
    const shared = storage();
    const normal = openTab({ shared, search: '' });
    normal.setItem(AUTH, 'ordinary-token');
    assert.equal(openTab({ shared, search: '?jwt-tab=0' }).getItem(AUTH), 'ordinary-token');
    const isolated = openTab({ shared });
    isolated.setItem('GUAC_PREFERENCES', { language: 'zh' });
    assert.deepEqual(normal.getItem('GUAC_PREFERENCES'), { language: 'zh' });
    normal.setItem('GUAC_PREFERENCES', false);
    assert.equal(isolated.getItem('GUAC_PREFERENCES'), false);
    isolated.removeItem('GUAC_PREFERENCES');
    assert.equal(normal.getItem('GUAC_PREFERENCES'), null);
});

test('only the exact opt-in parameter enables isolation, including hash routes', () => {
    const shared = storage();
    delegateFor(shared).setItem(AUTH, 'ordinary-token');
    for (const search of ['?not-jwt-tab=1', '?jwt-tab=10', '?jwt-tab=true', '?next=jwt-tab%3D1'])
        assert.equal(openTab({ shared, search }).getItem(AUTH), 'ordinary-token');
    assert.equal(openTab({ shared, search: '', hash: '#/?jwt-tab=1&data=jwt' }).getItem(AUTH), null);
});

test('denied, absent, and unwritable sessionStorage use page memory without shared fallback', () => {
    for (const session of [new Error('denied'), undefined, {
        getItem() { return null; }, setItem() { throw new Error('quota'); }, removeItem() {}
    }]) {
        const shared = storage();
        delegateFor(shared).setItem(AUTH, 'ordinary-token');
        // Explicit null represents a browser without sessionStorage.
        const currentSession = session === undefined ? null : session;
        const a = openTab({ shared, session: currentSession });
        assert.equal(a.getItem(AUTH), null);
        a.setItem(AUTH, 'a-token');
        assert.equal(a.getItem(AUTH), 'a-token');
        assert.equal(openTab({ shared, session: currentSession }).getItem(AUTH), null);
        a.removeItem(AUTH);
        assert.equal(a.getItem(AUTH), null);
        assert.equal(delegateFor(shared).getItem(AUTH), 'ordinary-token');
    }
});

test('storage failing after login preserves current memory token and logout', () => {
    const backing = storage();
    let fail = false;
    const session = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(method => [method, (...args) => {
        if (fail) throw new Error('storage revoked');
        return backing[method](...args);
    }]));
    const a = openTab({ session });
    a.setItem(AUTH, 'before');
    fail = true;
    a.setItem(AUTH, 'after');
    assert.equal(a.getItem(AUTH), 'after');
    a.removeItem(AUTH);
    assert.equal(a.getItem(AUTH), null);
});


test('isolated bootstrap consumes a bounded window.name token and clears the transport', () => {
    const shared = storage();
    delegateFor(shared).setItem(AUTH, 'ordinary-token');
    let window;
    const isolated = openTab({ shared, name: 'jwt-session:{"authToken":"bootstrap-token"}', onWindow: value => { window = value; } });
    assert.equal(window.name, '');
    assert.equal(isolated.getItem(AUTH), 'bootstrap-token');
    assert.equal(delegateFor(shared).getItem(AUTH), 'ordinary-token');
});

test('malformed bootstrap is cleared and cannot become an auth token', () => {
    for (const payload of ['bad-json', '{}', '{"authToken":12}', '{"authToken":""}', JSON.stringify({ authToken: 'x'.repeat(4097) }), 'x'.repeat(16385)]) {
        let window;
        const isolated = openTab({ name: 'jwt-session:' + payload, onWindow: value => { window = value; } });
        assert.equal(window.name, '');
        assert.equal(isolated.getItem(AUTH), null);
    }
});

test('ordinary window names remain untouched and normal mode never accepts bootstrap', () => {
    let window;
    openTab({ name: 'my-window', onWindow: value => { window = value; } });
    assert.equal(window.name, 'my-window');
    const normal = openTab({ search: '', name: 'jwt-session:{"authToken":"injected-token"}', onWindow: value => { window = value; } });
    assert.equal(normal.getItem(AUTH), null);
    assert.equal(window.name, '');
});
