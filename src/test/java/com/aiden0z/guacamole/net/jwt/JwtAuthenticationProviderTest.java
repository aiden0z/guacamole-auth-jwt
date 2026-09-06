package com.aiden0z.guacamole.net.jwt;

import com.google.inject.AbstractModule;
import com.google.inject.Guice;
import com.google.inject.Injector;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.apache.guacamole.environment.Environment;
import org.apache.guacamole.net.auth.Credentials;
import org.apache.guacamole.protocol.GuacamoleConfiguration;


import javax.crypto.SecretKey;
import javax.servlet.http.HttpServletRequest;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;


public class JwtAuthenticationProviderTest {

    private static final String secretKey = "aks7z7sdl23@#osdabcedfysdsdsdsdsdsdsdgsdksdlzgsdsd78901212wsyz@&sddj";

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

        when(request.getParameter(AuthenticationProviderService.TOKEN_PARAMETER_NAME)).thenReturn(token);

        return  request;

    }

    private Map<String, String> getClaims() {

        return new HashMap<String ,String>() {{
            put("GUAC_ID", "12345");
            put("guac.hostname", "192.168.42.2");
            put("guac.protocol", "vnc");
            put("guac.password", "123456");
        }};
    }

    @Test
    public void testSuccess() {

        String connectionId = "12345";
        String protocol = "vnc";
        String host = "192.168.42.2";


        Date exp = new Date(System.currentTimeMillis() + 10000L);

        SecretKey key = Keys.hmacShaKeyFor(secretKey.getBytes());
        String token = Jwts.builder().claims(getClaims()).expiration(exp).signWith(key, Jwts.SIG.HS512).compact();

        HttpServletRequest request = getHttpServletRequest(token);

        Credentials credentials = new Credentials("", "", request);
        JwtAuthenticationProvider authProvider = new JwtAuthenticationProvider(getInjector(), environment);

        Map<String, GuacamoleConfiguration> configs = authProvider.getAuthorizedConfigurations(credentials);

        Assert.assertNotNull(configs);
        Assert.assertEquals(1, configs.size());
        GuacamoleConfiguration config = configs.get(connectionId);
        Assert.assertNotNull(config);
        Assert.assertEquals(protocol, config.getProtocol());
        Assert.assertEquals(host, config.getParameter("hostname"));
    }

    @Test
    public void testHostnameFailure() {

        // invalid payload
        Date exp = new Date(System.currentTimeMillis() + 10000L);
        Map<String, String> claims = getClaims();
        claims.remove("guac.hostname");
        claims.put("guac.hostnam", "192.168.42.2");
        SecretKey key = Keys.hmacShaKeyFor(secretKey.getBytes());
        String token = Jwts.builder().claims(claims).expiration(exp).signWith(key, Jwts.SIG.HS512).compact();
        HttpServletRequest request = getHttpServletRequest(token);
        Credentials credentials = new Credentials("", "", request);

        JwtAuthenticationProvider authProvider = new JwtAuthenticationProvider(getInjector(), environment);

        Map<String, GuacamoleConfiguration> configs = authProvider.getAuthorizedConfigurations(credentials);

        Assert.assertNull(configs);
    }

    @Test
    public void testSignatureFailure() {

        Date exp = new Date(System.currentTimeMillis() + 10000L);
        SecretKey key = Keys.hmacShaKeyFor(secretKey.getBytes());
        String token = Jwts.builder().claims(getClaims()).expiration(exp).signWith(key, Jwts.SIG.HS512).compact();

        String[] tokens = token.split("\\.");
        String invalid_token = tokens[0] + "." + tokens[1] + ".invalid_token";

        HttpServletRequest request = getHttpServletRequest(invalid_token);
        Credentials credentials = new Credentials("", "", request);
        credentials.setRequest(request);

        JwtAuthenticationProvider authProvider = new JwtAuthenticationProvider(getInjector(), environment);
        Map<String, GuacamoleConfiguration> configs = authProvider.getAuthorizedConfigurations(credentials);
        Assert.assertNull(configs);
    }

    @Test
    public void testExpirationFailure() {
        // expired jwt

        Date exp = new Date(System.currentTimeMillis() - 10L);
        SecretKey key = Keys.hmacShaKeyFor(secretKey.getBytes());
        String token = Jwts.builder().claims(getClaims()).expiration(exp).signWith(key, Jwts.SIG.HS512).compact();
        HttpServletRequest request = getHttpServletRequest(token);
        Credentials credentials = new Credentials("", "", request);
        JwtAuthenticationProvider authProvider = new JwtAuthenticationProvider(getInjector(), environment);

        Map<String, GuacamoleConfiguration> configs = authProvider.getAuthorizedConfigurations(credentials);
        Assert.assertNull(configs);

    }


    private Map<String, GuacamoleConfiguration> authorize(Map<String, Object> claims, boolean header) {
        String token = Jwts.builder().claims(claims)
                .signWith(Keys.hmacShaKeyFor(secretKey.getBytes()), Jwts.SIG.HS512).compact();
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader(AuthenticationProviderService.TOKEN_HEADER_NAME)).thenReturn(header ? token : null);
        when(request.getParameter(AuthenticationProviderService.TOKEN_PARAMETER_NAME)).thenReturn(header ? null : token);
        return new JwtAuthenticationProvider(getInjector(), environment)
                .getAuthorizedConfigurations(new Credentials("", "", request));
    }

    private Map<String, Object> validClaims() {
        Map<String, Object> claims = new HashMap<>(getClaims());
        claims.put("exp", new Date(System.currentTimeMillis() + 60000));
        return claims;
    }

    @Test
    public void headerAuthenticatesWithoutFormToken() {
        Assert.assertNotNull(authorize(validClaims(), true));
    }

    @Test
    public void missingExpirationIsRejected() {
        Map<String, Object> claims = validClaims();
        claims.remove("exp");
        Assert.assertNull(authorize(claims, false));
    }

    @Test
    public void wrongIdTypeIsRejectedWithoutThrowing() {
        Map<String, Object> claims = validClaims();
        claims.put("GUAC_ID", 123);
        Assert.assertNull(authorize(claims, false));
    }

    @Test
    public void emptyIdIsRejected() {
        Map<String, Object> claims = validClaims();
        claims.put("GUAC_ID", " ");
        Assert.assertNull(authorize(claims, false));
    }

    @Test
    public void missingIdRetainsLegacyDefault() {
        Map<String, Object> claims = validClaims();
        claims.remove("GUAC_ID");
        Assert.assertTrue(authorize(claims, false).containsKey("DEFAULT"));
    }

    @Test
    public void malformedConnectionParameterIsRejectedInsteadOfSilentlyDropped() {
        Map<String, Object> claims = validClaims();
        claims.put("guac.port", 5901);
        Assert.assertNull(authorize(claims, false));
    }

    @Test
    public void absentRequestDeclinesAuthentication() {
        Assert.assertNull(new JwtAuthenticationProvider(getInjector(), environment)
                .getAuthorizedConfigurations(mock(Credentials.class)));
    }

    @Test
    public void invalidHeaderDoesNotFallBackToValidBody() {
        String token = Jwts.builder().claims(validClaims())
                .signWith(Keys.hmacShaKeyFor(secretKey.getBytes()), Jwts.SIG.HS512).compact();
        HttpServletRequest request = getHttpServletRequest(token);
        when(request.getHeader(AuthenticationProviderService.TOKEN_HEADER_NAME)).thenReturn("invalid");
        Assert.assertNull(new JwtAuthenticationProvider(getInjector(), environment)
                .getAuthorizedConfigurations(new Credentials("", "", request)));
    }

    @Test
    public void debugLogsDoNotDiscloseKeyTokenOrCredentials() throws Exception {
        ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger)
                org.slf4j.LoggerFactory.getLogger(AuthenticationProviderService.class);
        ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender =
                new ch.qos.logback.core.read.ListAppender<>();
        appender.start();
        ch.qos.logback.classic.Level previous = logger.getLevel();
        logger.setLevel(ch.qos.logback.classic.Level.DEBUG);
        logger.addAppender(appender);
        try {
            Map<String, Object> claims = validClaims();
            claims.put("guac.password", "sensitive-remote-password-marker");
            String token = Jwts.builder().claims(claims)
                    .signWith(Keys.hmacShaKeyFor(secretKey.getBytes()), Jwts.SIG.HS512).compact();
            AuthenticationProviderService service = new AuthenticationProviderService(environment);
            Assert.assertNotNull(service.getAuthorizedConfigurations(getHttpServletRequest(token)));
            claims.put("exp", new Date(System.currentTimeMillis() - 60000));
            String expired = Jwts.builder().claims(claims)
                    .signWith(Keys.hmacShaKeyFor(secretKey.getBytes()), Jwts.SIG.HS512).compact();
            Assert.assertNull(service.getAuthorizedConfigurations(getHttpServletRequest(expired)));
            for (ch.qos.logback.classic.spi.ILoggingEvent event : appender.list) {
                String message = event.getFormattedMessage();
                Assert.assertFalse(message.contains(secretKey));
                Assert.assertFalse(message.contains(token));
                Assert.assertFalse(message.contains(expired));
                Assert.assertFalse(message.contains("sensitive-remote-password-marker"));
            }
        } finally {
            logger.detachAppender(appender);
            logger.setLevel(previous);
            appender.stop();
        }
    }
    @Test
    public void sharedJoinNeedsNoRemoteCredentialsAndDefaultsReadOnly() {
        Map<String, Object> claims = new HashMap<>();
        claims.put("GUAC_ID", "guest");
        claims.put("GUAC_JOIN_ID", "0123456789abcdefghijklmnop");
        claims.put("exp", new Date(System.currentTimeMillis() + 60000));
        Map<String, GuacamoleConfiguration> configs = authorize(claims, true);
        Assert.assertNotNull(configs);
        Assert.assertEquals("true", configs.get("guest").getParameter("read-only"));
        Assert.assertNull(configs.get("guest").getConnectionID());
    }

    @Test
    public void sharedJoinRejectsTargetOverridesAndAmbiguousRoles() {
        Map<String, Object> claims = validClaims();
        claims.put("GUAC_JOIN_ID", "0123456789abcdefghijklmnop");
        Assert.assertNull(authorize(claims, true));
        claims.put("GUAC_SHARE_ID", "abcdefghijklmnop0123456789");
        Assert.assertNull(authorize(claims, false));
    }

    @Test
    public void sharingRejectsMalformedIds() {
        Map<String, Object> claims = validClaims();
        claims.put("GUAC_SHARE_ID", "demo");
        Assert.assertNull(authorize(claims, true));
        claims.put("GUAC_SHARE_ID", 123);
        Assert.assertNull(authorize(claims, true));
    }
}
