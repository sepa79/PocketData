package io.pockethive.pocketdata;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

/** Responsibility: map catalogue/dataset/inventory HTTP requests and enforce access. Must not: own validation or persistence. Contract: docs/API.md. */
@RestController
public class DataController {
    private final CatalogStore catalog;
    private final RedisDatasets redis;
    private final CsvInventory inventory;
    private final AuthService auth;
    public DataController(CatalogStore catalog, RedisDatasets redis, CsvInventory inventory, AuthService auth) {
        this.catalog = catalog; this.redis = redis; this.inventory = inventory; this.auth = auth;
    }
    @GetMapping("/api/catalog") public Object read() throws IOException { return catalog.read(); }
    @GetMapping("/api/connections") public Object connections() { return Map.of("redisConfigured", redis.configured(), "authConfigured", auth.configured()); }
    @PutMapping("/api/catalog") public Object save(@RequestHeader(value="Authorization", required=false) String authorization, @RequestBody CatalogSnapshot body) throws IOException {
        auth.requireEditor(authorization); return catalog.save(body);
    }
    @GetMapping("/api/suts/{sut}/datasets") public Object datasets(@PathVariable String sut) throws IOException { catalog.require(sut); return redis.list(sut); }
    @PostMapping("/api/suts/{sut}/datasets") public Object create(@PathVariable String sut, @RequestHeader(value="Authorization", required=false) String authorization, @RequestBody DatasetDefinition body) throws IOException {
        auth.requireEditor(authorization); catalog.require(sut);
        if (body == null || !sut.equals(body.sutId())) throw new ApiFailure(400, "Dataset must belong to the selected SUT.");
        return redis.create(body);
    }
    @PostMapping(value="/api/suts/{sut}/datasets/{dataset}/import", consumes="text/csv") public Object importCsv(@PathVariable String sut, @PathVariable String dataset, @RequestParam String list, @RequestHeader(value="Authorization", required=false) String authorization, HttpServletRequest request) throws IOException {
        auth.requireEditor(authorization); return inventory.importCsv(sut, dataset, list, request.getInputStream());
    }
    @GetMapping("/api/suts/{sut}/datasets/{dataset}/inventory") public Object inventories(@PathVariable String sut, @PathVariable String dataset, @RequestHeader(value="Authorization", required=false) String authorization) throws IOException {
        auth.requireEditor(authorization); return inventory.list(sut, dataset);
    }
    @GetMapping("/api/suts/{sut}/datasets/{dataset}/inventory/{identity}") public void download(@PathVariable String sut, @PathVariable String dataset, @PathVariable String identity, @RequestHeader(value="Authorization", required=false) String authorization, HttpServletResponse response) throws IOException {
        auth.requireEditor(authorization); inventory.download(sut, dataset, identity, response);
    }
}
