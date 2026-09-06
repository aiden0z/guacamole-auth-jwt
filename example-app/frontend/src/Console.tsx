import { useRef, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Guacamole from 'guacamole-common-js';
import { guacamoleURL } from './conf';
import { Session, loadSession, saveSession } from './session';
import { bindTunnelLifecycle } from './tunnelLifecycle';



const Console = () => {
    const location = useLocation();
    const [session] = useState<Session | null>(() => location.state as Session | null || loadSession());
    const [readOnly, setReadOnly] = useState(true);
    const [invite, setInvite] = useState('');
    const [shareError, setShareError] = useState('');
    const [busy, setBusy] = useState(false);
    async function share() {
        setBusy(true); setShareError(''); setInvite('');
        try {
            const response = await fetch('/example-api/share', { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
                body: JSON.stringify({ ownerCapability: session?.ownerCapability, readOnly }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Unable to create invitation');
            setInvite(`${window.location.origin}/example-app/join#${result.invitation}`);
        } catch (cause) { setShareError(cause instanceof Error ? cause.message : 'Unable to create invitation'); }
        finally { setBusy(false); }
    }
    const consoleRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState('Connecting…');

    useEffect(() => {
        const container = consoleRef.current;
        if (!container || !session?.authToken || session.dataSource !== 'jwt' || !session.connectionId) {
            setStatus('Return to the example to authorize a connection.');
            return;
        }
        const tunnel = new Guacamole.WebSocketTunnel(guacamoleURL);
        const client = new Guacamole.Client(tunnel);
        const display = client.getDisplay().getElement();
        display.tabIndex = 0;
        container.appendChild(display);
        const mouse = new Guacamole.Mouse(display);
        mouse.onEach(['mousedown', 'mouseup', 'mousemove'], () => { if (!session.readOnly) client.sendMouseState(mouse.currentState, true); });
        const keyboard = new Guacamole.Keyboard(display);
        keyboard.onkeydown = keysym => { if (!session.readOnly) client.sendKeyEvent(1, keysym); return false; };
        keyboard.onkeyup = keysym => { if (!session.readOnly) client.sendKeyEvent(0, keysym); };
        const releaseKeys = () => keyboard.reset();
        display.addEventListener('blur', releaseKeys);
        client.onerror = () => { saveSession(null); setStatus(session.readOnly !== undefined
            ? 'Cannot join: host not connected, host ended, or invitation authorization expired. Ask the host for a new link.'
            : 'Connection failed. Return and authorize a new session.'); };
        client.onstatechange = state => {
            if (state === 3) { setStatus('Connected'); display.focus(); }
            if (state === 5) { saveSession(null); setInvite(''); setStatus(current => current.startsWith('Cannot join:') || current.startsWith('Connection failed.') ? current : 'Disconnected. A new host session needs a new invitation.'); }
        };
        const detachTunnel = bindTunnelLifecycle(tunnel, client, () => client.onerror?.(new Guacamole.Status(512, 'Connection unavailable')));
        client.connect(new URLSearchParams({ GUAC_DATA_SOURCE: 'jwt', GUAC_ID: session.connectionId,
            GUAC_TYPE: 'c', token: session.authToken }).toString());
        return () => {
            detachTunnel();
            keyboard.reset();
            keyboard.onkeydown = keyboard.onkeyup = null;
            display.removeEventListener('blur', releaseKeys);
            client.onerror = null;
            client.onstatechange = null;
            client.disconnect();
            display.remove();
        };
    }, [session]);

    return <main style={{ padding: 16 }}>
        <p><Link to="/">Back to connections</Link> — <span role="status">{status}</span></p>
        {session?.readOnly !== undefined && <p>{session.readOnly ? 'Visitor: read-only' : 'Visitor: control allowed'}. The host ending this session disconnects you.</p>}
        {session?.ownerCapability && <section aria-label="Share session">
            <label><input type="checkbox" checked={!readOnly} onChange={event => { setReadOnly(!event.target.checked); setInvite(''); }} /> Allow visitor control (default is read-only)</label>{' '}
            <button disabled={busy || status !== 'Connected'} onClick={share}>Generate sharing link</button>
            <p>Keep this host connected. Refreshing or leaving closes this shared host; authorize a new session and generate new invitations. Anyone with the link receives the selected permission. Join within five minutes; expiry does not disconnect existing visitors. Invitations are not individually revocable.</p>
            {invite && <p><input aria-label="Sharing link" readOnly value={invite} onFocus={event => event.target.select()} style={{ width: '100%' }} />Copy this link. It applies only to this host session.</p>}
            {shareError && <p role="alert">{shareError}</p>}
        </section>}
        <div ref={consoleRef} tabIndex={0} aria-label="Remote desktop" style={{ outline: 'none' }} />
    </main>;
};
export default Console;
