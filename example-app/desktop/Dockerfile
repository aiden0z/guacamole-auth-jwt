FROM registry-1.docker.io/library/debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends xvfb x11vnc xterm x11-utils fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 demo
COPY start.sh /usr/local/bin/start-desktop
USER demo
ENV DISPLAY=:0
CMD ["sh", "/usr/local/bin/start-desktop"]
