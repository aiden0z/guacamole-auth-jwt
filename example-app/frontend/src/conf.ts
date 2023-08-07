const guacamoleURL = process.env.REACT_APP_GUACAMOLE_WEBSOCKET_URL || "ws://localhost:8080/guacamole/websocket-tunnel"
const guacamoleTokenAPI = process.env.REACT_APP_GUACAMOLE_AUTH_API || "http://localhost:8080/guacamole/api/tokens"
const guacamoleJWTSecret = process.env.REACT_APP_GUACAMOLE_JWT_SECRET || "secret"

export {guacamoleURL, guacamoleTokenAPI, guacamoleJWTSecret}