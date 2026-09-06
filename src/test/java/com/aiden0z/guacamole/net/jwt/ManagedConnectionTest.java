package com.aiden0z.guacamole.net.jwt;

import org.junit.Test;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import org.apache.guacamole.GuacamoleException;
import org.apache.guacamole.environment.Environment;
import org.apache.guacamole.protocol.GuacamoleClientInformation;
import java.util.Collections;

public class ManagedConnectionTest {
    @Test public void expiredJoinFailsBeforeNetwork() throws Exception {
        AuthorizedConfiguration c = new AuthorizedConfiguration(null, "0123456789abcdefghijklmnop", 1L);
        c.setParameter("read-only", "true");
        ManagedConnection connection = new ManagedConnection("guest", c, mock(Environment.class), new SharedConnectionRegistry());
        try { connection.connect(new GuacamoleClientInformation(), Collections.emptyMap()); fail(); }
        catch (GuacamoleException expected) { assertEquals("Shared authorization expired", expected.getMessage()); }
    }
}
