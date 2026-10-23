package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.lettuce.core.KeyScanCursor;
import io.lettuce.core.RedisClient;
import io.lettuce.core.ScanArgs;
import io.lettuce.core.ScanCursor;
import io.lettuce.core.ScriptOutputType;
import io.lettuce.core.SetArgs;
import io.lettuce.core.api.StatefulRedisConnection;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Responsibility: own Redis connections and dataset metadata/list operations. Must not: manage checkout states or CSV inventory. Contract: docs/DATASET.md. */
@Component
public class RedisDatasets {
    private final String url;
    private final ObjectMapper mapper;
    private final RecordFormat formats;
    private RedisClient client;
    private StatefulRedisConnection<String, String> connection;
    public RedisDatasets(@Value("${POCKETDATA_REDIS_URL:}") String url, ObjectMapper mapper, RecordFormat formats) {
        this.url = url; this.mapper = mapper; this.formats = formats;
    }
    public boolean configured() { return !url.isBlank(); }
    private synchronized StatefulRedisConnection<String, String> connection() {
        if (!configured()) throw new ApiFailure(503, "Redis is not configured. Set POCKETDATA_REDIS_URL.");
        try {
            if (connection == null) {
                if (client == null) {
                    io.lettuce.core.RedisURI address = io.lettuce.core.RedisURI.create(url);
                    address.setTimeout(Duration.ofSeconds(5));
                    client = RedisClient.create(address);
                }
                connection = client.connect();
            }
            return connection;
        } catch (RuntimeException failure) { throw new ApiFailure(503, "Redis is unavailable."); }
    }
    public static String prefix(String sut, String name) { return CatalogStore.identifier(sut) + ":" + CatalogStore.identifier(name); }
    public static String listKey(String sut, String name, String list) { return prefix(sut, name) + ":data:" + CatalogStore.identifier(list); }
    public DatasetDefinition require(String sut, String name) {
        try {
            String raw = connection().sync().get(prefix(sut, name) + ":meta:format");
            if (raw == null) throw new ApiFailure(404, "Dataset format not found.");
            return decode(sut, name, raw);
        } catch (ApiFailure failure) { throw failure; }
        catch (Exception failure) { throw new ApiFailure(503, "Redis dataset metadata could not be read. Check its format."); }
    }
    private DatasetDefinition decode(String sut, String name, String raw) throws java.io.IOException {
        DatasetDefinition result = formats.validate(mapper.readValue(raw, DatasetDefinition.class));
        if (!result.sutId().equals(sut) || !result.name().equals(name)) throw new ApiFailure(502, "Dataset metadata does not match its Redis namespace.");
        return result;
    }
    public DatasetDefinition update(String sut, String name, DatasetUpdate update) {
        if (update == null) throw new ApiFailure(400, "DataSet edit is required.");
        formats.validateUpdate(update.expected(), update.definition());
        if (!sut.equals(update.definition().sutId()) || !name.equals(update.definition().name())) throw new ApiFailure(400, "DataSet edit must match the selected SUT and DataSet.");
        try {
            String key = prefix(sut, name) + ":meta:format";
            var commands = connection().sync();
            String raw = commands.get(key);
            if (raw == null) throw new ApiFailure(404, "Dataset format not found.");
            if (!decode(sut, name, raw).equals(update.expected())) throw new ApiFailure(409, "DataSet changed. Reload before editing again.");
            Long saved = commands.eval("if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL') return 1",
                ScriptOutputType.INTEGER, new String[] { key }, raw, mapper.writeValueAsString(update.definition()));
            if (saved == null || saved != 1L) throw new ApiFailure(409, "DataSet changed. Reload before editing again.");
            return update.definition();
        } catch (ApiFailure failure) { throw failure; }
        catch (Exception failure) { throw new ApiFailure(503, "DataSet edit failed or its result is unknown. Refresh before retrying."); }
    }
    public DatasetDefinition create(DatasetDefinition definition) {
        formats.validate(definition);
        try {
            String result = connection().sync().set(prefix(definition.sutId(), definition.name()) + ":meta:format", mapper.writeValueAsString(definition), SetArgs.Builder.nx());
            if (result == null) throw new ApiFailure(409, "Dataset already exists. Its format was not overwritten.");
            return definition;
        } catch (ApiFailure failure) { throw failure; }
        catch (Exception failure) { throw new ApiFailure(503, "Dataset creation failed or its result is unknown. Check before retrying."); }
    }
    public List<Map<String, Object>> list(String sut) {
        CatalogStore.identifier(sut);
        try {
            var commands = connection().sync();
            List<Map<String, Object>> result = new ArrayList<>();
            ScanCursor cursor = ScanCursor.INITIAL;
            do {
                KeyScanCursor<String> page = commands.scan(cursor, ScanArgs.Builder.matches(sut + ":*:meta:format").limit(100));
                for (String key : page.getKeys()) {
                    String[] parts = key.split(":");
                    if (parts.length != 4) throw new ApiFailure(502, "Invalid dataset metadata key.");
                    DatasetDefinition format = require(sut, parts[1]);
                    Map<String, Long> counts = new LinkedHashMap<>();
                    for (String list : format.lists()) counts.put(list, commands.llen(listKey(sut, format.name(), list)));
                    result.add(Map.of("format", format, "counts", counts));
                    if (result.size() > 200) throw new ApiFailure(413, "This first version supports listing up to 200 datasets per SUT.");
                }
                cursor = page;
            } while (!cursor.isFinished());
            result.sort(java.util.Comparator.comparing(item -> ((DatasetDefinition) item.get("format")).name()));
            return result;
        } catch (ApiFailure failure) { throw failure; }
        catch (RuntimeException failure) { throw new ApiFailure(503, "Redis listing is unavailable; no empty result was substituted."); }
    }
    public void publish(DatasetDefinition dataset, String list, Map<String, Object> record) {
        if (!dataset.lists().contains(list)) throw new ApiFailure(400, "Unknown target list for this dataset.");
        try { connection().sync().rpush(listKey(dataset.sutId(), dataset.name(), list), mapper.writeValueAsString(record)); }
        catch (Exception failure) { throw new ApiFailure(503, "Redis publication failed or is uncertain. Do not blindly retry this import."); }
    }
    @PreDestroy public synchronized void close() {
        if (connection != null) connection.close();
        if (client != null) client.shutdown();
    }
}
