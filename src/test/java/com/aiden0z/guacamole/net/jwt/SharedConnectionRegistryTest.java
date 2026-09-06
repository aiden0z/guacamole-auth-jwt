package com.aiden0z.guacamole.net.jwt;

import org.junit.Test;
import static org.junit.Assert.*;
import org.apache.guacamole.GuacamoleException;
import org.apache.guacamole.GuacamoleServerException;
import org.apache.guacamole.net.*;
import org.apache.guacamole.io.*;
import org.apache.guacamole.protocol.*;
import java.util.concurrent.*;

public class SharedConnectionRegistryTest {
    static class Socket implements GuacamoleSocket {
        volatile boolean open = true;
        final StringBuilder written = new StringBuilder();
        public GuacamoleReader getReader() { return null; }
        public GuacamoleWriter getWriter() { return new GuacamoleWriter() {
            public void write(char[] b, int o, int n) { written.append(b, o, n); }
            public void write(char[] b) { write(b, 0, b.length); }
            public void writeInstruction(GuacamoleInstruction i) { written.append(i.toString()); }
        }; }
        public boolean isOpen() { return open; }
        public void close() { open = false; }
    }
    @Test public void duplicateOwnerCannotReplaceAndOwnerCloseEndsGuests() throws Exception {
        SharedConnectionRegistry r = new SharedConnectionRegistry();
        Socket owner = new Socket(), guest = new Socket();
        GuacamoleTunnel a = r.host("share", Long.MAX_VALUE, () -> new SharedConnectionRegistry.Established(owner, "$actual"));
        try { r.host("share", Long.MAX_VALUE, () -> { fail("must reject before dial"); return null; }); fail(); }
        catch (GuacamoleException expected) { }
        GuacamoleTunnel b = r.join("share", id -> {
            assertEquals("$actual", id); return guest;
        }, false);
        a.close(); a.close();
        assertFalse(owner.open); assertFalse(guest.open); assertFalse(b.isOpen());
        try { r.join("share", id -> { fail("inactive must not dial"); return null; }, false); fail(); }
        catch (GuacamoleException expected) { }
    }
    @Test public void failedHostReleasesReservation() throws Exception {
        SharedConnectionRegistry r = new SharedConnectionRegistry();
        try { r.host("share", Long.MAX_VALUE, () -> { throw new GuacamoleServerException("fixture"); }); fail(); }
        catch (GuacamoleException expected) { }
        r.host("share", Long.MAX_VALUE, () -> new SharedConnectionRegistry.Established(new Socket(), "$new")).close();
    }
    @Test public void readOnlyFiltersRawInputButAllowsSync() throws Exception {
        SharedConnectionRegistry r = new SharedConnectionRegistry();
        Socket guest = new Socket();
        GuacamoleTunnel host = r.host("share", Long.MAX_VALUE, () -> new SharedConnectionRegistry.Established(new Socket(), "$id"));
        GuacamoleTunnel tunnel = r.join("share", id -> guest, true);
        GuacamoleWriter writer = tunnel.acquireWriter();
        String input = "3.key,2.65,1.1;5.mouse,1.0,1.0,1.1;9.clipboard,1.1,10.text/plain;4.blob,1.1,4.YQ==;4.file,1.1,10.text/plain,1.x;3.put,1.0,1.1,1.x;4.size,3.100,3.100;4.sync,1.1;";
        writer.write(input.toCharArray());
        tunnel.releaseWriter();
        assertEquals("4.sync,1.1;", guest.written.toString());
        host.close();
    }
    @Test public void ownerCloseDuringGuestHandshakeCannotLeaveOrphan() throws Exception {
        SharedConnectionRegistry r = new SharedConnectionRegistry();
        GuacamoleTunnel host = r.host("share", Long.MAX_VALUE, () -> new SharedConnectionRegistry.Established(new Socket(), "$id"));
        Socket guest = new Socket();
        CountDownLatch dialing = new CountDownLatch(1), finish = new CountDownLatch(1);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            Future<Boolean> joined = pool.submit(() -> {
                try {
                    r.join("share", id -> {
                        dialing.countDown();
                        try { if (!finish.await(5, TimeUnit.SECONDS)) throw new GuacamoleServerException("timeout"); }
                        catch (InterruptedException e) { throw new GuacamoleServerException(e); }
                        return guest;
                    }, false);
                    return true;
                } catch (GuacamoleException expected) { return false; }
            });
            assertTrue(dialing.await(5, TimeUnit.SECONDS));
            host.close(); finish.countDown();
            assertFalse(joined.get(5, TimeUnit.SECONDS)); assertFalse(guest.open);
        } finally { finish.countDown(); pool.shutdownNow(); }
    }
    @Test public void closedOwnerCannotBeReplayedIntoAnotherGeneration() throws Exception {
        SharedConnectionRegistry r = new SharedConnectionRegistry();
        r.host("share", Long.MAX_VALUE, () -> new SharedConnectionRegistry.Established(new Socket(), "$first")).close();
        try {
            r.host("share", Long.MAX_VALUE, () -> new SharedConnectionRegistry.Established(new Socket(), "$second"));
            fail("An old authorization must not start a new host generation");
        } catch (GuacamoleException expected) { }
    }
}
