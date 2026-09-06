export type Session = { authToken: string; dataSource: string; connectionId: string;
    ownerCapability?: string; readOnly?: boolean };
const key = 'jwt-example-session';
let memorySession: Session | null = null;
export function saveSession(session: Session | null) {
    memorySession = session;
    try {
        if (session) sessionStorage.setItem(key, JSON.stringify(session));
        else sessionStorage.removeItem(key);
    } catch { /* Memory fallback never uses cross-tab localStorage. */ }
}
export function loadSession(): Session | null {
    try {
        const session = JSON.parse(sessionStorage.getItem(key) || 'null');
        return session?.authToken && session.dataSource === 'jwt' ? session : memorySession;
    } catch { return memorySession; }
}
export function openOfficial(session: Session) {
    // Guacamole 1.6.0 ClientIdentifier: unpadded base64url(id NUL type NUL source).
    const identifier = btoa(`${session.connectionId}\0c\0${session.dataSource}`)
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = new URL('/guacamole/', window.location.origin);
    url.searchParams.set('jwt-tab', '1');
    url.hash = `/client/${identifier}`;
    window.name = 'jwt-session:' + JSON.stringify({ authToken: session.authToken });
    saveSession(null);
    window.location.replace(url.href);
}
