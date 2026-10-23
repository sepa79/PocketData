package io.pockethive.pocketdata;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import io.pockethive.auth.contract.PocketHiveBrowserAuth;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class DeviceSessionTest {
    private HttpServer server;
    private MockMvc http;
    private final AtomicInteger revocations = new AtomicInteger();
    private final AtomicInteger status = new AtomicInteger(400);
    private final AtomicReference<String> body = new AtomicReference<>("{\"error\":\"authorization_pending\"}");

    @BeforeEach void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/auth-service/", exchange -> {
            exchange.getRequestBody().readAllBytes();
            if (exchange.getRequestURI().getPath().equals("/auth-service/oauth/revoke")) revocations.incrementAndGet();
            byte[] bytes = body.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status.get(), bytes.length);
            exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        http = sessionApi(false);
    }

    private MockMvc sessionApi(boolean allowRemoteHttp) {
        PhAuthClients clients = new PhAuthClients("http://127.0.0.1:" + server.getAddress().getPort() + "/auth-service", allowRemoteHttp);
        return MockMvcBuilders.standaloneSetup(new SessionController(new AuthService(clients), new DeviceSessionService(clients)))
            .setControllerAdvice(new ApiErrors()).addFilter(new SecurityHeaders()).build();
    }

    @AfterEach void stop() { server.stop(0); }

    @Test void anonymousSessionIsExplicitlyReadOnly() throws Exception {
        http.perform(get("/api/session")).andExpect(status().isOk())
            .andExpect(jsonPath("$.canEdit").value(false)).andExpect(jsonPath("$.configured").value(true));
    }

    @Test void pendingAndDenialRemainProtocolErrors() throws Exception {
        http.perform(post("/api/session/device/poll").contentType("application/json").content("{\"deviceCode\":\"synthetic\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("authorization_pending"));
        body.set("{\"error\":\"access_denied\",\"error_description\":\"Never expose this\"}");
        http.perform(post("/api/session/device/poll").contentType("application/json").content("{\"deviceCode\":\"synthetic\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("access_denied"));
    }

    @Test void rejectsCallbackAndUnexpectedInput() throws Exception {
        http.perform(post("/api/session/device/poll").contentType("application/json").content("{\"deviceCode\":\"synthetic\",\"callback\":\"http://evil.invalid\"}"))
            .andExpect(status().isBadRequest());
        http.perform(post("/api/session/exchange").contentType("application/json").content("{}"))
            .andExpect(status().isNotFound());
        http.perform(get("/api/session/config")).andExpect(status().isNotFound());
    }

    @Test void outageDoesNotBecomeAnonymousSuccessOrAnotherLoginFlow() throws Exception {
        status.set(500); body.set("{\"error\":\"private server details\"}");
        http.perform(post("/api/session/device/start")).andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error").value("PocketHive authentication is unavailable."));
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://ph.example.test/auth-service", "http://localhost:8088/auth-service",
        "http://127.0.0.1:8088/auth-service", "http://[::1]:8088/auth-service"})
    void secureAndLoopbackDeviceEndpointsWorkWithoutRemoteHttpPermission(String issuer) throws Exception {
        assertDeviceSession(issuer, false);
    }

    @Test void remoteHttpDeviceEndpointsWorkOnlyWithExplicitPermission() throws Exception {
        assertDeviceSession("http://lab.example:8088/auth-service", true);
    }

    @Test void internalHttpTransportDoesNotGrantRemotePublicHttpPermission() throws Exception {
        String issuer = "http://lab.example:8088/auth-service";
        status.set(200);
        body.set(authorization(issuer));
        http.perform(post("/api/session/device/start")).andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error").value("PocketHive authentication is unavailable."));
        body.set(configuration(issuer));
        http.perform(post("/api/session/logout").header("Authorization", token()))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error").value("PocketHive authentication is unavailable."));
        assertEquals(0, revocations.get());
    }

    @Test void missingAuthConfigurationRemainsAnonymousAndCannotStartADeviceSession() throws Exception {
        PhAuthClients clients = new PhAuthClients("", false);
        MockMvc unconfigured = MockMvcBuilders.standaloneSetup(
            new SessionController(new AuthService(clients), new DeviceSessionService(clients)))
            .setControllerAdvice(new ApiErrors()).build();
        unconfigured.perform(get("/api/session")).andExpect(status().isOk())
            .andExpect(jsonPath("$.canEdit").value(false)).andExpect(jsonPath("$.configured").value(false));
        unconfigured.perform(post("/api/session/device/start")).andExpect(status().isServiceUnavailable());
    }

    private void assertDeviceSession(String issuer, boolean allowRemoteHttp) throws Exception {
        http = sessionApi(allowRemoteHttp);
        status.set(200);
        body.set(authorization(issuer));
        http.perform(post("/api/session/device/start")).andExpect(status().isOk())
            .andExpect(jsonPath("$.verification_uri").value(issuer + "/oauth/device_verification"));
        body.set(configuration(issuer));
        http.perform(post("/api/session/logout").header("Authorization", token())).andExpect(status().isOk())
            .andExpect(jsonPath("$.logoutUrl").value(issuer + "/oauth/device/logout?client_id=pocketdata-device"));
        assertEquals(1, revocations.get());
    }

    private static String authorization(String issuer) {
        return """
            {"device_code":"synthetic-secret","user_code":"ABCD-EFGH",
             "verification_uri":"%s/oauth/device_verification",
             "verification_uri_complete":"%s/oauth/device_verification?user_code=ABCD-EFGH",
             "expires_in":300}
            """.formatted(issuer, issuer);
    }

    private static String configuration(String issuer) {
        return "{\"logoutUri\":\"" + issuer + "/oauth/device/logout?client_id=pocketdata-device\"}";
    }

    private static String token() { return "Bearer " + PocketHiveBrowserAuth.TOKEN_PREFIX + "synthetic"; }
}
