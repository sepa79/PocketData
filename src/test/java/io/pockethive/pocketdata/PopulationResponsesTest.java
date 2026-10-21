package io.pockethive.pocketdata;

import io.pockethive.requesttemplates.PortableHttpCall;
import io.pockethive.requesttemplates.PortableResponseKind;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;

class PopulationResponsesTest {
    private static final String SOAP11 = "http://schemas.xmlsoap.org/soap/envelope/";
    private static final String SOAP12 = "http://www.w3.org/2003/05/soap-envelope";
    private static final Map<String, String> NAMESPACES = Map.of("cards", "urn:synthetic:cards");
    private static final Map<String, String> XML_SELECTORS = Map.of("accountNumber", "/soap:Envelope/soap:Body/cards:created/cards:accountNumber");
    private final PopulationResponses responses = new PopulationResponses();
    @TempDir Path directory;

    private PortableHttpCall call(PortableResponseKind kind, Map<String,String> selectors, Map<String,String> namespaces) {
        Map<String,Object> response = new java.util.LinkedHashMap<>();
        response.put("kind", kind == null ? "" : kind.name()); response.put("soapAction", kind == PortableResponseKind.JSON ? "" : "urn:qa");
        response.put("expectedStatus", 200); response.put("extract", selectors); response.put("namespaces", namespaces);
        return new PopulationTemplates().parse(Map.of("profile", "portable-v1", "requires", java.util.List.of("json_path", "xml_path", "soap11", "soap12"),
            "request", Map.of("serviceId", "qa", "callId", "response", "protocol", "HTTP", "method", "POST", "pathTemplate", "/qa", "bodyTemplate", "", "headersTemplate", Map.of()), "response", response));
    }
    private Map<String,String> readResponse(PortableResponseKind kind, String body, Map<String,String> selectors, Map<String,String> namespaces) {
        return responses.extract(call(kind, selectors, namespaces), 200, body);
    }

    @Test void rejectsExcessivelyNestedSoapBeforeTraversal() {
        String body = "<soap:Envelope xmlns:soap=\"" + SOAP11 + "\"><soap:Body>"
            + "<nested>".repeat(300) + "<leaf>value</leaf>" + "</nested>".repeat(300)
            + "</soap:Body></soap:Envelope>";
        Map<String, String> selector = Map.of("value", "//leaf");
        assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, body, selector, Map.of()));
        String bounded = body.replace("<nested>".repeat(300), "<nested>".repeat(100))
            .replace("</nested>".repeat(300), "</nested>".repeat(100));
        assertEquals(Map.of("value", "value"), readResponse(PortableResponseKind.SOAP11, bounded, selector, Map.of()));
    }

    @Test void extractsJsonScalarFieldsWithoutDiscardingLeadingZeroes() {
        Map<String, String> result = readResponse(PortableResponseKind.JSON,
            "{\"accountNumber\":\"0000123\",\"count\":12,\"active\":true,\"extra\":{\"unused\":[]}}",
            Map.of("accountNumber", "/accountNumber", "count", "/count", "active", "/active"), Map.of());
        assertEquals(Map.of("accountNumber", "0000123", "count", "12", "active", "true"), result);
    }

    @Test void supportsRfc6901EscapesArrayIndexAndEmptyPropertyNames() {
        Map<String, String> result = readResponse(PortableResponseKind.JSON,
            "{\"a/b\":{\"m~n\":[\"00042\"]},\"\":\"empty-key\"}",
            Map.of("card", "/a~1b/m~0n/0", "empty", "/"), Map.of());
        assertEquals(Map.of("card", "00042", "empty", "empty-key"), result);
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"00042\"", "42", "true", "false", "\"\""})
    void acceptsEmptyPointerForScalarDocument(String body) {
        call(PortableResponseKind.JSON, Map.of("value", ""), Map.of());
        assertEquals(readJson(body).asText(),
            readResponse(PortableResponseKind.JSON, body, Map.of("value", ""), Map.of()).get("value"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"$..account", "accountNumber", "#/accountNumber", "/bad~", "/bad~2", "/~01~x", " "})
    void rejectsNonRfc6901JsonPointersBeforeExecution(String pointer) {
        assertFailure(400, () -> call(PortableResponseKind.JSON, Map.of("value", pointer), Map.of()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "{}", "[]"})
    void rejectsNullAndContainersAtRoot(String body) {
        assertFailure(502, () -> readResponse(PortableResponseKind.JSON, body, Map.of("value", ""), Map.of()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"value\":null}", "{\"value\":{}}", "{\"value\":[]}"})
    void doesNotGuessMissingOrContainerJsonValues(String body) {
        assertFailure(502, () -> readResponse(PortableResponseKind.JSON, body, Map.of("value", "/value"), Map.of()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{", "{\"value\":001}", "{\"value\":\"secret-card\"} {}", "{\"value\":\"secret-card\",\"value\":\"duplicate\"}"})
    void rejectsMalformedTrailingAndDuplicateJsonWithoutLeakingValues(String body) {
        ApiFailure failure = assertFailure(502, () -> readResponse(PortableResponseKind.JSON, body, Map.of("value", "/value"), Map.of()));
        assertFalse(failure.getMessage().contains("secret-card"));
        assertNull(failure.getCause());
    }

    @Test void rejectsJsonNamespacesInsteadOfSilentlyIgnoringThem() {
        assertFailure(400, () -> call(PortableResponseKind.JSON, Map.of("value", "/value"), NAMESPACES));
    }

    @Test void requiresExactJsonArrayIndexWithoutGuessing() {
        assertFailure(502, () -> readResponse(PortableResponseKind.JSON, "{\"values\":[\"first\",\"second\"]}",
            Map.of("value", "/values/01"), Map.of()));
    }

    static Stream<Arguments> soapVersions() {
        return Stream.of(Arguments.of(PortableResponseKind.SOAP11, SOAP11), Arguments.of(PortableResponseKind.SOAP12, SOAP12));
    }

    @ParameterizedTest
    @MethodSource("soapVersions")
    void extractsTextFromEitherSoapVersionWithReservedSoapPrefix(PortableResponseKind kind, String namespace) {
        String body = envelope(namespace,
            "<different:created xmlns:different=\"urn:synthetic:cards\"><different:accountNumber>000123</different:accountNumber></different:created>");
        call(kind, XML_SELECTORS, NAMESPACES);
        assertEquals(Map.of("accountNumber", "000123"), readResponse(kind, body, XML_SELECTORS, NAMESPACES));
    }

    @ParameterizedTest
    @MethodSource("soapVersions")
    void supportsDefaultNamespacesOptionalHeaderAttributesAndCdata(PortableResponseKind kind, String namespace) {
        String body = "<Envelope xmlns=\"" + namespace + "\"><Header><meta:trace xmlns:meta=\"urn:trace\">ignored</meta:trace></Header>"
            + "<Body><created xmlns=\"urn:synthetic:cards\" version=\"0007\"><accountNumber><![CDATA[000123]]></accountNumber>"
            + "<name>Card &amp; Account</name></created></Body></Envelope>";
        Map<String, String> selectors = Map.of("account", XML_SELECTORS.get("accountNumber") + "/text()",
            "version", "/soap:Envelope/soap:Body/cards:created/@version", "name", "/soap:Envelope/soap:Body/cards:created/cards:name");
        assertEquals(Map.of("account", "000123", "version", "0007", "name", "Card & Account"),
            readResponse(kind, body, selectors, NAMESPACES));
    }

    @ParameterizedTest
    @MethodSource("soapVersions")
    void rejectsSoapFaultEvenWithoutAnHttpError(PortableResponseKind kind, String namespace) {
        String body = envelope(namespace, "<env:Fault><faultcode>env:Server</faultcode><faultstring>secret-card</faultstring></env:Fault>");
        ApiFailure failure = assertFailure(502, () -> readResponse(kind, body, Map.of("fault", "//faultstring"), Map.of()));
        assertEquals("Portable response rejected: INVALID_VALUE", failure.getMessage());
        assertFalse(failure.getMessage().contains("secret-card"));
    }

    @Test void rejectsRealSoap12FaultWithCodeReasonAndDetail() {
        String body = envelope(SOAP12, "<env:Fault><env:Code><env:Value>env:Receiver</env:Value></env:Code>"
            + "<env:Reason><env:Text xml:lang=\"en\">secret-card</env:Text></env:Reason><env:Detail>hidden</env:Detail></env:Fault>");
        assertFailure(502, () -> readResponse(PortableResponseKind.SOAP12, body, Map.of("reason", "//soap:Text"), Map.of()));
    }

    @ParameterizedTest
    @MethodSource("soapVersions")
    void rejectsFaultFromTheWrongSoapVersionEvenWhenOtherSelectedDataExists(PortableResponseKind kind, String namespace) {
        String otherVersion = kind == PortableResponseKind.SOAP11 ? SOAP12 : SOAP11;
        String body = envelope(namespace, "<wrong:Fault xmlns:wrong=\"" + otherVersion + "\"/>"
            + "<cards:created xmlns:cards=\"urn:synthetic:cards\"><cards:accountNumber>000123</cards:accountNumber></cards:created>");
        assertFailure(502, () -> readResponse(kind, body, XML_SELECTORS, NAMESPACES));
    }

    @ParameterizedTest
    @ValueSource(strings = {"<env:Body/><env:Body/>", "<env:Header/>", "<env:Body/><env:Header/>",
        "<env:Other/><env:Body/>", "<Body/>", "<wrong:Body xmlns:wrong=\"urn:wrong\"/>", "secret-card<env:Body/>"})
    void rejectsInvalidEnvelopeStructure(String content) {
        String body = "<env:Envelope xmlns:env=\"" + SOAP11 + "\">" + content + "</env:Envelope>";
        assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, body, XML_SELECTORS, NAMESPACES));
    }

    @ParameterizedTest
    @ValueSource(strings = {"<env:Body xmlns:env=\"http://schemas.xmlsoap.org/soap/envelope/\"/>",
        "<Envelope><Body/></Envelope>", "<env:Envelope xmlns:env=\"urn:wrong\"><env:Body/></env:Envelope>"})
    void rejectsWrongRootOrSoapNamespace(String body) {
        assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, body, XML_SELECTORS, NAMESPACES));
    }

    @Test void rejectsWrongSoapVersion() {
        assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, envelope(SOAP12, ""), XML_SELECTORS, NAMESPACES));
        assertFailure(502, () -> readResponse(PortableResponseKind.SOAP12, envelope(SOAP11, ""), XML_SELECTORS, NAMESPACES));
    }

    @Test void rejectsUnexpectedTextInBodyEvenWhenSelectedValueExists() {
        String body = envelope(SOAP11, "secret-card<cards:created xmlns:cards=\"urn:synthetic:cards\"><cards:accountNumber>000123</cards:accountNumber></cards:created>");
        assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, body, XML_SELECTORS, NAMESPACES));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "{\"not\":\"xml\"}", "<env:Envelope", "<a/>", "<secret-card></wrong>"})
    void rejectsMalformedSoapWithoutLoggingRawResponse(String body) throws Exception {
        ByteArrayOutputStream captured = new ByteArrayOutputStream();
        PrintStream previous = System.err;
        try (PrintStream replacement = new PrintStream(captured, true, StandardCharsets.UTF_8)) {
            System.setErr(replacement);
            ApiFailure failure = assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, body, XML_SELECTORS, NAMESPACES));
            assertFalse(failure.getMessage().contains("secret-card"));
            assertNull(failure.getCause());
        } finally {
            System.setErr(previous);
        }
        assertEquals("", captured.toString(StandardCharsets.UTF_8));
    }

    @Test void rejectsMissingAndAmbiguousXpathInsteadOfPickingFirst() {
        String item = "<cards:accountNumber>000123</cards:accountNumber>";
        String missing = envelope(SOAP11, "<cards:created xmlns:cards=\"urn:synthetic:cards\"/>");
        String duplicate = envelope(SOAP11, "<cards:created xmlns:cards=\"urn:synthetic:cards\">" + item + item + "</cards:created>");
        assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, missing, XML_SELECTORS, NAMESPACES));
        assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, duplicate, XML_SELECTORS, NAMESPACES));
    }

    @Test void rejectsXmlContainerDocumentAndCommentResults() {
        String body = envelope(SOAP11, "<cards:created xmlns:cards=\"urn:synthetic:cards\"><cards:accountNumber>000123</cards:accountNumber><!--secret-card--></cards:created>");
        for (String selector : new String[]{"/", "/soap:Envelope/soap:Body/cards:created", "//comment()"}) {
            assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, body, Map.of("value", selector), NAMESPACES));
        }
    }

    @Test void preservesEmptyAndWhitespaceScalarTextRatherThanNormalizing() {
        String body = envelope(SOAP11, "<cards:created xmlns:cards=\"urn:synthetic:cards\"><cards:empty/><cards:text> 000123 </cards:text></cards:created>");
        assertEquals(Map.of("empty", "", "text", " 000123 "), readResponse(PortableResponseKind.SOAP11, body,
            Map.of("empty", "//cards:empty", "text", "//cards:text"), NAMESPACES));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "/soap:Envelope[", "/unknown:Envelope", "count(//*)", "string(//*)", "$missing"})
    void validatesXpathBeforeExecution(String selector) {
        assertFailure(400, () -> call(PortableResponseKind.SOAP11, Map.of("value", selector), Map.of()));
    }

    @Test void rejectsExternalDocumentFunctionsAndJavaExtensionsDuringValidation() {
        assertFailure(400, () -> call(PortableResponseKind.SOAP11,
            Map.of("value", "document('file:///nonexistent-secret-card')"), Map.of()));
        assertFailure(400, () -> call(PortableResponseKind.SOAP11,
            Map.of("value", "system:getProperty('user.home')"), Map.of("system", "http://xml.apache.org/xalan/java/java.lang.System")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"soap", "SOAP", "xml", "xmlns", "xmlOther", "", "has:colon", "has space", "9prefix"})
    void rejectsReservedAndInvalidNamespacePrefixes(String prefix) {
        assertFailure(400, () -> call(PortableResponseKind.SOAP11, XML_SELECTORS, Map.of(prefix, "urn:cards")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "http://www.w3.org/XML/1998/namespace", "http://www.w3.org/2000/xmlns/"})
    void rejectsInvalidAndReservedNamespaceValues(String uri) {
        assertFailure(400, () -> call(PortableResponseKind.SOAP11, XML_SELECTORS, Map.of("cards", uri)));
    }

    @Test void rejectsMissingRecipeValuesAs400EvenWhenResponseIsMalformed() {
        assertFailure(400, () -> call(null, XML_SELECTORS, NAMESPACES));
        assertFailure(400, () -> call(PortableResponseKind.JSON, null, Map.of()));
        assertFailure(400, () -> call(PortableResponseKind.JSON, Map.of(), Map.of()));
        assertFailure(400, () -> call(PortableResponseKind.JSON, Map.of("value", "/value"), null));
        assertFailure(400, () -> call(PortableResponseKind.JSON, Map.of(" ", "/value"), Map.of()));
        Map<String, String> selectors = new HashMap<>();
        selectors.put("value", null);
        assertFailure(400, () -> readResponse(PortableResponseKind.JSON, "bad", selectors, Map.of()));
        assertFailure(400, () -> readResponse(PortableResponseKind.SOAP11, "bad", selectors, Map.of()));
        Map<String, String> namespaces = new HashMap<>();
        namespaces.put("cards", null);
        assertFailure(400, () -> call(PortableResponseKind.SOAP11, XML_SELECTORS, namespaces));
    }

    @Test void rejectsDtdExternalEntitiesAndEntityExpansionWithoutNetworkOrFileDisclosure() throws Exception {
        Path secret = directory.resolve("secret.txt");
        Files.writeString(secret, "secret-card-file");
        AtomicInteger requests = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            requests.incrementAndGet();
            byte[] content = "secret-card-network".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, content.length);
            try (var output = exchange.getResponseBody()) { output.write(content); }
        });
        server.start();
        try {
            String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/entity";
            String payload = envelope(SOAP11, "<cards:created xmlns:cards=\"urn:synthetic:cards\"><cards:accountNumber>&value;</cards:accountNumber></cards:created>");
            for (String declaration : new String[]{
                    "<!DOCTYPE env:Envelope [<!ENTITY value SYSTEM '" + secret.toUri() + "'>]>",
                    "<!DOCTYPE env:Envelope [<!ENTITY value SYSTEM '" + url + "'>]>",
                    "<!DOCTYPE env:Envelope SYSTEM '" + url + "'>",
                    "<!DOCTYPE env:Envelope [<!ENTITY % remote SYSTEM '" + url + "'>%remote;]>",
                    "<!DOCTYPE env:Envelope [<!ENTITY seed 'secret-card'><!ENTITY repeated '&seed;&seed;&seed;'><!ENTITY value '&repeated;&repeated;&repeated;'>]>",
                    "<!DOCTYPE env:Envelope>"}) {
                ApiFailure failure = assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, declaration + payload, XML_SELECTORS, NAMESPACES));
                assertFalse(failure.getMessage().contains("secret-card"));
                assertNull(failure.getCause());
            }
            String xinclude = envelope(SOAP11, "<cards:created xmlns:cards=\"urn:synthetic:cards\"><cards:accountNumber>000123</cards:accountNumber>"
                + "<xi:include xmlns:xi=\"http://www.w3.org/2001/XInclude\" href=\"" + url + "\" parse=\"text\"/></cards:created>");
            assertFailure(502, () -> readResponse(PortableResponseKind.SOAP11, xinclude, XML_SELECTORS, NAMESPACES));
            String schemaHint = envelope(SOAP11, "<cards:created xmlns:cards=\"urn:synthetic:cards\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"urn:synthetic:cards "
                + url + "\"><cards:accountNumber>000123</cards:accountNumber></cards:created>");
            assertEquals("000123", readResponse(PortableResponseKind.SOAP11, schemaHint, XML_SELECTORS, NAMESPACES).get("accountNumber"));
            assertEquals(0, requests.get());
        } finally {
            server.stop(0);
        }
    }

    @Test void namespaceUrisAreNamesNotResourcesToLoad() {
        Map<String, String> namespaces = Map.of("cards", "file:///nonexistent-secret-card");
        String body = envelope(SOAP11, "<cards:created xmlns:cards=\"file:///nonexistent-secret-card\"><cards:accountNumber>000123</cards:accountNumber></cards:created>");
        assertEquals("000123", readResponse(PortableResponseKind.SOAP11, body, XML_SELECTORS, namespaces).get("accountNumber"));
    }

    @Test void doesNotExecuteExtractedTemplateOrCodeLookingValues() {
        String value = "${T(java.lang.Runtime).getRuntime().exec('do-not-run')} {{ data.secret }}";
        String body = envelope(SOAP11, "<cards:created xmlns:cards=\"urn:synthetic:cards\"><cards:accountNumber>" + value + "</cards:accountNumber></cards:created>");
        assertEquals(value, readResponse(PortableResponseKind.SOAP11, body, XML_SELECTORS, NAMESPACES).get("accountNumber"));
    }

    private JsonNode readJson(String body) {
        try { return new ObjectMapper().readTree(body); }
        catch (Exception failure) { throw new AssertionError(failure); }
    }

    private String envelope(String namespace, String content) {
        return "<env:Envelope xmlns:env=\"" + namespace + "\"><env:Body>" + content + "</env:Body></env:Envelope>";
    }

    private ApiFailure assertFailure(int status, org.junit.jupiter.api.function.Executable operation) {
        ApiFailure failure = assertThrows(ApiFailure.class, operation);
        assertEquals(status, failure.status());
        return failure;
    }
}
