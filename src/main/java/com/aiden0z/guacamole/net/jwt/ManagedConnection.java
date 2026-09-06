package com.aiden0z.guacamole.net.jwt;

import java.util.Map;
import org.apache.guacamole.*;
import org.apache.guacamole.environment.Environment;
import org.apache.guacamole.net.*;
import org.apache.guacamole.net.auth.GuacamoleProxyConfiguration;
import org.apache.guacamole.net.auth.simple.SimpleConnection;
import org.apache.guacamole.protocol.*;
import org.apache.guacamole.token.TokenFilter;

/** Connection whose shared authorization is enforced when a tunnel is opened. */
final class ManagedConnection extends SimpleConnection {
    private final AuthorizedConfiguration authorization;
    private final Environment environment;
    private final SharedConnectionRegistry registry;

    ManagedConnection(String id, AuthorizedConfiguration config, Environment environment,
                      SharedConnectionRegistry registry) {
        super(id, id, config, true);
        this.authorization = config;
        this.environment = environment;
        this.registry = registry;
        setParentIdentifier("ROOT");
        // Never expose signed metadata, credentials or raw guacd IDs through REST.
        super.setConfiguration(new GuacamoleConfiguration());
    }

    @Override public GuacamoleTunnel connect(GuacamoleClientInformation info, Map<String, String> tokens)
            throws GuacamoleException {
        if (authorization.joinId != null || authorization.shareId != null) checkExpiration();
        GuacamoleConfiguration config = new GuacamoleConfiguration(authorization);
        if (authorization.joinId != null) {
            return registry.join(authorization.joinId, id -> {
                checkExpiration();
                config.setConnectionID(id);
                ConfiguredGuacamoleSocket socket = dial(config, info);
                try { checkExpiration(); }
                catch (GuacamoleException e) { socket.close(); throw e; }
                return socket;
            }, !"false".equals(config.getParameter("read-only")));
        }
        new TokenFilter(tokens).filterValues(config.getParameters());
        if (authorization.shareId != null) {
            return registry.host(authorization.shareId, authorization.expiresAt, () -> {
                ConfiguredGuacamoleSocket socket = dial(config, info);
                return new SharedConnectionRegistry.Established(socket, socket.getConnectionID());
            });
        }
        return new SimpleGuacamoleTunnel(dial(config, info));
    }

    @Override public GuacamoleTunnel connect(GuacamoleClientInformation info) throws GuacamoleException {
        return connect(info, java.util.Collections.emptyMap());
    }

    private void checkExpiration() throws GuacamoleException {
        if (System.currentTimeMillis() >= authorization.expiresAt)
            throw new GuacamoleSecurityException("Shared authorization expired");
    }

    private ConfiguredGuacamoleSocket dial(GuacamoleConfiguration config, GuacamoleClientInformation info)
            throws GuacamoleException {
        GuacamoleProxyConfiguration proxy = environment.getDefaultGuacamoleProxyConfiguration();
        GuacamoleSocket socket;
        switch (proxy.getEncryptionMethod()) {
            case SSL: socket = new SSLGuacamoleSocket(proxy.getHostname(), proxy.getPort()); break;
            case NONE: socket = new InetGuacamoleSocket(proxy.getHostname(), proxy.getPort()); break;
            default: throw new GuacamoleServerException("Unsupported guacd transport");
        }
        try { return new ConfiguredGuacamoleSocket(socket, config, info); }
        catch (GuacamoleException | RuntimeException e) {
            try { socket.close(); } catch (GuacamoleException ignored) { }
            throw e;
        }
    }
}
