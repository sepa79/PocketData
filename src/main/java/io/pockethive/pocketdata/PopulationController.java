package io.pockethive.pocketdata;

import io.pockethive.templatedata.JsonDocumentReader;
import io.pockethive.templatedata.TemplateDataException;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Responsibility: authenticate and map population HTTP operations to their owners. Must not: execute steps, interpret results or persist job state. Contract: docs/POPULATION.md. */
@RestController
@RequestMapping("/api/suts/{sut}/datasets/{dataset}/population")
public final class PopulationController {
    private final AuthService auth;
    private final PopulationJobs jobs;
    private final CsvInventory inventory;
    public PopulationController(AuthService auth, PopulationJobs jobs, CsvInventory inventory) { this.auth = auth; this.jobs = jobs; this.inventory = inventory; }
    @PostMapping public ResponseEntity<PopulationSnapshot> start(@PathVariable String sut, @PathVariable String dataset, @RequestParam String list,
            @RequestHeader(value = "Authorization", required = false) String authorization, @RequestBody byte[] body) throws IOException {
        auth.requireEditor(authorization);
        try { return ResponseEntity.accepted().body(jobs.start(sut, dataset, list, new JsonDocumentReader().read(body))); }
        catch (TemplateDataException failure) { throw new ApiFailure(400, "Population JSON rejected: " + failure.code()); }
    }
    @GetMapping("/{id}") public PopulationSnapshot read(@PathVariable String sut, @PathVariable String dataset, @PathVariable String id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        auth.requireEditor(authorization); return jobs.read(sut, dataset, id);
    }
    @PostMapping("/{id}/stop") public PopulationSnapshot stop(@PathVariable String sut, @PathVariable String dataset, @PathVariable String id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        auth.requireEditor(authorization); return jobs.stop(sut, dataset, id);
    }
    @GetMapping("/{id}/responses") public void responses(@PathVariable String sut, @PathVariable String dataset, @PathVariable String id,
            @RequestHeader(value = "Authorization", required = false) String authorization, HttpServletResponse response) throws IOException {
        auth.requireEditor(authorization); inventory.downloadResponses(sut, dataset, id, response);
    }
}
