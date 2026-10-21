package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AuthServiceTest {
    private HttpServer server;
    private AuthService auth;
    private final AtomicReference<String> user = new AtomicReference<>(identity("local-admin", "true"));
    private final AtomicInteger calls = new AtomicInteger();
    @BeforeEach void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/auth/me", exchange -> {
            calls.incrementAndGet(); byte[] bytes = user.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start(); auth = new AuthService(new PhAuthClients("http://127.0.0.1:" + server.getAddress().getPort()));
    }
    @AfterEach void stop() { server.stop(0); }
    @Test void anonymousCannotEditAndDoesNotCallAuth() {
        assertFalse(auth.access(null).canEdit());
        assertEquals(401, assertThrows(ApiFailure.class, () -> auth.requireEditor(null)).status());
        assertEquals(0, calls.get());
    }
    @Test void checksFreshIdentityForEveryMutation() {
        auth.requireEditor("Bearer synthetic");
        user.set(identity("local-admin", "false"));
        assertEquals(401, assertThrows(ApiFailure.class, () -> auth.requireEditor("Bearer synthetic")).status());
        assertEquals(2, calls.get());
    }
    @Test void authenticatedViewerCannotEdit() {
        user.set(identity("viewer", "true"));
        assertEquals(403, assertThrows(ApiFailure.class, () -> auth.requireEditor("Bearer synthetic")).status());
    }
    @Test void rejectsForgedIdentityTypes() {
        user.set(identity("local-admin", "\"true\""));
        assertThrows(ApiFailure.class, () -> auth.requireEditor("Bearer synthetic"));
    }
    @Test void neverFollowsAuthRedirects() {
        server.createContext("/redirect/api/auth/me", exchange -> { exchange.getResponseHeaders().add("Location", "/api/auth/me"); exchange.sendResponseHeaders(302, -1); exchange.close(); });
        AuthService redirected = new AuthService(new PhAuthClients("http://127.0.0.1:" + server.getAddress().getPort() + "/redirect"));
        assertEquals(503, assertThrows(ApiFailure.class, () -> redirected.requireEditor("Bearer synthetic")).status());
        assertEquals(0, calls.get());
    }
    @Test void missingAuthDeniesBearerAccess() {
        assertEquals(503, assertThrows(ApiFailure.class, () -> new AuthService(new PhAuthClients("")).access("Bearer synthetic")).status());
    }
    @Test void invalidBearerIsRejectedBeforeIdentityLookup() {
        assertEquals(401, assertThrows(ApiFailure.class, () -> auth.access("Bearer synthetic injected")).status());
        assertEquals(0, calls.get());
    }
    private static String identity(String username, String active) {
        return "{\"id\":\"11111111-1111-1111-1111-111111111111\",\"active\":" + active
            + ",\"username\":\"" + username + "\",\"displayName\":\"Synthetic user\",\"authProvider\":\"DEV\",\"grants\":[]}";
    }
}
