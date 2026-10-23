package io.pockethive.pocketdata.mcp;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import io.modelcontextprotocol.spec.McpSchema;
import io.pockethive.pocketdata.*;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class McpHttpTest {
    static final ObjectMapper JSON = new ObjectMapper();
    static final Path DIRECTORY;
    static final HttpServer IDENTITY;
    static final HttpServer SUT;
    static final AtomicInteger AUTH_STATUS = new AtomicInteger(200);
    static final AtomicInteger REQUESTS = new AtomicInteger();
    static {
        try {
            DIRECTORY = Files.createTempDirectory("pd-mcp-test-");
            IDENTITY = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            IDENTITY.createContext("/api/auth/me", exchange -> {
                String bearer = exchange.getRequestHeaders().getFirst("Authorization");
                int status = AUTH_STATUS.get();
                boolean admin = "Bearer synthetic-admin".equals(bearer);
                if (!admin && !"Bearer synthetic-viewer".equals(bearer)) status = 401;
                byte[] body = JSON.writeValueAsBytes(status == 200 ? Map.of("id", "11111111-1111-1111-1111-111111111111",
                    "username", admin ? "local-admin" : "local-viewer", "displayName", "Synthetic", "active", true,
                    "authProvider", "DEV", "grants", List.of()) : Map.of("error", "private-diagnostic"));
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, body.length); exchange.getResponseBody().write(body); exchange.close();
            }); IDENTITY.start();
            SUT = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            SUT.createContext("/cards", exchange -> {
                REQUESTS.incrementAndGet();
                byte[] body = ("<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:c=\"urn:example:cards\"><soap:Body>"
                    + "<c:CreateCardResponse><c:cardNumber>000-synthetic</c:cardNumber></c:CreateCardResponse></soap:Body></soap:Envelope>").getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close();
            }); SUT.start();
        } catch (Exception failure) { throw new ExceptionInInitializerError(failure); }
    }
    @LocalServerPort int port;
    @Autowired CatalogStore catalog;
    @Autowired PopulationDrafts drafts;
    @Autowired PopulationPreparation preparation;
    @Autowired PopulationJobs jobs;
    @MockitoBean RedisDatasets redis;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry properties) {
        properties.add("POCKETDATA_DATA_DIR", DIRECTORY::toString);
        properties.add("POCKETHIVE_AUTH_BASE_URL", () -> "http://127.0.0.1:" + IDENTITY.getAddress().getPort());
        properties.add("POCKETDATA_REDIS_URL", () -> "");
    }
    @BeforeEach void prepare() throws Exception {
        AUTH_STATUS.set(200); REQUESTS.set(0);
        catalog.save(new CatalogSnapshot(catalog.read().revision(), List.of(new SutDefinition("qa", "Synthetic", "", Map.of("cards", "http://127.0.0.1:" + SUT.getAddress().getPort() + "/cards")))));
        when(redis.require("qa", "cards")).thenReturn(new DatasetDefinition("qa", "cards", "Synthetic", List.of(new RecordField("cardNumber", "string", true)), List.of("ready")));
        when(redis.list("qa")).thenReturn(List.of());
    }
    @AfterAll static void close() throws Exception {
        IDENTITY.stop(0); SUT.stop(0);
        try (var paths = Files.walk(DIRECTORY)) { for (var path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(path); }
    }
    @Test void discoveryAndPublicReadsUseTheOfficialProtocol() throws Exception {
        try (var connection = connection(null)) {
            assertEquals("PocketData", connection.client.initialize().serverInfo().name());
            var tools = connection.client.listTools().tools(); assertEquals(11, tools.size());
            var start = tools.stream().filter(tool -> tool.name().equals("start_population")).findFirst().orElseThrow();
            assertFalse(start.annotations().readOnlyHint()); assertFalse(start.annotations().idempotentHint()); assertTrue(start.annotations().openWorldHint());
            assertEquals(false, start.inputSchema().get("additionalProperties"));
            assertFalse(ok(call(connection, "get_access", Map.of())).get("canEdit").booleanValue());
            assertEquals("qa", ok(call(connection, "list_suts", Map.of())).at("/suts/0/id").asText());
            assertTrue(ok(call(connection, "list_datasets", Map.of("sut", "qa"))).has("datasets"));
            assertEquals("portable-v1", ok(call(connection, "get_population_example", Map.of())).at("/recipe/steps/0/call/profile").asText());
        }
    }
    @Test void identityIsFreshAndEveryPrivateToolDeniesBeforeServices() throws Exception {
        try (var connection = connection("Bearer synthetic-admin")) {
            connection.client.initialize(); assertTrue(ok(call(connection, "get_access", Map.of())).get("canEdit").booleanValue());
            for (String token : new String[]{null, "Bearer synthetic-viewer", "Bearer revoked"}) {
                connection.authorization.set(token);
                for (String name : List.of("validate_population", "save_population_draft", "get_population_draft", "start_population", "list_population_jobs", "get_population_job", "stop_population"))
                    error(call(connection, name, Map.of()), token != null && token.contains("viewer") ? "HTTP_403" : "HTTP_401");
            }
            connection.authorization.set("Bearer synthetic-admin"); AUTH_STATUS.set(503);
            error(call(connection, "start_population", args(recipe())), "HTTP_503");
            verifyNoInteractions(redis); assertEquals(0, REQUESTS.get());
        }
    }
    @Test void saveValidatesWithoutExecutionPersistsAndLoadsThroughUiApi() throws Exception {
        long filesBefore;
        try (var files = Files.walk(DIRECTORY)) { filesBefore = files.filter(path -> path.toString().endsWith(".csv")).count(); }
        try (var connection = connection("Bearer synthetic-admin")) {
            connection.client.initialize(); assertFalse(ok(call(connection, "validate_population", args(recipe()))).get("executed").booleanValue());
            Map<String, Object> save = new HashMap<>(args(recipe()));
            long revision = drafts.read("qa", "cards").revision(); save.put("expected_revision", revision);
            JsonNode result = ok(call(connection, "save_population_draft", save)); assertEquals(revision + 1, result.get("revision").asLong());
            error(call(connection, "save_population_draft", save), "HTTP_409");
            var reopened = new PopulationDrafts(DIRECTORY.toString(), JSON, preparation);
            assertEquals(result.get("recipe"), reopened.read("qa", "cards").recipe());
            var http = HttpClient.newHttpClient(); String url = base() + "/api/suts/qa/datasets/cards/population-draft";
            assertEquals(401, http.send(HttpRequest.newBuilder(URI.create(url)).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
            var response = http.send(HttpRequest.newBuilder(URI.create(url)).header("Authorization", "Bearer synthetic-admin").build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode()); assertEquals(result, JSON.readTree(response.body()));
            assertEquals(0, REQUESTS.get()); verify(redis, never()).publish(any(), any(), any());
            try (var files = Files.walk(DIRECTORY)) { assertEquals(filesBefore, files.filter(path -> path.toString().endsWith(".csv")).count()); }
        }
    }
    @Test void startReadAndStopUseTheActualRunnerAndNeverRetry() throws Exception {
        try (var connection = connection("Bearer synthetic-admin")) {
            connection.client.initialize(); ObjectNode recipe = recipe(); recipe.put("count", 2);
            recipe.set("pacing", JSON.valueToTree(Map.of("mode", "DELAY", "value", 2, "unit", "DAYS")));
            String id = ok(call(connection, "start_population", args(recipe))).get("id").asText();
            try {
                error(call(connection, "start_population", args(recipe)), "HTTP_409");
                long until = System.nanoTime() + 5_000_000_000L;
                while (!jobs.read("qa", "cards", id).waiting() && System.nanoTime() < until) Thread.sleep(20);
                assertTrue(jobs.read("qa", "cards", id).waiting()); assertEquals(1, REQUESTS.get());
                assertTrue(ok(call(connection, "list_population_jobs", Map.of("sut", "qa", "dataset", "cards"))).get("jobs").toString().contains(id));
                assertEquals(1, ok(call(connection, "get_population_job", job(id))).get("published").asInt());
                error(call(connection, "get_population_job", Map.of("sut", "qa", "dataset", "other", "job_id", id)), "HTTP_404");
                ok(call(connection, "stop_population", job(id))); until = System.nanoTime() + 2_000_000_000L;
                while (jobs.read("qa", "cards", id).status() != PopulationStatus.STOPPED && System.nanoTime() < until) Thread.sleep(20);
                assertEquals(PopulationStatus.STOPPED, jobs.read("qa", "cards", id).status());
                assertEquals(1, REQUESTS.get()); verify(redis, times(1)).publish(any(), eq("ready"), any());
            } finally { jobs.stop("qa", "cards", id); }
        }
    }
    @Test void malformedArgumentsAndRecipesNeverReachExecution() throws Exception {
        try (var connection = connection("Bearer synthetic-admin")) {
            connection.client.initialize(); var extra = new HashMap<>(args(recipe())); extra.put("authorization", "Bearer synthetic-admin");
            error(call(connection, "start_population", extra), "HTTP_400");
            var bad = recipe(); bad.put("count", 1.5); error(call(connection, "start_population", args(bad)), "HTTP_400");
            var save = new HashMap<>(args(recipe())); save.put("expected_revision", 0.5); error(call(connection, "save_population_draft", save), "HTTP_400");
            var invalidTarget = new HashMap<>(args(recipe())); invalidTarget.put("list", "missing"); error(call(connection, "validate_population", invalidTarget), "HTTP_400");
            assertEquals(0, REQUESTS.get()); verify(redis, never()).publish(any(), any(), any());
        }
    }
    @Test void boundaryRejectsUnsafeOriginsOversizeDuplicateAndInvalidUtf8Bodies() throws Exception {
        var client = HttpClient.newHttpClient(); var url = URI.create(base() + "/mcp");
        var origin = HttpRequest.newBuilder(url).header("Origin", "https://evil.example").POST(HttpRequest.BodyPublishers.ofString("{}"));
        assertEquals(403, client.send(origin.build(), HttpResponse.BodyHandlers.ofString()).statusCode());
        for (String body : List.of("{\"jsonrpc\":\"2.0\",\"jsonrpc\":\"2.0\"}", "{} {}", "[]"))
            assertEquals(400, client.send(HttpRequest.newBuilder(url).POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
        assertEquals(413, client.send(HttpRequest.newBuilder(url).POST(HttpRequest.BodyPublishers.ofString(" ".repeat(1024 * 1024 + 1))).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
        byte[] invalid = new byte[]{'{', '"', 'x', '"', ':', '"', (byte) 0xc3, '(', '"', '}'};
        assertEquals(400, client.send(HttpRequest.newBuilder(url).POST(HttpRequest.BodyPublishers.ofByteArray(invalid)).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
    }
    @Test void securityRejectsUnknownHostsAndWildcardConfiguration() {
        assertThrows(IllegalArgumentException.class, () -> new McpSecurity("*", ""));
        assertThrows(IllegalArgumentException.class, () -> new McpSecurity("*.example", ""));
        assertThrows(Exception.class, () -> new McpSecurity("", "").validateHeaders(Map.of("Host", List.of("evil.example"))));
        assertDoesNotThrow(() -> new McpSecurity("pd.lab:8785", "").validateHeaders(Map.of("Host", List.of("pd.lab:8785"))));
    }
    private String base() { return "http://127.0.0.1:" + port; }
    private McpClientFixture connection(String auth) { return new McpClientFixture(base(), auth); }
    private static Map<String, Object> job(String id) { return Map.of("sut", "qa", "dataset", "cards", "job_id", id); }
    private static Map<String, Object> args(JsonNode recipe) { return Map.of("sut", "qa", "dataset", "cards", "list", "ready", "recipe", recipe); }
    private static ObjectNode recipe() throws Exception {
        try (var input = McpHttpTest.class.getResourceAsStream("/examples/population-soap.json")) { return (ObjectNode) JSON.readTree(input); }
    }
    private static McpSchema.CallToolResult call(McpClientFixture client, String name, Map<String, Object> args) { return client.client.callTool(new McpSchema.CallToolRequest(name, args)); }
    private static JsonNode ok(McpSchema.CallToolResult result) {
        assertFalse(result.isError(), () -> result.content().toString()); return JSON.valueToTree(result.structuredContent());
    }
    private static void error(McpSchema.CallToolResult result, String code) { assertTrue(result.isError()); assertTrue(result.content().toString().contains(code), result.content().toString()); }
}
