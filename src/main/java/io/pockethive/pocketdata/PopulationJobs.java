package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;
import io.pockethive.templating.PortableHttpRequest;

/** Responsibility: coordinate one finite script job through existing request, inventory and Redis owners. Must not: parse templates/responses, invent recovery or duplicate persisted state. Contract: docs/POPULATION.md. */
@Component
public final class PopulationJobs {
    private final CatalogStore catalog;
    private final RedisDatasets redis;
    private final CsvInventory inventory;
    private final RecordFormat formats;
    private final PopulationValidator validator;
    private final PopulationTemplates templates;
    private final PopulationHttp http;
    private final PopulationResponses responses;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon().name("pd-population").factory());
    private final Map<String, PopulationJob> jobs = new LinkedHashMap<>();
    private PopulationJob active;
    public PopulationJobs(CatalogStore catalog, RedisDatasets redis, CsvInventory inventory, RecordFormat formats,
                          PopulationValidator validator, PopulationTemplates templates, PopulationHttp http, PopulationResponses responses) {
        this.catalog = catalog; this.redis = redis; this.inventory = inventory; this.formats = formats;
        this.validator = validator; this.templates = templates; this.http = http; this.responses = responses;
    }
    public synchronized PopulationSnapshot start(String sut, String name, String list, JsonNode source) throws IOException {
        if (active != null && !active.finished()) throw new ApiFailure(409, "A population job is already active: " + active.snapshot().id());
        DatasetDefinition format = redis.require(sut, name);
        if (!format.lists().contains(list)) throw new ApiFailure(400, "Unknown target list.");
        PopulationRequest recipe = validator.validate(source, catalog.require(sut), format);
        GeneratedInventory output = inventory.beginGeneration(sut, name, recipe.columns());
        PopulationJob job = new PopulationJob(output.id(), sut, name, recipe.count());
        active = job;
        while (jobs.size() >= 20) jobs.remove(jobs.keySet().iterator().next());
        jobs.put(output.id(), job);
        try { worker.submit(() -> run(job, format, list, recipe, output)); }
        catch (RuntimeException failure) { output.close(); job.fail("Population worker is not available. No SUT request was started."); throw new ApiFailure(503, "Population worker is not available."); }
        return job.snapshot();
    }
    public synchronized PopulationSnapshot read(String sut, String dataset, String id) {
        return require(sut, dataset, id).snapshot();
    }
    public synchronized PopulationSnapshot stop(String sut, String dataset, String id) {
        PopulationJob job = require(sut, dataset, id); job.stop(); return job.snapshot();
    }
    private PopulationJob require(String sut, String dataset, String id) {
        PopulationJob job = jobs.get(id);
        if (job == null || !job.belongsTo(sut, dataset)) throw new ApiFailure(404, "Population job is not available in this process. Saved CSV is not automatically resumed.");
        return job;
    }
    private void run(PopulationJob job, DatasetDefinition format, String list, PopulationRequest recipe, GeneratedInventory output) {
        try (output) {
            records: for (int iteration = 1; iteration <= recipe.count() && !job.stopped(); iteration++) {
                unchanged(format);
                Map<String, String> record = new LinkedHashMap<>(recipe.values());
                for (PopulationStep step : recipe.steps()) {
                    if (job.stopped()) break records;
                    job.working(iteration, step.name());
                    Map<String, String> params = new LinkedHashMap<>(recipe.params());
                    params.put("iteration", Integer.toString(iteration));
                    PortableHttpRequest call = templates.render(step, record, params);
                    PopulationHttpResponse response;
                    try { response = http.execute(call); }
                    catch (ApiFailure failure) { output.response(iteration, step.name(), "unknown", "No complete response was available. Inspect the SUT before repeating."); throw failure; }
                    output.response(iteration, step.name(), Integer.toString(response.status()), response.body());
                    Map<String, String> extracted = responses.extract(step.call(), response.status(), response.body());
                    record.putAll(extracted);
                }
                Map<String, Object> converted = formats.convert(format, record);
                output.record(record);
                job.completed();
                unchanged(format);
                redis.publish(format, list, converted);
                job.published();
            }
        } catch (ApiFailure failure) { job.fail(failure.getMessage() + " Inspect the saved CSV/responses before repeating this job."); return; }
        catch (Exception failure) { job.fail("Population failed; saved CSV may be partial and a SUT result may be uncertain. No retry was performed."); return; }
        job.finish();
    }
    private void unchanged(DatasetDefinition format) {
        if (!redis.require(format.sutId(), format.name()).equals(format)) throw new ApiFailure(409, "DataSet format changed. Population was stopped without guessing a replacement format.");
    }
    @PreDestroy public void close() throws InterruptedException {
        synchronized (this) { if (active != null) active.stop(); }
        worker.shutdown();
        if (!worker.awaitTermination(12, TimeUnit.SECONDS)) worker.shutdownNow();
    }
}
