const guacamoleURL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/guacamole/websocket-tunnel`;
export { guacamoleURL };
