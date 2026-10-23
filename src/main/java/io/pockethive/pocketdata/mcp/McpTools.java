package io.pockethive.pocketdata.mcp;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.server.McpStatelessServerFeatures;
import io.modelcontextprotocol.spec.McpSchema;
import io.pockethive.pocketdata.*;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Responsibility: adapt MCP calls to existing authoritative services and fresh PH access. Must not: duplicate validation, execute arbitrary code or cache authorization. Contract: docs/MCP.md; safe isError failures, no implicit start. */
@Component
public final class McpTools {
    private static final Set<String> PUBLIC = Set.of("get_access", "list_suts", "list_datasets", "get_population_example");
    private final AuthService auth;
    private final CatalogStore catalog;
    private final RedisDatasets redis;
    private final PopulationPreparation preparation;
    private final PopulationDrafts drafts;
    private final PopulationJobs jobs;
    private final ObjectMapper mapper;
    public McpTools(AuthService auth, CatalogStore catalog, RedisDatasets redis, PopulationPreparation preparation,
                    PopulationDrafts drafts, PopulationJobs jobs, ObjectMapper mapper) {
        this.auth = auth; this.catalog = catalog; this.redis = redis; this.preparation = preparation;
        this.drafts = drafts; this.jobs = jobs; this.mapper = mapper;
    }
    List<McpStatelessServerFeatures.SyncToolSpecification> specifications() {
        return McpToolCatalog.tools().stream().map(tool -> new McpStatelessServerFeatures.SyncToolSpecification(tool,
            (context, request) -> call(tool, context, request))).toList();
    }
    private McpSchema.CallToolResult call(McpSchema.Tool tool, McpTransportContext context, McpSchema.CallToolRequest request) {
        try {
            String authorization = (String) context.get(McpConfiguration.AUTHORIZATION);
            if (!PUBLIC.contains(tool.name())) auth.requireEditor(authorization);
            McpArguments arguments = new McpArguments(tool, request.arguments(), mapper);
            Object result = switch (tool.name()) {
                case "get_access" -> auth.access(authorization);
                case "list_suts" -> catalog.read();
                case "list_datasets" -> { catalog.require(arguments.text("sut")); yield Map.of("datasets", redis.list(arguments.text("sut"))); }
                case "get_population_example" -> example();
                case "validate_population" -> {
                    PopulationRequest recipe = preparation.validate(arguments.text("sut"), arguments.text("dataset"), arguments.text("list"), arguments.recipe());
                    yield Map.of("valid", true, "executed", false, "name", recipe.name(), "count", recipe.count(), "pacing", recipe.pacing(), "columns", recipe.columns());
                }
                case "get_population_draft" -> drafts.read(arguments.text("sut"), arguments.text("dataset"));
                case "save_population_draft" -> drafts.save(arguments.text("sut"), arguments.text("dataset"), arguments.text("list"), arguments.revision(), arguments.recipe());
                case "start_population" -> jobs.start(arguments.text("sut"), arguments.text("dataset"), arguments.text("list"), arguments.recipe());
                case "list_population_jobs" -> {
                    preparation.requireDataset(arguments.text("sut"), arguments.text("dataset"));
                    yield Map.of("jobs", jobs.list(arguments.text("sut"), arguments.text("dataset")));
                }
                case "get_population_job" -> jobs.read(arguments.text("sut"), arguments.text("dataset"), arguments.text("job_id"));
                case "stop_population" -> jobs.stop(arguments.text("sut"), arguments.text("dataset"), arguments.text("job_id"));
                default -> throw new IllegalStateException("Unregistered tool");
            };
            return McpSchema.CallToolResult.builder().isError(false).structuredContent(mapper.valueToTree(result))
                .addTextContent(mapper.writeValueAsString(result)).build();
        } catch (ApiFailure failure) {
            return error("HTTP_" + failure.status(), failure.getMessage());
        } catch (IOException | RuntimeException failure) {
            return error("INTERNAL_ERROR", "PocketData tool could not be completed. Do not automatically retry a mutation or start.");
        }
    }
    private Object example() throws IOException {
        try (var input = McpTools.class.getResourceAsStream("/examples/population-soap.json")) {
            if (input == null) throw new IOException("Missing example");
            return Map.of("recipe", mapper.readTree(input));
        }
    }
    private static McpSchema.CallToolResult error(String code, String message) {
        return McpSchema.CallToolResult.builder().isError(true).addTextContent(code + ": " + message).build();
    }
}
