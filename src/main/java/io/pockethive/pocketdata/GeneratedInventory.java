package io.pockethive.pocketdata;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/** Responsibility: append generated results and response evidence through inventory-owned CSV files. Must not: create SUT resources, interpret responses or own Redis. Contract: docs/POPULATION.md. */
public final class GeneratedInventory implements AutoCloseable {
    private final String id;
    private final List<String> columns;
    private final DurableCsv records;
    private final DurableCsv responses;
    private final Runnable closed;
    GeneratedInventory(String id, List<String> columns, DurableCsv records, DurableCsv responses, Runnable closed) {
        this.id = id; this.columns = List.copyOf(columns); this.records = records; this.responses = responses; this.closed = closed;
    }
    public String id() { return id; }
    public void response(int iteration, String step, String status, String body) throws IOException { responses.append(List.of(iteration, step, status, body)); }
    public void record(Map<String, String> record) throws IOException { records.append(columns.stream().map(field -> record.getOrDefault(field, "")).toList()); }
    @Override public void close() throws IOException { try { try { records.close(); } finally { responses.close(); } } finally { closed.run(); } }
}
