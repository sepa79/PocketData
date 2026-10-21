package io.pockethive.pocketdata;

import io.pockethive.requesttemplates.PortableHttpCall;
import io.pockethive.requesttemplates.PortableHttpCallParser;
import io.pockethive.templatedata.TemplateDataException;
import io.pockethive.templating.PortableHttpBinding;
import io.pockethive.templating.PortableHttpRenderer;
import io.pockethive.templating.PortableHttpRequest;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Responsibility: bind PD's selected endpoint/record/params to the shared portable call. Must not: parse/render templates independently, execute HTTP or persist results. Contract: docs/POPULATION.md. */
@Component
public final class PopulationTemplates {
    private final PortableHttpCallParser parser = new PortableHttpCallParser();
    private final PortableHttpRenderer renderer = new PortableHttpRenderer();
    public PortableHttpCall parse(Map<?, ?> source) {
        try {
            PortableHttpCall call = parser.parse(source);
            renderer.validate(call);
            return call;
        } catch (TemplateDataException failure) { throw new ApiFailure(400, "Invalid portable call: " + failure.code()); }
    }
    public PortableHttpRequest render(PopulationStep step, Map<String, String> record, Map<String, String> params) {
        try { return renderer.render(step.call(), new PortableHttpBinding(step.endpoint(), record, params)); }
        catch (TemplateDataException failure) { throw new ApiFailure(400, "Portable rendering failed: " + failure.code()); }
    }
}
