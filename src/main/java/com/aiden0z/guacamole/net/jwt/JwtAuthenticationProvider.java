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

import java.util.Map;

public class JwtAuthenticationProvider extends SimpleAuthenticationProvider {

    private final Injector injector;

    private final Environment environment;

    public JwtAuthenticationProvider() throws GuacamoleException {

        environment = new LocalEnvironment();

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

}
