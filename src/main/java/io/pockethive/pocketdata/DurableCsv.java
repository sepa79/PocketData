package io.pockethive.pocketdata;

import java.io.IOException;
import java.io.StringWriter;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;

/** Responsibility: append and fsync bounded CSV rows to one inventory file. Must not: resolve paths, validate records or publish Redis. Contract: docs/POPULATION.md. */
final class DurableCsv implements AutoCloseable {
    private final FileChannel channel;
    DurableCsv(Path path, List<String> headers) throws IOException {
        channel = FileChannel.open(path, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        try { append(headers); } catch (IOException | RuntimeException failure) { channel.close(); throw failure; }
    }
    void append(List<?> values) throws IOException {
        StringWriter text = new StringWriter();
        try (CSVPrinter printer = new CSVPrinter(text, CSVFormat.DEFAULT)) { printer.printRecord(values); }
        byte[] bytes = text.toString().getBytes(StandardCharsets.UTF_8);
        if (channel.size() + bytes.length > 25L * 1024 * 1024) throw new ApiFailure(413, "Generated CSV reached 25 MiB. Inspect saved output and the SUT before repeating.");
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        while (buffer.hasRemaining()) channel.write(buffer);
        channel.force(true);
    }
    @Override public void close() throws IOException { channel.close(); }
}
