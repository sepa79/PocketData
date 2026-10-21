package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.PushbackReader;
import java.nio.channels.FileChannel;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.DuplicateHeaderMode;
import org.springframework.stereotype.Component;

/** Responsibility: validate and persist CSV inventory before Redis publication. Must not: create SUT resources or automatically replay uncertain writes. Contract: docs/DATASET.md. */
@Component
public class CsvInventory {
    private static final long MAX_BYTES = 25L * 1024 * 1024;
    private final CatalogStore catalog;
    private final RedisDatasets redis;
    private final RecordFormat formats;
    private final ObjectMapper mapper;
    private final java.util.Set<String> generating = java.util.concurrent.ConcurrentHashMap.newKeySet();
    public CsvInventory(CatalogStore catalog, RedisDatasets redis, RecordFormat formats, ObjectMapper mapper) {
        this.catalog = catalog; this.redis = redis; this.formats = formats; this.mapper = mapper;
    }
    public GeneratedInventory beginGeneration(String sut, String name, List<String> columns) throws IOException {
        String id = UUID.randomUUID().toString();
        generating.add(id);
        try {
            DurableCsv records = new DurableCsv(catalog.inventoryDirectory(sut, name).resolve(id + ".csv"), columns);
            try {
                DurableCsv responses = new DurableCsv(catalog.populationDirectory(sut, name).resolve(id + ".csv"), List.of("iteration", "step", "httpStatus", "responseBody"));
                return new GeneratedInventory(id, columns, records, responses, () -> generating.remove(id));
            } catch (IOException | RuntimeException failure) { records.close(); throw failure; }
        } catch (IOException | RuntimeException failure) { generating.remove(id); throw failure; }
    }
    public void downloadResponses(String sut, String dataset, String identity, HttpServletResponse response) throws IOException {
        identity(identity);
        requireClosed(identity);
        downloadFile(catalog.populationDirectory(sut, dataset).resolve(identity + ".csv"), dataset + "-responses-" + identity, response);
    }
    public synchronized Map<String, Object> importCsv(String sut, String name, String list, InputStream input) throws IOException {
        catalog.require(sut);
        DatasetDefinition format = redis.require(sut, name);
        if (!format.lists().contains(list)) throw new ApiFailure(400, "Unknown target list.");
        Path directory = catalog.inventoryDirectory(sut, name);
        String identity = UUID.randomUUID().toString();
        Path temporary = Files.createTempFile(directory, ".upload-", ".tmp");
        try {
            try (var output = Files.newOutputStream(temporary)) {
                byte[] buffer = new byte[8192]; long size = 0; int read;
                while ((read = input.read(buffer)) >= 0) {
                    size += read;
                    if (size > MAX_BYTES) throw new ApiFailure(413, "CSV limit is 25 MiB per import.");
                    output.write(buffer, 0, read);
                }
            }
            long total = records(temporary, format, null);
            if (total == 0) throw new ApiFailure(400, "CSV has no data rows.");
            if (!redis.require(sut, name).equals(format)) throw new ApiFailure(409, "Dataset format changed. Import was not published.");
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) { channel.force(true); }
            Path inventory = directory.resolve(identity + ".csv");
            Files.move(temporary, inventory, StandardCopyOption.ATOMIC_MOVE);
            Path status = directory.resolve(identity + ".json");
            Files.write(status, mapper.writeValueAsBytes(Map.of("id", identity, "list", list, "rows", total, "published", 0, "createdAt", Instant.now().toString())));
            long[] published = {0};
            try {
                records(inventory, format, record -> { redis.publish(format, list, record); published[0]++; });
            } catch (ApiFailure failure) {
                throw new ApiFailure(503, "Inventory " + identity + " is saved. " + published[0] + "/" + total + " rows acknowledged; the next write may be uncertain. No retry was performed.");
            }
            Map<String, Object> result = Map.of("id", identity, "list", list, "rows", total, "published", published[0], "createdAt", Instant.now().toString());
            Files.write(status, mapper.writeValueAsBytes(result));
            return result;
        } finally { Files.deleteIfExists(temporary); }
    }
    private long records(Path file, DatasetDefinition format, java.util.function.Consumer<Map<String, Object>> consumer) throws IOException {
        var decoder = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT);
        try (PushbackReader reader = new PushbackReader(new InputStreamReader(Files.newInputStream(file), decoder));) {
            int first = reader.read();
            if (first != -1 && first != 0xFEFF) reader.unread(first);
            try (CSVParser parser = CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).setAllowMissingColumnNames(false).setDuplicateHeaderMode(DuplicateHeaderMode.DISALLOW).get().parse(reader)) {
                if (parser.getHeaderNames().isEmpty() || parser.getHeaderNames().size() > 200) throw new ApiFailure(400, "CSV requires 1–200 named columns.");
                for (String header : parser.getHeaderNames()) if (!header.matches("[A-Za-z][A-Za-z0-9_]{0,79}")) throw new ApiFailure(400, "CSV columns must use canonical field names.");
                for (RecordField field : format.fields()) if (field.required() && !parser.getHeaderMap().containsKey(field.name())) throw new ApiFailure(400, "Missing CSV column: " + field.name());
                long count = 0;
                for (var row : parser) {
                    if (!row.isConsistent()) throw new ApiFailure(400, "Inconsistent CSV column count at row " + (row.getRecordNumber() + 1));
                    Map<String, Object> record = formats.convert(format, row.toMap());
                    if (consumer != null) consumer.accept(record);
                    count++;
                }
                return count;
            }
        } catch (ApiFailure failure) { throw failure; }
        catch (IllegalArgumentException | java.io.UncheckedIOException | java.nio.charset.CharacterCodingException failure) { throw new ApiFailure(400, "Invalid UTF-8 CSV. No data is published during validation."); }
    }
    public List<Map<String, Object>> list(String sut, String dataset) throws IOException {
        Path directory = catalog.inventoryDirectory(sut, dataset);
        try (var files = Files.list(directory)) {
            List<Map<String, Object>> result = files.filter(file -> file.getFileName().toString().endsWith(".csv")).sorted().limit(501).map(file -> {
                try { return Map.<String, Object>of("id", file.getFileName().toString().replace(".csv", ""), "bytes", Files.size(file)); }
                catch (IOException failure) { throw new ApiFailure(503, "Inventory could not be read."); }
            }).toList();
            if (result.size() > 500) throw new ApiFailure(413, "This first version lists up to 500 CSV files per dataset. No truncated listing was returned.");
            return result;
        }
    }
    public void download(String sut, String dataset, String identity, HttpServletResponse response) throws IOException {
        identity(identity);
        requireClosed(identity);
        downloadFile(catalog.inventoryDirectory(sut, dataset).resolve(identity + ".csv"), dataset + "-" + identity, response);
    }
    private static void identity(String identity) {
        try { if (!UUID.fromString(identity).toString().equals(identity)) throw new IllegalArgumentException(); }
        catch (IllegalArgumentException failure) { throw new ApiFailure(400, "Invalid inventory identifier."); }
    }
    private void requireClosed(String identity) {
        if (generating.contains(identity)) throw new ApiFailure(409, "Wait for the population job to finish or stop before downloading its CSV.");
    }
    private static void downloadFile(Path file, String filename, HttpServletResponse response) throws IOException {
        if (!Files.isRegularFile(file)) throw new ApiFailure(404, "CSV inventory not found.");
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + filename + ".csv\"");
        Files.copy(file, response.getOutputStream());
    }
}
