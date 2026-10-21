package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.lettuce.core.RedisClient;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="POCKETDATA_TEST_REDIS_URL", matches="redis://127\\.0\\.0\\.1:16385/0")
class RedisAndCsvTest {
    @TempDir Path directory;
    @Test void csvIsDurableBeforePublicationAndExtraFieldsSurvive() throws Exception {
        String sut = "test-" + UUID.randomUUID(); ObjectMapper mapper = new ObjectMapper();
        CatalogStore catalog = new CatalogStore(directory.toString(), mapper);
        catalog.save(new CatalogSnapshot(0, List.of(new SutDefinition(sut, "Synthetic", "", Map.of()))));
        RecordFormat fields = new RecordFormat();
        RedisDatasets redis = new RedisDatasets(System.getenv("POCKETDATA_TEST_REDIS_URL"), mapper, fields);
        DatasetDefinition dataset = new DatasetDefinition(sut, "cards", "", List.of(new RecordField("accountNumber", "string", true)), List.of("ready"));
        RedisClient fixture = RedisClient.create(System.getenv("POCKETDATA_TEST_REDIS_URL"));
        try (var client = fixture.connect()) {
            redis.create(dataset);
            assertEquals(409, assertThrows(ApiFailure.class, () -> redis.create(dataset)).status());
            CsvInventory inventory = new CsvInventory(catalog, redis, fields, mapper);
            Map<String, Object> result = inventory.importCsv(sut, "cards", "ready", new ByteArrayInputStream("accountNumber,extraField\r\n000123,\"hello, world\"\r\n".getBytes(StandardCharsets.UTF_8)));
            assertEquals(1L, result.get("published"));
            assertTrue(Files.isRegularFile(catalog.inventoryDirectory(sut, "cards").resolve(result.get("id") + ".csv")));
            String record = client.sync().lpop(RedisDatasets.listKey(sut, "cards", "ready"));
            assertEquals("000123", mapper.readTree(record).path("accountNumber").asText());
            assertEquals("hello, world", mapper.readTree(record).path("extraField").asText());
            assertEquals(1, new CsvInventory(new CatalogStore(directory.toString(), mapper), redis, fields, mapper).list(sut, "cards").size());
            assertThrows(ApiFailure.class, () -> inventory.importCsv(sut, "cards", "ready", new ByteArrayInputStream("wrongColumn\n123\n".getBytes(StandardCharsets.UTF_8))));
            assertEquals(0L, client.sync().llen(RedisDatasets.listKey(sut, "cards", "ready")));
        } finally {
            try (var client = fixture.connect()) { client.sync().del(sut + ":cards:meta:format", sut + ":cards:data:ready"); }
            redis.close(); fixture.shutdown();
        }
    }
}
