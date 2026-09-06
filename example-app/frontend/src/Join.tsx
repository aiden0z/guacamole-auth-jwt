import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { openOfficial, saveSession } from './session';

// Capture before rendering so StrictMode does not consume the fragment twice.
const invitation = window.location.pathname.endsWith('/join') ? window.location.hash.slice(1) : '';
if (invitation) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);

export default function Join() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function join(official: boolean) {
        setBusy(true); setError('');
        try {
            const response = await fetch('/example-api/join', { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitation }), cache: 'no-store' });
            const session = await response.json();
            if (!response.ok) throw new Error(session.error || 'Unable to join');
            if (official) openOfficial(session);
            else { saveSession(session); navigate('/console', { replace: true }); }
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to join'); }
        finally { setBusy(false); }
    }
    return <main style={{ maxWidth: 620, margin: '64px auto', padding: 24 }}>
        <h1>Join a shared desktop</h1>
        <p>Anyone holding this link receives the permission selected by its host. The link permits joining for up to five minutes; its expiry does not end an existing visitor connection.</p>
        <p>The host must already be connected. Ending the host session disconnects all visitors. A restarted host needs a new invitation.</p>
        {!invitation && <p role="alert">Invitation missing. Open the complete link provided by the host.</p>}
        {error && <p role="alert">{error}</p>}
        <button disabled={busy || !invitation} onClick={() => join(false)}>Join in Console</button>{' '}
        <button disabled={busy || !invitation} onClick={() => join(true)}>Join in official UI</button>
        <p><Link to="/">Back to connections</Link></p>
    </main>;
}
