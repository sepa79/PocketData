package io.pockethive.pocketdata;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Responsibility: preflight the finite recipe and referenced SUT/DataSet before execution. Must not: execute requests, write inventory or duplicate PH template parsing. Contract: docs/POPULATION.md. */
@Component
public final class PopulationValidator {
    private final ObjectMapper mapper;
    private final PopulationTemplates templates;
    public PopulationValidator(ObjectMapper mapper, PopulationTemplates templates) {
        this.mapper = mapper; this.templates = templates;
    }
    public PopulationRequest validate(JsonNode source, SutDefinition sut, DatasetDefinition format) {
        fields(source, Set.of("name", "count", "values", "params", "steps"));
        String name = text(source.get("name"), 160);
        JsonNode count = source.get("count");
        if (!count.isIntegralNumber() || !count.canConvertToInt() || count.intValue() < 1 || count.intValue() > 1000) throw new ApiFailure(400, "Population count must be 1–1000.");
        Map<String, String> values = strings(source.get("values"), 200, 8192);
        Map<String, String> params = strings(source.get("params"), 200, 8192);
        if (params.containsKey("iteration")) throw new ApiFailure(400, "params.iteration is owned by the population loop.");
        LinkedHashSet<String> columns = new LinkedHashSet<>(values.keySet());
        JsonNode steps = source.get("steps");
        if (!steps.isArray() || steps.isEmpty() || steps.size() > 20) throw new ApiFailure(400, "Define 1–20 explicit request steps.");
        List<PopulationStep> result = new ArrayList<>();
        Set<String> names = new java.util.HashSet<>();
        for (JsonNode step : steps) {
            fields(step, Set.of("name", "endpoint", "call"));
            String stepName = text(step.get("name"), 80);
            if (!names.add(stepName)) throw new ApiFailure(400, "Step names must be unique.");
            String address = sut.endpoints().get(text(step.get("endpoint"), 64));
            if (address == null) throw new ApiFailure(400, "A step names an unknown SUT endpoint.");
            URI endpoint = URI.create(address);
            if (!Set.of("http", "https").contains(endpoint.getScheme())) throw new ApiFailure(400, "Population endpoints must use HTTP or HTTPS.");
            JsonNode callSource = step.get("call");
            if (!callSource.isObject()) throw new ApiFailure(400, "Each step requires an explicit portable call.");
            Map<String, Object> raw = mapper.convertValue(callSource, new TypeReference<>() {});
            var call = templates.parse(raw);
            columns.addAll(call.response().extract().keySet());
            result.add(new PopulationStep(stepName, endpoint, call));
        }
        if (columns.isEmpty() || columns.size() > 200 || columns.stream().anyMatch(field -> !field.matches("[A-Za-z][A-Za-z0-9_]{0,79}"))) throw new ApiFailure(400, "Use at most 200 canonical output column names.");
        for (RecordField field : format.fields()) if (field.required() && !columns.contains(field.name())) throw new ApiFailure(400, "The recipe cannot supply every required DataSet field.");
        return new PopulationRequest(name, count.intValue(), Map.copyOf(values), Map.copyOf(params), List.copyOf(result), List.copyOf(columns));
    }
    private static void fields(JsonNode value, Set<String> expected) {
        if (value == null || !value.isObject()) throw new ApiFailure(400, "Expected a recipe object.");
        Set<String> actual = new java.util.HashSet<>(); value.fieldNames().forEachRemaining(actual::add);
        if (!actual.equals(expected)) throw new ApiFailure(400, "Recipe fields are missing or unknown.");
    }
    private static Map<String, String> strings(JsonNode value, int maximum, int length) {
        if (value == null || !value.isObject() || value.size() > maximum) throw new ApiFailure(400, "Invalid recipe mapping.");
        Map<String, String> result = new LinkedHashMap<>();
        value.properties().forEach(entry -> {
            if (entry.getKey().isBlank() || entry.getKey().length() > 80) throw new ApiFailure(400, "Invalid recipe mapping key.");
            result.put(entry.getKey(), textAllowEmpty(entry.getValue(), length));
        });
        return result;
    }
    private static String text(JsonNode value, int maximum) {
        String result = textAllowEmpty(value, maximum);
        if (result.isBlank()) throw new ApiFailure(400, "Required recipe text is empty.");
        return result;
    }
    private static String textAllowEmpty(JsonNode value, int maximum) {
        if (value == null || !value.isTextual() || value.textValue().length() > maximum) throw new ApiFailure(400, "Invalid recipe text.");
        return value.textValue();
    }
}
