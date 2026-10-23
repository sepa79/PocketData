package io.pockethive.pocketdata;

import java.io.IOException;
import org.springframework.web.bind.annotation.*;

/** Responsibility: expose authenticated draft reads to the operator editor. Must not: execute, auto-apply or persist browser edits. Contract: docs/MCP.md; loading is separate from Run. */
@RestController
public final class PopulationDraftController {
    private final AuthService auth;
    private final PopulationDrafts drafts;
    public PopulationDraftController(AuthService auth, PopulationDrafts drafts) { this.auth = auth; this.drafts = drafts; }
    @GetMapping("/api/suts/{sut}/datasets/{dataset}/population-draft")
    public PopulationDraft read(@PathVariable String sut, @PathVariable String dataset,
            @RequestHeader(value = "Authorization", required = false) String authorization) throws IOException {
        auth.requireEditor(authorization);
        return drafts.read(sut, dataset);
    }
}
