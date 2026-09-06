package com.aiden0z.guacamole.net.jwt;

import org.apache.guacamole.protocol.GuacamoleConfiguration;

/** Signed authorization metadata stays separate from remote protocol parameters. */
final class AuthorizedConfiguration extends GuacamoleConfiguration {
    final String shareId;
    final String joinId;
    final long expiresAt;

    AuthorizedConfiguration(String shareId, String joinId, long expiresAt) {
        this.shareId = shareId;
        this.joinId = joinId;
        this.expiresAt = expiresAt;
    }
}
