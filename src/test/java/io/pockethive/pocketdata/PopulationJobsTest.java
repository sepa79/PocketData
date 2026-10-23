package io.pockethive.pocketdata;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PopulationJobsTest {
    @TempDir Path directory;
    private final ObjectMapper mapper = new ObjectMapper();
    private HttpServer server;
    private CatalogStore catalog;
    private RedisDatasets redis;
    private CsvInventory inventory;
    private PopulationJobs jobs;
    private PopulationHttp http;
    private final AtomicInteger calls = new AtomicInteger();
    private final DatasetDefinition format = new DatasetDefinition("qa", "cards", "Synthetic", List.of(
            new RecordField("accountNumber", "string", true), new RecordField("cardNumber", "string", true)), List.of("ready"));

    @BeforeEach void setup() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0); server.start();
        catalog = new CatalogStore(directory.toString(), mapper);
        catalog.save(new CatalogSnapshot(0, List.of(new SutDefinition("qa", "QA only", "", Map.of("api", "http://127.0.0.1:" + server.getAddress().getPort())))));
        redis = mock(RedisDatasets.class); when(redis.require("qa", "cards")).thenReturn(format);
        RecordFormat formats = new RecordFormat(); inventory = new CsvInventory(catalog, redis, formats, mapper);
        PopulationTemplates templates = new PopulationTemplates(); PopulationResponses responses = new PopulationResponses();
        http = new PopulationHttp(); jobs = new PopulationJobs(new PopulationPreparation(catalog, redis, new PopulationValidator(mapper, templates)), redis, inventory, formats, templates, http, responses);
    }
    @AfterEach void close() throws Exception { server.stop(0); jobs.close(); http.close(); }

    @Test void multiStepJsonSoap11CreatesDurableEvidenceAndCsvBeforeEveryRedisPublication() throws Exception {
        server.createContext("/accounts", exchange -> {
            int index = calls.incrementAndGet();
            byte[] body = ("{\"accountNumber\":\"000acc" + index + "\"}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(201, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.createContext("/cards", exchange -> {
            assertEquals("text/xml; charset=utf-8", exchange.getRequestHeaders().getFirst("Content-Type"));
            assertEquals("\"urn:create-card\"", exchange.getRequestHeaders().getFirst("SOAPAction"));
            String request = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(request.contains("000acc"));
            try (var files = Files.list(catalog.populationDirectory("qa", "cards"))) {
                assertTrue(Files.readString(files.findFirst().orElseThrow()).contains("000acc"));
            }
            calls.incrementAndGet();
            byte[] body = soap("000card", "http://schemas.xmlsoap.org/soap/envelope/").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        doAnswer(invocation -> {
            Map<?, ?> record = invocation.getArgument(2);
            assertEquals("kept", record.get("extraField")); assertTrue(record.get("accountNumber").toString().startsWith("000"));
            try (var files = Files.list(catalog.inventoryDirectory("qa", "cards"))) {
                assertTrue(Files.readString(files.filter(file -> file.toString().endsWith(".csv")).findFirst().orElseThrow()).contains(record.get("accountNumber").toString()));
            }
            return null;
        }).when(redis).publish(eq(format), eq("ready"), anyMap());
        PopulationSnapshot first = jobs.start("qa", "cards", "ready", recipe(3, "SOAP11"));
        PopulationSnapshot done = await(first.id());
        assertEquals(PopulationStatus.SUCCEEDED, done.status()); assertEquals(3, done.completed()); assertEquals(3, done.published());
        assertEquals(6, calls.get()); verify(redis, times(3)).publish(eq(format), eq("ready"), anyMap());
        assertTrue(Files.readString(catalog.populationDirectory("qa", "cards").resolve(done.id() + ".csv")).contains("CreateCardResponse"));
        assertEquals(1, new CsvInventory(new CatalogStore(directory.toString(), mapper), redis, new RecordFormat(), mapper).list("qa", "cards").size());
    }

    @Test void soap12HeadersAndExtractionUseTheSameRunner() throws Exception {
        server.createContext("/accounts", exchange -> { byte[] body = "{\"accountNumber\":\"000acc\"}".getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(201, body.length); exchange.getResponseBody().write(body); exchange.close(); });
        server.createContext("/cards", exchange -> {
            assertEquals("application/soap+xml; charset=utf-8; action=\"urn:create-card\"", exchange.getRequestHeaders().getFirst("Content-Type"));
            assertNull(exchange.getRequestHeaders().getFirst("SOAPAction")); calls.incrementAndGet();
            byte[] body = soap("00012", "http://www.w3.org/2003/05/soap-envelope").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        PopulationSnapshot done = await(jobs.start("qa", "cards", "ready", recipe(1, "SOAP12")).id());
        assertEquals(PopulationStatus.SUCCEEDED, done.status()); assertEquals(1, calls.get());
        verify(redis).publish(eq(format), eq("ready"), argThat(record -> record.get("cardNumber").equals("00012")));
    }

    @Test void laterStepFailureKeepsCreatedAccountResponseAndNeverPublishesPartialRecords() throws Exception {
        server.createContext("/accounts", exchange -> { calls.incrementAndGet(); byte[] body = "{\"accountNumber\":\"000created\"}".getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(201, body.length); exchange.getResponseBody().write(body); exchange.close(); });
        server.createContext("/cards", exchange -> { calls.incrementAndGet(); byte[] body = "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\"><s:Body><s:Fault><faultstring>private-token</faultstring></s:Fault></s:Body></s:Envelope>".getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close(); });
        PopulationSnapshot done = await(jobs.start("qa", "cards", "ready", recipe(3, "SOAP11")).id());
        assertEquals(PopulationStatus.FAILED, done.status()); assertEquals(0, done.completed()); assertEquals(2, calls.get());
        assertFalse(done.error().contains("private-token")); verify(redis, never()).publish(any(), anyString(), anyMap());
        assertTrue(Files.readString(catalog.populationDirectory("qa", "cards").resolve(done.id() + ".csv")).contains("000created"));
        assertFalse(Files.readString(catalog.inventoryDirectory("qa", "cards").resolve(done.id() + ".csv")).contains("000created"));
    }

    @Test void redisUncertaintyRetainsFinalCsvAndStopsWithoutAutomaticReplay() throws Exception {
        JsonNode source = recipe(3, "SOAP11");
        ((com.fasterxml.jackson.databind.node.ArrayNode) source.get("steps")).remove(1);
        ((com.fasterxml.jackson.databind.node.ObjectNode) source.get("values")).put("cardNumber", "000card");
        server.createContext("/accounts", exchange -> { calls.incrementAndGet(); byte[] body = "{\"accountNumber\":\"000saved\"}".getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(201, body.length); exchange.getResponseBody().write(body); exchange.close(); });
        doThrow(new ApiFailure(503, "Redis publication is uncertain.")).when(redis).publish(any(), anyString(), anyMap());
        PopulationSnapshot done = await(jobs.start("qa", "cards", "ready", source).id());
        assertEquals(PopulationStatus.FAILED, done.status()); assertEquals(1, done.completed()); assertEquals(0, done.published()); assertEquals(1, calls.get());
        assertTrue(Files.readString(catalog.inventoryDirectory("qa", "cards").resolve(done.id() + ".csv")).contains("000saved"));
    }

    @Test void stopAndAdmissionAreExplicitAndAnInflightCreatedResponseIsRetained() throws Exception {
        CountDownLatch entered = new CountDownLatch(1); CountDownLatch release = new CountDownLatch(1);
        server.createContext("/accounts", exchange -> {
            calls.incrementAndGet(); entered.countDown();
            try { assertTrue(release.await(5, TimeUnit.SECONDS)); } catch (InterruptedException failure) { throw new AssertionError(failure); }
            byte[] body = "{\"accountNumber\":\"000stopped\"}".getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(201, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        PopulationSnapshot active = jobs.start("qa", "cards", "ready", recipe(3, "SOAP11"));
        try {
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            assertEquals(409, assertThrows(ApiFailure.class, () -> jobs.start("qa", "cards", "ready", recipe(1, "SOAP11"))).status());
            assertEquals(404, assertThrows(ApiFailure.class, () -> jobs.read("other", "cards", active.id())).status());
            assertEquals(PopulationStatus.STOPPING, jobs.stop("qa", "cards", active.id()).status());
        } finally { release.countDown(); }
        PopulationSnapshot done = await(active.id());
        assertEquals(PopulationStatus.STOPPED, done.status()); assertEquals(1, calls.get()); assertEquals(0, done.completed());
        assertTrue(Files.readString(catalog.populationDirectory("qa", "cards").resolve(done.id() + ".csv")).contains("000stopped"));
        verify(redis, never()).publish(any(), anyString(), anyMap());
    }

    @Test void invalidLaterStepIsRejectedBeforeAnyFileOrSutMutation() throws Exception {
        JsonNode source = recipe(1, "SOAP11");
        ((com.fasterxml.jackson.databind.node.ObjectNode) source.at("/steps/1/call/request")).put("method", "BROKEN");
        assertEquals(400, assertThrows(ApiFailure.class, () -> jobs.start("qa", "cards", "ready", source)).status());
        assertEquals(0, inventory.list("qa", "cards").size()); assertEquals(0, calls.get());
        verify(redis, never()).publish(any(), anyString(), anyMap());
    }

    @Test void csvDownloadsWaitForTheWriterToCloseRatherThanExposeAHalfWrittenRow() throws Exception {
        String id;
        try (GeneratedInventory output = inventory.beginGeneration("qa", "cards", List.of("accountNumber", "cardNumber"))) {
            id = output.id(); output.record(Map.of("accountNumber", "000a", "cardNumber", "000c"));
            assertEquals(409, assertThrows(ApiFailure.class, () -> inventory.download("qa", "cards", output.id(), new org.springframework.mock.web.MockHttpServletResponse())).status());
            assertEquals(409, assertThrows(ApiFailure.class, () -> inventory.downloadResponses("qa", "cards", output.id(), new org.springframework.mock.web.MockHttpServletResponse())).status());
        }
        var response = new org.springframework.mock.web.MockHttpServletResponse();
        inventory.download("qa", "cards", id, response); assertTrue(response.getContentAsString().contains("000a,000c"));
    }

    @Test void delayBeginsAfterPublicationAndNeverWaitsAfterTheLastRecord() throws Exception {
        var starts = new java.util.concurrent.CopyOnWriteArrayList<Long>();
        var publications = new java.util.concurrent.CopyOnWriteArrayList<Long>();
        JsonNode source = singleStepRecipe(2, "DELAY", 150, "MILLISECONDS");
        server.createContext("/accounts", exchange -> {
            starts.add(System.nanoTime());
            byte[] body = "{\"accountNumber\":\"000qa\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(201, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        doAnswer(invocation -> { publications.add(System.nanoTime()); return null; }).when(redis).publish(any(), anyString(), anyMap());
        PopulationSnapshot done = await(jobs.start("qa", "cards", "ready", source).id());
        assertEquals(PopulationStatus.SUCCEEDED, done.status());
        assertEquals(2, starts.size());
        assertTrue(starts.get(1) - publications.getFirst() >= TimeUnit.MILLISECONDS.toNanos(150));
        assertFalse(done.waiting());
        assertTrue(done.achievedPerSecond() > 0);
        source = singleStepRecipe(1, "DELAY", 365, "DAYS");
        assertEquals(PopulationStatus.SUCCEEDED, await(jobs.start("qa", "cards", "ready", source).id()).status());
    }

    @Test void attemptedHourlyRateCanBeStoppedDuringItsLongWaitWithoutAnotherRequest() throws Exception {
        server.createContext("/accounts", exchange -> {
            calls.incrementAndGet();
            byte[] body = "{\"accountNumber\":\"000qa\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(201, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        PopulationSnapshot started = jobs.start("qa", "cards", "ready", singleStepRecipe(2, "RATE", 3, "HOURS"));
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (!jobs.read("qa", "cards", started.id()).waiting() && System.nanoTime() < deadline) Thread.sleep(10);
        var waiting = jobs.read("qa", "cards", started.id());
        assertTrue(waiting.waiting()); assertEquals(1, waiting.published());
        assertTrue(waiting.waitRemainingMs() > TimeUnit.MINUTES.toMillis(19));
        jobs.stop("qa", "cards", started.id());
        var stopped = await(started.id());
        assertEquals(PopulationStatus.STOPPED, stopped.status()); assertEquals(1, calls.get());
        assertFalse(stopped.waiting());
        assertTrue(stopped.elapsedMs() < TimeUnit.SECONDS.toMillis(10));
        verify(redis, times(1)).publish(any(), anyString(), anyMap());
    }

    @Test void pacingIsRequiredAndValidatedBeforeCreatingAnyInventory() throws Exception {
        var source = (com.fasterxml.jackson.databind.node.ObjectNode) recipe(1, "SOAP11");
        source.remove("pacing");
        assertEquals(400, assertThrows(ApiFailure.class, () -> jobs.start("qa", "cards", "ready", source)).status());
        source.set("pacing", mapper.valueToTree(Map.of("mode", "RATE", "value", 0, "unit", "SECONDS")));
        assertEquals(400, assertThrows(ApiFailure.class, () -> jobs.start("qa", "cards", "ready", source)).status());
        assertTrue(inventory.list("qa", "cards").isEmpty());
        assertEquals(0, calls.get()); verify(redis, never()).publish(any(), anyString(), anyMap());
    }

    private JsonNode singleStepRecipe(int count, String mode, double value, String unit) {
        var source = (com.fasterxml.jackson.databind.node.ObjectNode) recipe(count, "SOAP11");
        ((com.fasterxml.jackson.databind.node.ArrayNode) source.get("steps")).remove(1);
        ((com.fasterxml.jackson.databind.node.ObjectNode) source.get("values")).put("cardNumber", "000card");
        source.set("pacing", mapper.valueToTree(Map.of("mode", mode, "value", value, "unit", unit)));
        return source;
    }

    private PopulationSnapshot await(String id) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        while (System.nanoTime() < deadline) {
            PopulationSnapshot current = jobs.read("qa", "cards", id);
            if (List.of(PopulationStatus.FAILED, PopulationStatus.SUCCEEDED, PopulationStatus.STOPPED).contains(current.status())) return current;
            Thread.sleep(20);
        }
        throw new AssertionError("Job did not terminate");
    }
    private JsonNode recipe(int count, String kind) {
        String envelope = kind.equals("SOAP12") ? "http://www.w3.org/2003/05/soap-envelope" : "http://schemas.xmlsoap.org/soap/envelope/";
        return mapper.valueToTree(Map.of("name", "Synthetic account/card", "count", count, "pacing", Map.of("mode", "DELAY", "value", 0, "unit", "MILLISECONDS"), "values", Map.of("extraField", "kept"), "params", Map.of(), "steps", List.of(
            step("account", "JSON", Map.of("serviceId", "qa", "callId", "account", "protocol", "HTTP", "method", "POST", "pathTemplate", "/accounts", "headersTemplate", Map.of("Content-Type", "application/json"), "bodyTemplate", "{\"iteration\":{{ params.iteration }}}"), Map.of("accountNumber", "/accountNumber"), Map.of()),
            step("card", kind, Map.of("serviceId", "qa", "callId", "card", "protocol", "HTTP", "method", "POST", "pathTemplate", "/cards", "headersTemplate", Map.of(), "bodyTemplate", "<s:Envelope xmlns:s=\"" + envelope + "\"><s:Body><c:CreateCard xmlns:c=\"urn:cards\"><c:accountNumber>{{ xml_text(record.accountNumber) }}</c:accountNumber></c:CreateCard></s:Body></s:Envelope>"), Map.of("cardNumber", "/soap:Envelope/soap:Body/c:CreateCardResponse/c:cardNumber"), Map.of("c", "urn:cards")) )));
    }
    private Map<String,Object> step(String name, String kind, Map<String,Object> request, Map<String,String> extract, Map<String,String> namespaces) {
        return Map.of("name", name, "endpoint", "api", "call", Map.of("profile", "portable-v1", "requires", kind.equals("JSON") ? List.of("json_path") : List.of("xml_path", "xml_text", kind.toLowerCase()),
            "request", request, "response", Map.of("kind", kind, "soapAction", kind.equals("JSON") ? "" : "urn:create-card", "expectedStatus", kind.equals("JSON") ? 201 : 200, "extract", extract, "namespaces", namespaces)));
    }
    private static String soap(String card, String namespace) { return "<s:Envelope xmlns:s=\"" + namespace + "\"><s:Body><c:CreateCardResponse xmlns:c=\"urn:cards\"><c:cardNumber>" + card + "</c:cardNumber></c:CreateCardResponse></s:Body></s:Envelope>"; }
}
