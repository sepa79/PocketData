package io.pockethive.pocketdata;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import io.pockethive.templating.PortableHttpRequest;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class PopulationHttpTest {
    @Test void sutCookiesAreNotSilentlySharedBetweenCalls() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0); AtomicInteger cookies = new AtomicInteger();
        server.createContext("/start", exchange -> {
            exchange.getRequestBody().readAllBytes();
            if (exchange.getRequestHeaders().getFirst("Cookie") != null) cookies.incrementAndGet();
            exchange.getResponseHeaders().add("Set-Cookie", "synthetic-session=private; Path=/"); exchange.sendResponseHeaders(200, -1); exchange.close();
        }); server.start();
        try (var executor = new HttpFixture(server)) {
            executor.http.execute(call(server)); executor.http.execute(call(server)); assertEquals(0, cookies.get());
        }
    }
    @Test void redirectsAreReturnedWithoutContactingTheRedirectTarget() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicInteger target = new AtomicInteger();
        server.createContext("/start", exchange -> { exchange.getRequestBody().readAllBytes(); exchange.getResponseHeaders().add("Location", "/target"); exchange.sendResponseHeaders(302, -1); exchange.close(); });
        server.createContext("/target", exchange -> { target.incrementAndGet(); exchange.sendResponseHeaders(200, -1); exchange.close(); });
        server.start();
        try (var executor = new HttpFixture(server)) {
            assertEquals(302, executor.http.execute(call(server)).status()); assertEquals(0, target.get());
        }
    }

    @Test void droppedRepliesNeverRepeatTheCreationRequest() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0); AtomicInteger calls = new AtomicInteger();
        server.createContext("/start", exchange -> { calls.incrementAndGet(); exchange.getRequestBody().readAllBytes(); exchange.close(); }); server.start();
        try (var executor = new HttpFixture(server)) {
            assertEquals(502, assertThrows(ApiFailure.class, () -> executor.http.execute(call(server))).status()); assertEquals(1, calls.get());
        }
    }

    @Test void oversizedResponsesFailWithoutProducingABody() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/start", exchange -> { exchange.getRequestBody().readAllBytes(); byte[] body = new byte[1024 * 1024 + 1]; exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close(); }); server.start();
        try (var executor = new HttpFixture(server)) {
            assertEquals(502, assertThrows(ApiFailure.class, () -> executor.http.execute(call(server))).status());
        }
    }

    @Test void slowDripHasATotalDeadlineRatherThanOnlyAnIdleTimeout() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0); AtomicInteger calls = new AtomicInteger();
        server.createContext("/start", exchange -> {
            calls.incrementAndGet(); exchange.getRequestBody().readAllBytes(); exchange.sendResponseHeaders(200, 0);
            try { for (int index = 0; index < 150; index++) { exchange.getResponseBody().write('x'); exchange.getResponseBody().flush(); Thread.sleep(100); } }
            catch (Exception ended) { exchange.close(); }
        }); server.start();
        try (var executor = new HttpFixture(server)) {
            long started = System.nanoTime();
            assertEquals(502, assertThrows(ApiFailure.class, () -> executor.http.execute(call(server))).status());
            long milliseconds = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            assertTrue(milliseconds >= 8000 && milliseconds < 13000, "Deadline was " + milliseconds + "ms"); assertEquals(1, calls.get());
        }
    }

    private static PortableHttpRequest call(HttpServer server) { return new PortableHttpRequest(URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/start"), "POST", "{}", Map.of("Content-Type", "application/json")); }
    private static final class HttpFixture implements AutoCloseable {
        private final HttpServer server;
        private final PopulationHttp http = new PopulationHttp();
        HttpFixture(HttpServer server) { this.server = server; }
        @Override public void close() throws Exception { server.stop(0); http.close(); }
    }
}
