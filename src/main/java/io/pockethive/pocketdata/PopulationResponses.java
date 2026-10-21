package io.pockethive.pocketdata;

import io.pockethive.requesttemplates.PortableHttpCall;
import io.pockethive.requesttemplates.PortableResponseExtractor;
import io.pockethive.templatedata.TemplateDataException;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Responsibility: map shared portable response failures to the PD API. Must not: parse JSON/XML, select nodes or decide protocol rules. Contract: docs/POPULATION.md. */
@Component
public final class PopulationResponses {
    private final PortableResponseExtractor extractor = new PortableResponseExtractor();
    public Map<String, String> extract(PortableHttpCall call, int status, String body) {
        try { return extractor.extract(call, status, body); }
        catch (TemplateDataException failure) { throw new ApiFailure(502, "Portable response rejected: " + failure.code()); }
    }
}
