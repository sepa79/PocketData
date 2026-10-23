package io.pockethive.pocketdata.mcp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.modelcontextprotocol.spec.McpSchema;
import io.pockethive.pocketdata.ApiFailure;
import java.util.Map;

/** Responsibility: enforce exact MCP argument envelopes without coercion. Must not: validate recipes or own domain identifiers. Contract: docs/MCP.md; missing/extra/null arguments fail. */
final class McpArguments {
    private final JsonNode values;
    McpArguments(McpSchema.Tool tool, Map<String, Object> arguments, ObjectMapper mapper) {
        Map<String, Object> supplied = arguments == null ? Map.of() : arguments;
        if (!supplied.keySet().equals(((Map<?, ?>) tool.inputSchema().get("properties")).keySet())) throw new ApiFailure(400, "Missing or unknown tool arguments.");
        values = mapper.valueToTree(supplied);
    }
    String text(String key) {
        JsonNode value = values.get(key);
        if (value == null || !value.isTextual() || value.textValue().isBlank()) throw new ApiFailure(400, "Expected nonempty text: " + key);
        return value.textValue();
    }
    long revision() {
        JsonNode value = values.get("expected_revision");
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 0 || value.longValue() == Long.MAX_VALUE)
            throw new ApiFailure(400, "Expected an exact nonnegative revision.");
        return value.longValue();
    }
    JsonNode recipe() {
        JsonNode recipe = values.get("recipe");
        if (recipe == null || !recipe.isObject()) throw new ApiFailure(400, "Expected recipe object.");
        return recipe;
    }
}
