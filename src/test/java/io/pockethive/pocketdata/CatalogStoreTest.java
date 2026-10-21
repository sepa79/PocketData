package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class CatalogStoreTest {
    @TempDir Path directory;
    @Test void persistsAcrossRecreationAndRejectsStaleWrites() throws Exception {
        CatalogStore store = new CatalogStore(directory.toString(), new ObjectMapper());
        SutDefinition sut = new SutDefinition("lab", "Lab", "Synthetic", Map.of("api", "https://example.invalid"));
        assertEquals(1, store.save(new CatalogSnapshot(0, List.of(sut))).revision());
        CatalogStore restarted = new CatalogStore(directory.toString(), new ObjectMapper());
        assertEquals(sut, restarted.require("lab"));
        assertEquals(409, assertThrows(ApiFailure.class, () -> restarted.save(new CatalogSnapshot(0, List.of()))).status());
    }
    @Test void rejectsDuplicateIds() throws Exception {
        CatalogStore store = new CatalogStore(directory.toString(), new ObjectMapper());
        SutDefinition sut = new SutDefinition("lab", "Lab", "", Map.of());
        assertThrows(ApiFailure.class, () -> store.save(new CatalogSnapshot(0, List.of(sut, sut))));
        assertEquals(0, store.read().revision());
    }
    @Test void rejectsNamespaceTraversal() {
        for (String identity : List.of("../bad", "bad:other", "bad*", "LAB", "", "a/b")) assertThrows(ApiFailure.class, () -> CatalogStore.identifier(identity));
    }
}
