package io.pockethive.pocketdata;

import static org.junit.jupiter.api.Assertions.*;

import io.pockethive.requesttemplates.PortableHttpCall;
import io.pockethive.requesttemplates.PortableHttpCallParser;
import io.pockethive.requesttemplates.PortableResponseExtractor;
import io.pockethive.templatedata.JsonDocumentReader;
import io.pockethive.templating.PortableHttpBinding;
import io.pockethive.templating.PortableHttpRenderer;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PopulationTemplatesTest {
    private final PopulationTemplates templates = new PopulationTemplates();
    @ParameterizedTest @ValueSource(strings = {"account-json", "card-soap11", "card-soap12"})
    void pdAndPhRenderIdenticalAuthoredArtifactsAndResponseFields(String name) throws Exception {
        String source;
        try (var input = getClass().getResourceAsStream("/portable/examples/" + name + ".json")) {
            assertNotNull(input); source = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
        Map<String,Object> artifact = new JsonDocumentReader().readObject(source);
        PortableHttpCall pd = templates.parse(artifact);
        PortableHttpCall ph = new PortableHttpCallParser().parse(source);
        URI endpoint = URI.create("https://example.test/services/cards?tenant=qa");
        Map<String,String> record = Map.of("accountNumber", "0001 & <account>", "customerId", "000123");
        Map<String,String> params = Map.of("productClass", "A\"'&");
        var actual = templates.render(new PopulationStep("qa", endpoint, pd), record, params);
        var expected = new PortableHttpRenderer().render(ph, new PortableHttpBinding(endpoint, record, params));
        assertEquals(expected, actual);
        String namespace = name.endsWith("11") ? "http://schemas.xmlsoap.org/soap/envelope/" : "http://www.w3.org/2003/05/soap-envelope";
        String response = name.equals("account-json") ? "{\"accountNumber\":\"000123\"}" : "<s:Envelope xmlns:s=\"" + namespace + "\"><s:Body><c:CreateCardResponse xmlns:c=\"urn:cards\"><c:cardNumber>000456</c:cardNumber></c:CreateCardResponse></s:Body></s:Envelope>";
        assertEquals(new PortableResponseExtractor().extract(ph, ph.response().expectedStatus(), response),
            new PopulationResponses().extract(pd, pd.response().expectedStatus(), response));
        assertThrows(ApiFailure.class, () -> templates.render(new PopulationStep("qa", endpoint, pd), Map.of(), params));
    }
    @Test void failedAdmissionUsesSafeProductDiagnostics() throws Exception {
        assertEquals(400, assertThrows(ApiFailure.class, () -> templates.parse(Map.of("profile", "unknown"))).status());
    }
}
