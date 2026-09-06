import Guacamole from 'guacamole-common-js';

/**
 * @param {import('guacamole-common-js').Tunnel} tunnel
 * @param {import('guacamole-common-js').Client} client
 * @param {() => void} onFailure
 */
export function bindTunnelLifecycle(tunnel, client, onFailure) {
    // Client 1.5 consumes instructions but does not forward tunnel closure.
    tunnel.onstatechange = state => {
        if (state === Guacamole.Tunnel.State.CLOSED) client.disconnect();
    };
    tunnel.onerror = () => {
        onFailure();
        client.disconnect();
    };
    return () => {
        tunnel.onstatechange = null;
        tunnel.onerror = null;
    };
}
