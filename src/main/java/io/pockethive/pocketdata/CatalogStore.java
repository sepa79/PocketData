package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.HashSet;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Responsibility: validate and atomically persist the SUT catalogue. Must not: write Redis data. Contract: docs/ARCHITECTURE.md. */
@Component
public class CatalogStore {
    private final Path directory;
    private final ObjectMapper mapper;
    public CatalogStore(@Value("${POCKETDATA_DATA_DIR:./data}") String directory, ObjectMapper mapper) throws IOException {
        this.directory = Path.of(directory).toAbsolutePath().normalize();
        this.mapper = mapper;
        Files.createDirectories(this.directory);
        read();
    }
    public static String identifier(String value) {
        if (value == null || !value.matches("[a-z0-9][a-z0-9_-]{0,63}")) throw new ApiFailure(400, "IDs use 1–64 lowercase letters, digits, underscores or hyphens.");
        return value;
    }
    public synchronized CatalogSnapshot read() throws IOException {
        Path file = directory.resolve("suts.json");
        if (!Files.exists(file)) return new CatalogSnapshot(0, List.of());
        CatalogSnapshot result = mapper.readValue(Files.readAllBytes(file), CatalogSnapshot.class);
        validate(result);
        return result;
    }
    public synchronized CatalogSnapshot save(CatalogSnapshot candidate) throws IOException {
        validate(candidate);
        CatalogSnapshot current = read();
        if (candidate.revision() != current.revision()) throw new ApiFailure(409, "SUT definitions changed. Reload before saving.");
        CatalogSnapshot saved = new CatalogSnapshot(current.revision() + 1, List.copyOf(candidate.suts()));
        Path temporary = Files.createTempFile(directory, ".suts-", ".tmp");
        try {
            Files.write(temporary, mapper.writeValueAsBytes(saved));
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) { channel.force(true); }
            Files.move(temporary, directory.resolve("suts.json"), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally { Files.deleteIfExists(temporary); }
        return saved;
    }
    public SutDefinition require(String id) throws IOException {
        identifier(id);
        return read().suts().stream().filter(sut -> sut.id().equals(id)).findFirst().orElseThrow(() -> new ApiFailure(404, "SUT not found."));
    }
    public Path inventoryDirectory(String sut, String dataset) throws IOException {
        require(sut); identifier(dataset);
        Path result = directory.resolve("inventory").resolve(sut).resolve(dataset);
        Files.createDirectories(result);
        return result;
    }
    public Path populationDirectory(String sut, String dataset) throws IOException {
        require(sut); identifier(dataset);
        Path result = directory.resolve("population").resolve(sut).resolve(dataset);
        Files.createDirectories(result);
        return result;
    }
    private void validate(CatalogSnapshot candidate) {
        if (candidate == null || candidate.revision() < 0 || candidate.suts() == null || candidate.suts().size() > 200) throw new ApiFailure(400, "Invalid SUT catalogue.");
        HashSet<String> identifiers = new HashSet<>();
        for (SutDefinition sut : candidate.suts()) {
            if (sut == null || !identifiers.add(identifier(sut.id())) || sut.name() == null || sut.name().isBlank() || sut.name().length() > 150 || sut.description() == null || sut.description().length() > 2000 || sut.endpoints() == null || sut.endpoints().size() > 30) throw new ApiFailure(400, "Invalid or duplicate SUT definition.");
            sut.endpoints().forEach((name, endpoint) -> {
                identifier(name);
                if (endpoint == null || endpoint.isBlank() || endpoint.length() > 2048 || endpoint.indexOf('\n') >= 0) throw new ApiFailure(400, "Invalid SUT endpoint.");
                java.net.URI address;
                try { address = java.net.URI.create(endpoint); }
                catch (IllegalArgumentException failure) { throw new ApiFailure(400, "SUT endpoints must be explicit URLs."); }
                if (address.getHost() == null || !java.util.Set.of("http", "https", "tcp", "tcps").contains(address.getScheme()) || address.getUserInfo() != null || address.getQuery() != null || address.getFragment() != null) throw new ApiFailure(400, "Use HTTP(S)/TCP(S) base URLs without credentials, query or fragment.");
            });
        }
    }
}
