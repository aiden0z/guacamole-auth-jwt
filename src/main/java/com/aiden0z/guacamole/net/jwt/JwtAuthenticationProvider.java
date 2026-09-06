package com.aiden0z.guacamole.net.jwt;

import com.google.inject.AbstractModule;

import com.google.inject.Guice;
import com.google.inject.Injector;

import org.apache.guacamole.GuacamoleException;
import org.apache.guacamole.environment.Environment;
import org.apache.guacamole.environment.LocalEnvironment;
import org.apache.guacamole.net.auth.Credentials;
import org.apache.guacamole.net.auth.simple.SimpleAuthenticationProvider;
import org.apache.guacamole.protocol.GuacamoleConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

public class JwtAuthenticationProvider extends SimpleAuthenticationProvider {

    private final SharedConnectionRegistry sharedConnections = new SharedConnectionRegistry();
    private final Injector injector;

    private final Environment environment;

    public JwtAuthenticationProvider() throws GuacamoleException {

        environment = LocalEnvironment.getInstance();

        injector = Guice.createInjector(new AbstractModule() {
            @Override
            protected void configure() {
                bind(Environment.class).toInstance(environment);
            }
        });
    }

    public JwtAuthenticationProvider(Injector injector, Environment environment) {
        this.environment = environment;
        this.injector = injector;
    }

    @Override
    public String getIdentifier() {
        return "jwt";
    }

    @Override
    public Map<String, GuacamoleConfiguration> getAuthorizedConfigurations(Credentials credentials) {

        AuthenticationProviderService authService = injector.getInstance(AuthenticationProviderService.class);

        return authService.getAuthorizedConfigurations(credentials.getRequest());

    }

    @Override
    public org.apache.guacamole.net.auth.UserContext getUserContext(
            org.apache.guacamole.net.auth.AuthenticatedUser user) throws GuacamoleException {
        Map<String, GuacamoleConfiguration> configs = getAuthorizedConfigurations(user.getCredentials());
        if (configs == null) return null;
        Map<String, org.apache.guacamole.net.auth.Connection> connections = new java.util.HashMap<>();
        for (Map.Entry<String, GuacamoleConfiguration> entry : configs.entrySet()) {
            connections.put(entry.getKey(), new ManagedConnection(entry.getKey(),
                    (AuthorizedConfiguration) entry.getValue(), environment, sharedConnections));
        }
        return new org.apache.guacamole.net.auth.simple.SimpleUserContext(this, user.getIdentifier(), configs, true) {
            @Override public org.apache.guacamole.net.auth.Directory<org.apache.guacamole.net.auth.Connection>
                    getConnectionDirectory() {
                return new org.apache.guacamole.net.auth.simple.SimpleDirectory<>(connections);
            }
        };
    }
}
