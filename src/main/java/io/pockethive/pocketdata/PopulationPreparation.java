package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import org.springframework.stereotype.Component;

/** Responsibility: resolve and validate a population target and recipe without effects. Must not: execute HTTP, publish records or save drafts. Contract: docs/POPULATION.md and docs/MCP.md. */
@Component
public final class PopulationPreparation {
    private final CatalogStore catalog;
    private final RedisDatasets redis;
    private final PopulationValidator validator;
    public PopulationPreparation(CatalogStore catalog, RedisDatasets redis, PopulationValidator validator) {
        this.catalog = catalog; this.redis = redis; this.validator = validator;
    }
    public PopulationRequest validate(String sut, String dataset, String list, JsonNode recipe) throws IOException {
        return prepare(sut, dataset, list, recipe).recipe();
    }
    public DatasetDefinition requireDataset(String sut, String dataset) throws IOException {
        catalog.require(sut);
        return redis.require(sut, dataset);
    }
    public PreparedPopulation prepare(String sut, String dataset, String list, JsonNode recipe) throws IOException {
        SutDefinition selected = catalog.require(sut);
        DatasetDefinition format = redis.require(sut, dataset);
        if (!format.lists().contains(list)) throw new ApiFailure(400, "Unknown target list.");
        return new PreparedPopulation(format, validator.validate(recipe, selected, format));
    }
}
