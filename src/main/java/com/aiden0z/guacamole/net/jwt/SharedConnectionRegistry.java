package com.aiden0z.guacamole.net.jwt;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import org.apache.guacamole.*;
import org.apache.guacamole.net.*;
import org.apache.guacamole.protocol.*;

/** Instance-local ownership and cleanup of joinable guacd connections. */
final class SharedConnectionRegistry {
    interface HostConnector { Established connect() throws GuacamoleException; }
    interface GuestConnector { GuacamoleSocket connect(String id) throws GuacamoleException; }
    static final class Established {
        final GuacamoleSocket socket;
        final String id;
        Established(GuacamoleSocket socket, String id) { this.socket = socket; this.id = id; }
    }
    private static final class Entry {
        String connectionId;
        volatile boolean closed;
        long expiresAt;
        final Set<GuacamoleTunnel> guests = new HashSet<>();
    }
    private final Map<String, Entry> active = new ConcurrentHashMap<>();

    GuacamoleTunnel host(String id, long expiresAt, HostConnector connector) throws GuacamoleException {
        Entry entry = new Entry();
        entry.expiresAt = expiresAt;
        synchronized (active) {
            long now = System.currentTimeMillis();
            active.entrySet().removeIf(e -> e.getValue().closed && e.getValue().expiresAt <= now);
            if (active.containsKey(id))
                throw new GuacamoleSecurityException("Shared authorization already used");
            if (active.size() >= 10000)
                throw new GuacamoleServerException("Shared connection capacity reached");
            active.put(id, entry);
        }
        try {
            Established connected = connector.connect();
            synchronized (entry) { entry.connectionId = connected.id; }
            return new SimpleGuacamoleTunnel(new DelegatingGuacamoleSocket(connected.socket) {
                private final AtomicBoolean closed = new AtomicBoolean();
                @Override public void close() throws GuacamoleException {
                    if (!closed.compareAndSet(false, true)) return;
                    List<GuacamoleTunnel> guests;
                    synchronized (entry) {
                        entry.closed = true;
                        // Retire this ID until its signed host authorization expires.
                        // Replaying that JWT into a new user context must not resurrect it.
                        guests = new ArrayList<>(entry.guests);
                        entry.guests.clear();
                    }
                    try {
                        for (GuacamoleTunnel guest : guests) closeQuietly(guest);
                    } finally { super.close(); }
                }
            });
        } catch (GuacamoleException | RuntimeException e) {
            active.remove(id, entry);
            throw e;
        }
    }

    GuacamoleTunnel join(String id, GuestConnector connector, boolean readOnly) throws GuacamoleException {
        Entry entry = active.get(id);
        if (entry == null) throw missing();
        String connectionId;
        synchronized (entry) {
            if (entry.closed || entry.connectionId == null) throw missing();
            connectionId = entry.connectionId;
        }
        GuacamoleSocket socket = connector.connect(connectionId);
        // Only rendering acknowledgements/liveness and disconnect may go upstream.
        // In particular, clipboard/file/blob/put, resize, mouse and key are blocked.
        if (readOnly) socket = new FilteredGuacamoleSocket(socket, null, instruction -> {
            String opcode = instruction.getOpcode();
            return Arrays.asList("sync", "ack", "nop", "disconnect").contains(opcode) ? instruction : null;
        });
        final GuacamoleSocket guestSocket = socket;
        final GuacamoleTunnel[] tracked = new GuacamoleTunnel[1];
        GuacamoleTunnel guest = new SimpleGuacamoleTunnel(new DelegatingGuacamoleSocket(guestSocket) {
            private final AtomicBoolean closed = new AtomicBoolean();
            @Override public void close() throws GuacamoleException {
                if (!closed.compareAndSet(false, true)) return;
                synchronized (entry) { entry.guests.remove(tracked[0]); }
                super.close();
            }
        });
        tracked[0] = guest;
        synchronized (entry) {
            if (!entry.closed && active.get(id) == entry) {
                entry.guests.add(guest);
                return guest;
            }
        }
        closeQuietly(guest);
        throw missing();
    }
    private static GuacamoleException missing() {
        return new GuacamoleResourceNotFoundException("Shared connection is not active");
    }
    private static void closeQuietly(GuacamoleTunnel tunnel) {
        try { tunnel.close(); } catch (GuacamoleException ignored) { }
    }
}
