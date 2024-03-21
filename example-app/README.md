# Guacamole JWT Authentication Example App

This is example app for [Guacamole JWT Auth](https://github.com/aiden0z/guacamole-auth-jwt) extension.

## How to Run

### Install React Dependency

```bash
npm install
```

### Initialize Guacamole Database

```shell
mkdir ./init >/dev/null 2>&1
docker run --rm guacamole/guacamole:1.5.4 /opt/guacamole/bin/initdb.sh --postgresql > ./init/initdb.sql
```

### Build Guacamole JWT Authentication Plugin Jar

```bash
cd ../
./gradlew jar
mkdir example-app/guacamole/extensions
mkdir example-app/guacamole/lib
cp build/libs/guacamole-auth-jwt-1.5.4.jar example-app/guacamole/extensions/
```

### Download the Dependency Jars

Download all dependent jars into into ./guacamole/lib/ dir.

* jackson-annotations-2.12.7.jar
* jackson-core-2.12.7.jar
* jackson-databind-2.12.7.1.jar
* jjwt-api-0.12.5.jar
* jjwt-impl-0.12.5.jar
* jjwt-jackson-0.12.5.jar

### Start

start docker compose

```bash
docker compose up

```
start dev app

```bash
cd frontend && npm run dev
```

 Access http://localhost:8080/example-app to start.
