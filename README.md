# guacamole-auth-jwt

## Description

This project is a plugin for [Guacamole](http://guac-dev.org), an HTML5 based remote desktop solution supporting VNC/RFB, RDP, and SSH.

This plugin is an [authentication provider](http://guacamole.incubator.apache.org/doc/gug/custom-auth.html) that enables stateless, on-the-fly configuration of remote desktop connections that are authorized using [JSON WEB TOKEN](https://jwt.io/).

## Deployment

* [deploy guacamole extension](http://guacamole.incubator.apache.org/doc/gug/configuring-guacamole.html)
* [custom authentication](http://guacamole.incubator.apache.org/doc/gug/custom-auth.html)

You should also download all the following dependent jars into the [GUACAMOLE_HOME/lib](https://guacamole.apache.org/doc/gug/configuring-guacamole.html#guacamole-home).

* jackson-annotations-2.12.7.jar
* jackson-core-2.12.7.jar
* jackson-databind-2.12.7.1.jar
* jjwt-api-0.12.5.jar
* jjwt-impl-0.12.5.jar
* jjwt-jackson-0.12.5.jar

## Configuration

Add the JWT secret key to `guacamole.properties` file:

* `secret-key` - The key that will be used to verify the jwt signature.

example

```properties
# jwt secret key for guacamole jwt auth plugin
secret-key: your-complex-secret-length-must-at-least-256-bits
```

## Usage

### Example App

You can use the [example app](./example-app) to learn how to use this plugin.


### Create JWT using Python

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

```json
{
  "authToken": "167b2301e6d274be94b94e885cdab5c98b59b6e5a88872620e69391947f39efa",
  "username": "e4695c00-557c-42bb-b209-8ed522a35d8e",
  "dataSource":"jwt",
  "availableDataSources":["jwt"]
}
```

Use flowing parameters to initialize the websocket connection to guacamole tunnel endpoint `/websocket-tunnel`.

* `GUAC_ID` - A connection ID specified in first step;
* `GUAC_TYPE` - Connection type specified in first step;
* `GUAC_DATA_SOURCE` - The authentication provider identifier, always is 'jwt';
* `token` -  Auth token in `/api/tokens` guacamole rest api response json;

 Request tunnel example:

 ```
 wss://guacamole-server-domain/websocket-tunnel?token=167b2301e6d274be94b94e885cdab5c98b59b6e5a88872620e69391947f39efa&GUAC_DATA_SOURCE=jwt&GUAC_ID=connection_id&GUAC_TYPE=c
 ```

## Release

### Version 1.5.4

* Support Guacamole 1.5.4.
* Additionally, support send JWT via HTTP header `Guacamole-Auth-Jwt` to get the Guacamole Authorization Token.
* Add a [react example app](./example-app) to show how to use guacamole-auth-jwt.

### History Versions

Version number will be same with guacamole start from 0.9.14.

* [Version 0.9.14](https://github.com/aiden0z/guacamole-auth-jwt/releases/download/0.9.14/guacamole-auth-jwt-0.9.14.jar) for guacamole 0.9.14;
* [Version 1.0.1](https://github.com/aiden0z/guacamole-auth-jwt/releases/download/1.0.1/guacamole-auth-jwt-1.0.1.jar) for guacamole 0.9.13-incubating;
* [Version 1.0.0](https://github.com/aiden0z/guacamole-auth-jwt/releases/download/1.0.0/guacamole-auth-jwt-1.0.0.jar) for guacamole 0.9.9;

## License

MIT License
