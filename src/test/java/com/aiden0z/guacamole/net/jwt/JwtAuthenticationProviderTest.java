package com.aiden0z.guacamole.net.jwt;

import com.google.inject.AbstractModule;
import com.google.inject.Guice;
import com.google.inject.Injector;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.impl.DefaultClaims;
import org.apache.guacamole.environment.Environment;
import org.apache.guacamole.net.auth.Credentials;
import org.apache.guacamole.protocol.GuacamoleConfiguration;


import javax.servlet.http.HttpServletRequest;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import junit.framework.TestCase;
import org.junit.Before;
import org.junit.Test;


public class JwtAuthenticationProviderTest extends TestCase {

    private static final String secretKey = "secret";

    private Environment environment;

    @Before
    public void setUp() throws Exception {
        environment = mock(Environment.class);

        when(environment.getRequiredProperty(AuthenticationProviderService.SECRET_KEY)).thenReturn(secretKey);

    }

    private Injector getInjector() {
        return Guice.createInjector(
                new AbstractModule() {
                    @Override
                    protected void configure() {
                        bind(Environment.class).toInstance(environment);
                    }
                }
        );
    }

    private HttpServletRequest getHttpServletRequest(String token) {
        HttpServletRequest request = mock(HttpServletRequest.class);

        when(request.getParameter(AuthenticationProviderService.TOKEN_PARAM)).thenReturn(token);

        return  request;

    }

    private Claims getClaims() {

        Map map = new HashMap<String ,String>() {{
            put("GUAC_ID", "12345");
            put("guac.hostname", "192.168.42.2");
            put("guac.protocol", "vnc");
            put("guac.password", "123456");
        }};

        return new DefaultClaims(map);

    }

    @Test
    public void testSuccess() {

        String connectionId = "12345";
        String protocol = "vnc";
        String host = "192.168.42.2";


        Date exp = new Date(System.currentTimeMillis() + 10000L);

        String token = Jwts.builder().setClaims(getClaims()).setExpiration(exp).signWith(SignatureAlgorithm.HS512, secretKey.getBytes()).compact();

        HttpServletRequest request = getHttpServletRequest(token);

        Credentials credentials = new Credentials();
        credentials.setRequest(request);

        JwtAuthenticationProvider authProvider = new JwtAuthenticationProvider(getInjector(), environment);

        Map<String, GuacamoleConfiguration> configs = authProvider.getAuthorizedConfigurations(credentials);

        assertNotNull(configs);
        assertEquals(1, configs.size());
        GuacamoleConfiguration config = configs.get(connectionId);
        assertNotNull(config);
        assertEquals(protocol, config.getProtocol());
        assertEquals(host, config.getParameter("hostname"));
    }

    @Test
    public void testHostnameFailure() {

        // invalid payload
        Date exp = new Date(System.currentTimeMillis() + 10000L);
        Claims claims = getClaims();
        claims.remove("guac.hostname");
        claims.put("guac.hostnam", "192.168.42.2");
        String token = Jwts.builder().setClaims(claims).setExpiration(exp).signWith(SignatureAlgorithm.HS512, secretKey.getBytes()).compact();

        HttpServletRequest request = getHttpServletRequest(token);

        Credentials credentials = new Credentials();
        credentials.setRequest(request);

        JwtAuthenticationProvider authProvider = new JwtAuthenticationProvider(getInjector(), environment);

        Map<String, GuacamoleConfiguration> configs = authProvider.getAuthorizedConfigurations(credentials);

        assertNull(configs);
    }

    @Test
    public void testSignatureFailure() {

        Date exp = new Date(System.currentTimeMillis() + 10000L);
        String token = Jwts.builder().setClaims(getClaims()).setExpiration(exp).signWith(SignatureAlgorithm.HS512, secretKey.getBytes()).compact();

        String[] tokens = token.split("\\.");

        String invalid_token = tokens[0] + "." + tokens[1] + ".invalid_token";

        HttpServletRequest request = getHttpServletRequest(invalid_token);

        Credentials credentials = new Credentials();
        credentials.setRequest(request);

        JwtAuthenticationProvider authProvider = new JwtAuthenticationProvider(getInjector(), environment);

        Map<String, GuacamoleConfiguration> configs = authProvider.getAuthorizedConfigurations(credentials);
        assertNull(configs);
    }

    @Test
    public void testExpirationFailure() {
        // expired jwt

        Date exp = new Date(System.currentTimeMillis() - 10L);
        String token = Jwts.builder().setClaims(getClaims()).setExpiration(exp).signWith(SignatureAlgorithm.HS512, secretKey.getBytes()).compact();

        HttpServletRequest request = getHttpServletRequest(token);

        Credentials credentials = new Credentials();
        credentials.setRequest(request);

        JwtAuthenticationProvider authProvider = new JwtAuthenticationProvider(getInjector(), environment);

        Map<String, GuacamoleConfiguration> configs = authProvider.getAuthorizedConfigurations(credentials);
        assertNull(configs);

    }

}
