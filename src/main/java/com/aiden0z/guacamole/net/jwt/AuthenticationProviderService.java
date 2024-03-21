package com.aiden0z.guacamole.net.jwt;


import com.google.inject.Inject;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.apache.guacamole.GuacamoleException;
import org.apache.guacamole.environment.Environment;
import org.apache.guacamole.properties.StringGuacamoleProperty;
import org.apache.guacamole.protocol.GuacamoleConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.SecretKey;
import javax.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;

public class AuthenticationProviderService {

    private static final Logger logger = LoggerFactory.getLogger(AuthenticationProviderService.class);

    static final StringGuacamoleProperty SECRET_KEY = new StringGuacamoleProperty() {
        @Override
        public String getName() {
            return "secret-key";
        }
    };
    private final SecretKey secretKey;
    public static final String TOKEN_PARAMETER_NAME = "token";
    public static final String TOKEN_HEADER_NAME = "Guacamole-Auth-Jwt";

    protected static final String ID_PARAM = "GUAC_ID";
    protected static final String PARAM_PREFIX = "guac.";


    @Inject
    public AuthenticationProviderService(Environment environment) throws GuacamoleException {
        logger.debug("found secret key: {}", environment.getRequiredProperty(SECRET_KEY));
        secretKey = Keys.hmacShaKeyFor(environment.getRequiredProperty(SECRET_KEY).getBytes());
    }

    public Map<String, GuacamoleConfiguration> getAuthorizedConfigurations(HttpServletRequest request) {

        String token = getToken(request);

        if (token == null || token.isEmpty()) {
            logger.error("Not found jwt.");
            return null;
        }

        logger.debug("Get jwt {}", token);

        Claims claims;

        try {
            claims = Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token).getPayload();
        } catch (JwtException e) {
            logger.error("Parse jwt error: {}", e.getMessage());
            return null;
        }

        logger.debug("Get claims {}", claims.toString());

        GuacamoleConfiguration config = new GuacamoleConfiguration();

        if (claims.getExpiration() == null) {
            logger.error("JWT authentication failed, the JWT must have expiration field.");
            return null;
        }

        for (String key : claims.keySet()) {
            String value;
            try {
                value = claims.get(key, String.class);
            } catch (JwtException e) {

                continue;
            }

            if (!key.startsWith(PARAM_PREFIX) || value == null || value.isEmpty()) {
                continue;
            } else if (key.equals(PARAM_PREFIX + "protocol")) {
                config.setProtocol(value);
            } else {
                config.setParameter(key.substring(PARAM_PREFIX.length()), value);
            }

        }

        if (config.getParameter("hostname") == null) {
            logger.error("JWT authentication failed, the JWT payload must have hostname field.");
            return null;
        }

        if (config.getProtocol() == null) {
            logger.error("JWT authentication failed, the JWT payload must have protocol field.");
            return null;
        }

        String id = claims.get(ID_PARAM, String.class);
        if (id == null) {
            logger.error("JWT authentication failed, the JWT payload must have GUAC_ID field.");
            id = "DEFAULT";
        }

        Map<String, GuacamoleConfiguration> configs = new HashMap<>();
        configs.put(id, config);

        return configs;
    }

    private String getToken(HttpServletRequest request) {

        // first get jwt from header
        String token = request.getHeader(TOKEN_HEADER_NAME);
        if (token != null && !token.isEmpty()) {
            return token;
        }

        return request.getParameter(TOKEN_PARAMETER_NAME);
    }
}
