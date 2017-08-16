package com.aiden0z.guacamole.net.jwt;


import com.google.inject.Inject;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import org.apache.guacamole.GuacamoleException;
import org.apache.guacamole.environment.Environment;
import org.apache.guacamole.properties.StringGuacamoleProperty;
import org.apache.guacamole.protocol.GuacamoleConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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

    private final byte[] secret_key;


    protected static final String TOKEN_PARAM = "token";
    protected static final String ID_PARAM = "GUAC_ID";
    protected static final String PARAM_PREFIX = "guac.";

    private final Environment environment;


    @Inject
    public AuthenticationProviderService(Environment environment) throws GuacamoleException {

        this.environment = environment;
        secret_key = environment.getRequiredProperty(SECRET_KEY).getBytes();
    }

    public Map<String, GuacamoleConfiguration> getAuthorizedConfigurations(HttpServletRequest request) {

        String token = request.getParameter(TOKEN_PARAM);

        if (token == null) {
            return null;
        }


        logger.debug("Get jwt token {}", token);

        Claims claims;

        try {

            claims = Jwts.parser().setSigningKey(secret_key).parseClaimsJws(token).getBody();

        } catch (JwtException e) {

            logger.debug("Parse jwt error {}", e.getMessage());

            return null;
        }

        logger.debug("Get claims {}", claims.toString());

        GuacamoleConfiguration config = new GuacamoleConfiguration();

        if (claims.getExpiration() == null) {
            return null;
        }

        for (String key : claims.keySet()) {
            String value;
            try {
                value = claims.get(key, String.class);
            } catch (JwtException e) {

                continue;
            }

            if (!key.startsWith(PARAM_PREFIX) || value == null || value.length() == 0) {
                continue;
            } else if (key.equals(PARAM_PREFIX + "protocol")) {
                config.setProtocol(value);
            } else {
                config.setParameter(key.substring(PARAM_PREFIX.length()), value);
            }

        }

        if (config.getParameter("hostname") == null) {
            return null;
        }

        if (config.getProtocol() == null) {
            return null;
        }

        String id = claims.get(ID_PARAM, String.class);

        if (id == null) {
            id = "DEFAULT";
        }

        Map<String, GuacamoleConfiguration> configs = new HashMap<String, GuacamoleConfiguration>();
        configs.put(id, config);

        return configs;

    }

}
