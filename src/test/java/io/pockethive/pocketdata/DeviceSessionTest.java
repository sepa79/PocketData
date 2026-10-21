package io.pockethive.pocketdata;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class DeviceSessionTest {
    private HttpServer server;
    private MockMvc http;
    private final AtomicInteger status = new AtomicInteger(400);
    private final AtomicReference<String> body = new AtomicReference<>("{\"error\":\"authorization_pending\"}");

    @BeforeEach void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/auth-service/", exchange -> {
            exchange.getRequestBody().readAllBytes();
            byte[] bytes = body.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status.get(), bytes.length);
            exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        PhAuthClients clients = new PhAuthClients("http://127.0.0.1:" + server.getAddress().getPort() + "/auth-service");
        http = MockMvcBuilders.standaloneSetup(new SessionController(new AuthService(clients), new DeviceSessionService(clients)))
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
}
