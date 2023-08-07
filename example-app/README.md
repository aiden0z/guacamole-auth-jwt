# Guacamole JWT Authentication Example App

This is example app for [Guacamole JWT Auth](https://github.com/aiden0z/guacamole-auth-jwt) extension.

## Start

1. Build Guacamole JWT Authentication Plugin Jar

```bash
cd ../
./gradle jar
mkdir example-app/guacamole/extensions
cp build/libs/guacamole-auth-jwt-1.5.3.jar example-app/guacamole/extensions/
```

1. Build the frontend app

```bash
cd frontend && npm run build
```

2. Start the docker compose

```bash
docker compose up
```
