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
import java.nio.charset.StandardCharsets;
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
        secretKey = Keys.hmacShaKeyFor(environment.getRequiredProperty(SECRET_KEY).getBytes(StandardCharsets.UTF_8));
    }

    public Map<String, GuacamoleConfiguration> getAuthorizedConfigurations(HttpServletRequest request) {

        if (request == null) {
            return null;
        }
        String token = getToken(request);

        if (token == null || token.isEmpty()) {
            logger.debug("No JWT supplied; declining authentication.");
            return null;
        }


        try {
            Claims claims = Jwts.parser().verifyWith(secretKey).build()
                    .parseSignedClaims(token).getPayload();
            if (claims.getExpiration() == null) {
                logger.debug("JWT rejected: expiration is required.");
                return null;
            }

            String shareId = sharingId(claims, "GUAC_SHARE_ID");
            String joinId = sharingId(claims, "GUAC_JOIN_ID");
            if (shareId != null && joinId != null) {
                return null;
            }
            AuthorizedConfiguration config = new AuthorizedConfiguration(
                    shareId, joinId, claims.getExpiration().getTime());
            for (String key : claims.keySet()) {
                if (!key.startsWith(PARAM_PREFIX)) {
                    continue;
                }
                if (joinId != null && !key.equals("guac.read-only")) {
                    return null;
                }
                String value = claims.get(key, String.class);
                if (joinId != null && !"true".equals(value) && !"false".equals(value)) {
                    return null;
                }
                if (value == null || value.isEmpty()) {
                    continue;
                }
                if (key.equals(PARAM_PREFIX + "protocol")) {
                    config.setProtocol(value);
                } else {
                    config.setParameter(key.substring(PARAM_PREFIX.length()), value);
                }
            }
            if (joinId != null) {
                if (config.getParameter("read-only") == null) {
                    config.setParameter("read-only", "true");
                }
            }
            else if (config.getParameter("hostname") == null || config.getProtocol() == null) {
                logger.debug("JWT rejected: hostname and protocol are required.");
                return null;
            }

            String id = claims.get(ID_PARAM, String.class);
            if (id == null) {
                id = "DEFAULT"; // Compatibility with releases through 1.5.4.
            } else if (id.trim().isEmpty()) {
                return null;
            }
            Map<String, GuacamoleConfiguration> configs = new HashMap<>();
            configs.put(id, config);
            return configs;
        } catch (JwtException | IllegalArgumentException e) {
            // Exception messages can include claims. Log only the error category.
            logger.debug("JWT rejected: {}", e.getClass().getSimpleName());
            return null;
        }
    }

    private String sharingId(Claims claims, String name) {
        if (!claims.containsKey(name)) {
            return null;
        }
        String value = claims.get(name, String.class);
        if (value == null || !value.matches("[A-Za-z0-9_-]{22,128}")) {
            throw new IllegalArgumentException("Invalid sharing identifier");
        }
        return value;
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
