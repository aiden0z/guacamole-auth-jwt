# guacamole-auth-jwt


## Description

This project is a plugin for [Guacamole](http://guac-dev.org), an HTML5 based
remote desktop solution supporting VNC/RFB, RDP, and SSH.

This plugin is an [authentication provider](http://guacamole.incubator.apache.org/doc/gug/custom-auth.html) that enables stateless, on-the-fly
configuration of remote desktop connections that are authorized using [JSON WEB TOKEN](https://jwt.io/).


## Deployment & Configuration

* [deploy guacamole extension](http://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html)
* [custom authentication](http://guacamole.incubator.apache.org/doc/gug/custom-auth.html)

`guacamole-auth-jwt` adds a config keys to `guacamole.properties`:

 * `secret-key` - The key that will be used to verify the jwt signature.

## Usage

#### First

Use flowing parameters as the payload of the jwt to get auth token from the rest api `/api/tokens` of guacamole web server.

 * `GUAC_ID`  - A connection ID that must be unique per user session, (_required_);
 * `exp` - jwt expired time, (_required_);
 * `guac.protocol` - One of `vnc`, `rdp`, or `ssh`, (_required_);
 * `guac.hostname` - The hostname of the remote desktop server to connect to, (_required_);
 * `guac.port` - The port number to connect to, (_required_);
 * `guac.username` - (_optional_);
 * `guac.password` - (_optional_);
 * `guac.*` - (_optional_) Any other configuration parameters recognized by
    Guacamole can be by prefixing them with `guac.`;

For example, you can use following python code to get token from rest api `/api/tokens` of guacamole web server.

```python
import jwt
import requests
from datetime import datetime, timedelta

payload = {
    'GUAC_ID': 'connection_id',
    'guac.hostname': '192.168.42.2',
    'guac.protocol': "vnc",
    'guac.port': '5901',
    'guac.password': 'password',
    'exp': datetime.utcnow() + timedelta(seconds=3600)
}


jwtToken = jwt.encode(payload, 'secret', 'HS512')

resp = requests.post('https://guacamole-server-domain/api/tokens', data={'token': jwtToken})
```

The json response from `/api/tokens` like:

```
{
  "authToken": "167b2301e6d274be94b94e885cdab5c98b59b6e5a88872620e69391947f39efa",
  "username": "e4695c00-557c-42bb-b209-8ed522a35d8e",
  "dataSource":"jwt",
  "availableDataSources":["jwt"]
}
```

#### Second

Use flowing parameters to initialize the websocket connection to guacamole tunnel endpoint `/websocket-tunnel`.

 * `GUAC_ID` - A connection ID specified in first step;
 * `GUAC_TYPE` - Connection type specified in first step;
 * `GUAC_DATA_SOURCE` - The authentication provider identifier, always is 'jwt';
 * `token` -  Auth token in `/api/tokens` guacamole rest api response json;

 Request tunnel example:

 ```
 wss://guacamole-server-domain/websocket-tunnel?token=167b2301e6d274be94b94e885cdab5c98b59b6e5a88872620e69391947f39efa&GUAC_DATA_SOURCE=jwt&GUAC_ID=connection_id&GUAC_TYPE=c
 ```

## License

MIT License
