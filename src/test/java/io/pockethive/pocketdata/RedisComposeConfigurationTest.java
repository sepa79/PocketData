package io.pockethive.pocketdata;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;
import static org.junit.jupiter.api.Assertions.*;

class RedisComposeConfigurationTest {
    @Test void stackOwnsOnlyTheAppAndInventoryVolume() throws Exception {
        Map<String, Object> base = readYaml("compose.yaml");
        Map<String, Object> services = section(base, "services");
        assertEquals(List.of("pocketdata"), List.copyOf(services.keySet()));
        Map<String, Object> app = section(services, "pocketdata");
        assertFalse(app.containsKey("depends_on"));
        assertEquals(List.of("pocketdata_inventory:/data"), app.get("volumes"));
        assertEquals(List.of("pocketdata_inventory"), List.copyOf(section(base, "volumes").keySet()));
    }

    @Test void redisEndpointHasNoDefault() throws Exception {
        Map<String, Object> app = section(section(readYaml("compose.yaml"), "services"), "pocketdata");
        String url = (String) section(app, "environment").get("POCKETDATA_REDIS_URL");
        assertTrue(url.startsWith("${POCKETDATA_REDIS_URL:?") && url.endsWith("}"));
        assertFalse(url.contains(":-"));
    }

    @Test void phProfileUsesOnlyExplicitExistingNetworks() throws Exception {
        Map<String, Object> profile = readYaml("compose.ph.yaml");
        Map<String, Object> app = section(section(profile, "services"), "pocketdata");
        assertEquals(List.of("pockethive", "pockethive_redis"), app.get("networks"));
        Map<String, Object> networks = section(profile, "networks");
        assertEquals(2, networks.size());
        Map<String, Object> authNetwork = section(networks, "pockethive");
        assertEquals(true, authNetwork.get("external"));
        assertTrue(((String) authNetwork.get("name")).startsWith("${POCKETHIVE_NETWORK_NAME:?"));
        Map<String, Object> redisNetwork = section(networks, "pockethive_redis");
        assertEquals(true, redisNetwork.get("external"));
        assertTrue(((String) redisNetwork.get("name")).startsWith("${POCKETHIVE_REDIS_NETWORK_NAME:?"));
        assertFalse(section(app, "environment").containsKey("POCKETDATA_REDIS_URL"));
    }

    @Test void exampleRequiresOperatorsToSelectTheirRedis() throws Exception {
        Properties example = new Properties();
        try (Reader reader = Files.newBufferedReader(Path.of(".env.example"))) { example.load(reader); }
        assertEquals("", example.getProperty("POCKETDATA_REDIS_URL"));
        assertEquals("", example.getProperty("POCKETHIVE_REDIS_NETWORK_NAME"));
        assertEquals("compose.yaml:compose.ph.yaml", example.getProperty("COMPOSE_FILE"));
    }

    private Map<String, Object> readYaml(String name) throws IOException {
        try (Reader reader = Files.newBufferedReader(Path.of(name))) { return new Yaml().load(reader); }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> section(Map<String, Object> parent, String name) {
        return (Map<String, Object>) parent.get(name);
    }
}
