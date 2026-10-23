package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Responsibility: atomically store one revision-checked population draft per SUT/DataSet. Must not: execute jobs or duplicate recipe validation. Contract: docs/MCP.md; explicit save never runs a recipe. */
@Component
public final class PopulationDrafts {
    private final Path directory;
    private final ObjectMapper mapper;
    private final PopulationPreparation preparation;
    public PopulationDrafts(@Value("${POCKETDATA_DATA_DIR:./data}") String directory, ObjectMapper mapper,
                            PopulationPreparation preparation) {
        this.directory = Path.of(directory).toAbsolutePath().normalize().resolve("population-drafts");
        this.mapper = mapper; this.preparation = preparation;
    }
    public synchronized PopulationDraft read(String sut, String dataset) throws IOException {
        preparation.requireDataset(sut, dataset);
        Path file = file(sut, dataset);
        if (!Files.exists(file)) return new PopulationDraft(0, "", null);
        if (Files.size(file) > 1024 * 1024) throw new ApiFailure(503, "Saved population draft exceeds its size limit.");
        PopulationDraft result = mapper.readValue(Files.readAllBytes(file), PopulationDraft.class);
        if (result.revision() < 1 || result.list() == null || result.recipe() == null || !result.recipe().isObject())
            throw new ApiFailure(503, "Saved population draft is invalid.");
        return result;
    }
    public synchronized PopulationDraft save(String sut, String dataset, String list, long revision, JsonNode recipe) throws IOException {
        if (revision < 0) throw new ApiFailure(400, "Expected revision must be nonnegative.");
        preparation.validate(sut, dataset, list, recipe);
        PopulationDraft current = read(sut, dataset);
        if (current.revision() != revision) throw new ApiFailure(409, "Population draft changed. Read it again before saving.");
        PopulationDraft result = new PopulationDraft(Math.addExact(revision, 1), list, recipe.deepCopy());
        byte[] bytes = mapper.writeValueAsBytes(result);
        if (bytes.length > 1024 * 1024) throw new ApiFailure(413, "Population draft limit is 1 MiB.");
        Path file = file(sut, dataset);
        Files.createDirectories(file.getParent());
        Path temporary = Files.createTempFile(file.getParent(), ".draft-", ".tmp");
        try {
            Files.write(temporary, bytes);
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) { channel.force(true); }
            Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally { Files.deleteIfExists(temporary); }
        return result;
    }
    private Path file(String sut, String dataset) {
        return directory.resolve(CatalogStore.identifier(sut)).resolve(CatalogStore.identifier(dataset) + ".json");
    }
}
