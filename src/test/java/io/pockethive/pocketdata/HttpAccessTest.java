package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class HttpAccessTest {
    @TempDir Path directory;
    private MockMvc http;
    @BeforeEach void start() throws Exception {
        ObjectMapper mapper = new ObjectMapper(); CatalogStore catalog = new CatalogStore(directory.toString(), mapper);
        RecordFormat format = new RecordFormat(); RedisDatasets redis = new RedisDatasets("", mapper, format);
        AuthService auth = new AuthService(new PhAuthClients(""));
        http = MockMvcBuilders.standaloneSetup(new DataController(catalog, redis, new CsvInventory(catalog, redis, format, mapper), auth)).setControllerAdvice(new ApiErrors()).addFilter(new SecurityHeaders()).build();
    }
    @Test void publicCatalogueIsReadOnly() throws Exception { http.perform(get("/api/catalog")).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(0)).andExpect(header().exists("Content-Security-Policy")); }
    @Test void deniesCatalogueMutationWithoutSession() throws Exception { http.perform(put("/api/catalog").contentType("application/json").content("{\"revision\":0,\"suts\":[]}")).andExpect(status().isUnauthorized()); }
    @Test void deniesDatasetMutationWithoutSession() throws Exception { http.perform(post("/api/suts/lab/datasets").contentType("application/json").content("{\"sutId\":\"lab\",\"name\":\"cards\",\"description\":\"\",\"fields\":[],\"lists\":[]}")).andExpect(status().isUnauthorized()); }
    @Test void deniesCsvMutationWithoutSession() throws Exception { http.perform(post("/api/suts/lab/datasets/cards/import?list=ready").contentType("text/csv").content("accountNumber\n123\n")).andExpect(status().isUnauthorized()); }
    @Test void deniesRawCsvReadsWithoutSession() throws Exception { http.perform(get("/api/suts/lab/datasets/cards/inventory")).andExpect(status().isUnauthorized()); }
}
