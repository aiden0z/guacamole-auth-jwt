#!/bin/sh
set -eu
umask 077
x11vnc -storepasswd "$DEMO_VNC_PASSWORD" /tmp/vnc-password >/dev/null 2>&1
Xvfb :0 -screen 0 1024x768x24 -ac &
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if xdpyinfo >/dev/null 2>&1; then break; fi
    sleep 1
done
xterm -geometry 110x35+10+10 -title 'JWT demo desktop' &
exec x11vnc -display :0 -rfbport 5900 -rfbauth /tmp/vnc-password -forever -shared -quiet
