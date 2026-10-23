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
    @Test void metadataEditsPreserveRecordsAndRejectStaleOrExternalChanges() throws Exception {
        String sut = "test-" + UUID.randomUUID();
        ObjectMapper mapper = new ObjectMapper();
        RedisDatasets redis = new RedisDatasets(System.getenv("POCKETDATA_TEST_REDIS_URL"), mapper, new RecordFormat());
        RedisClient fixture = RedisClient.create(System.getenv("POCKETDATA_TEST_REDIS_URL"));
        var original = new DatasetDefinition(sut, "cards", "Original", List.of(new RecordField("accountNumber", "string", true)), List.of("ready"));
        var changed = new DatasetDefinition(sut, "cards", "Changed", original.fields(), List.of("ready", "returned"));
        String key = RedisDatasets.prefix(sut, "cards") + ":meta:format";
        try (var client = fixture.connect()) {
            assertEquals(404, assertThrows(ApiFailure.class, () -> redis.update(sut, "cards", new DatasetUpdate(original, changed))).status());
            redis.create(original);
            String record = "{\"accountNumber\":\"000123\",\"extra\":\"retained\"}";
            client.sync().rpush(RedisDatasets.listKey(sut, "cards", "ready"), record);
            assertEquals(changed, redis.update(sut, "cards", new DatasetUpdate(original, changed)));
            assertEquals(record, client.sync().lindex(RedisDatasets.listKey(sut, "cards", "ready"), 0));
            assertEquals(1L, client.sync().llen(RedisDatasets.listKey(sut, "cards", "ready")));
            assertEquals(409, assertThrows(ApiFailure.class, () -> redis.update(sut, "cards", new DatasetUpdate(original, changed))).status());
            var external = new DatasetDefinition(sut, "cards", "External update", changed.fields(), changed.lists());
            client.sync().set(key, mapper.writeValueAsString(external));
            assertEquals(409, assertThrows(ApiFailure.class, () -> redis.update(sut, "cards", new DatasetUpdate(changed, changed))).status());
            assertEquals(external, redis.require(sut, "cards"));
            assertEquals(400, assertThrows(ApiFailure.class, () -> redis.update(sut, "other", new DatasetUpdate(external, external))).status());
        } finally {
            try (var client = fixture.connect()) { client.sync().del(key, RedisDatasets.listKey(sut, "cards", "ready")); }
            redis.close(); fixture.shutdown();
        }
    }
    @Test void concurrentEditsHaveExactlyOneWinner() throws Exception {
        String sut = "test-" + UUID.randomUUID();
        ObjectMapper mapper = new ObjectMapper();
        RedisDatasets redis = new RedisDatasets(System.getenv("POCKETDATA_TEST_REDIS_URL"), mapper, new RecordFormat());
        RedisClient fixture = RedisClient.create(System.getenv("POCKETDATA_TEST_REDIS_URL"));
        var original = new DatasetDefinition(sut, "cards", "Original", List.of(new RecordField("accountNumber", "string", true)), List.of("ready"));
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            redis.create(original);
            var gate = new java.util.concurrent.CountDownLatch(1);
            var outcomes = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
            for (String description : List.of("Editor one", "Editor two")) outcomes.add(executor.submit(() -> {
                gate.await();
                try {
                    redis.update(sut, "cards", new DatasetUpdate(original, new DatasetDefinition(sut, "cards", description, original.fields(), original.lists())));
                    return 200;
                } catch (ApiFailure failure) { return failure.status(); }
            }));
            gate.countDown();
            var statuses = new java.util.ArrayList<Integer>();
            for (var outcome : outcomes) statuses.add(outcome.get(10, java.util.concurrent.TimeUnit.SECONDS));
            statuses.sort(Integer::compareTo);
            assertEquals(List.of(200, 409), statuses);
        } finally {
            try (var client = fixture.connect()) { client.sync().del(RedisDatasets.prefix(sut, "cards") + ":meta:format"); }
            redis.close(); fixture.shutdown();
        }
    }
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
