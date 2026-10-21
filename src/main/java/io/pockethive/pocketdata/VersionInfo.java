package io.pockethive.pocketdata;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Responsibility: expose VERSION and process health. Must not: claim Redis/auth availability. Contract: docs/ARCHITECTURE.md. */
@RestController
public class VersionInfo {
    private final String version;
    public VersionInfo() throws IOException {
        try (var input = VersionInfo.class.getResourceAsStream("/VERSION")) {
            if (input == null) throw new IllegalStateException("VERSION is required");
            version = new String(input.readAllBytes(), StandardCharsets.UTF_8).trim();
            if (!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:-dev)?")) throw new IllegalStateException("Invalid VERSION");
        }
    }
    @GetMapping("/health") public Map<String, String> health() { return Map.of("status", "ok"); }
    @GetMapping("/api/info") public Map<String, String> info() { return Map.of("name", "PocketData", "version", version); }
}
