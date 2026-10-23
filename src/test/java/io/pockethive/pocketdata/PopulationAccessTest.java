package io.pockethive.pocketdata;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class PopulationAccessTest {
    @Test void duplicateAndTrailingPopulationDocumentsAreRejectedBeforeTheJobOwner() throws Exception {
        AuthService auth = mock(AuthService.class); PopulationJobs jobs = mock(PopulationJobs.class); CsvInventory inventory = mock(CsvInventory.class);
        MockMvc http = MockMvcBuilders.standaloneSetup(new PopulationController(auth, jobs, inventory)).setControllerAdvice(new ApiErrors()).build();
        for (String source : List.of("{\"name\":\"a\",\"name\":\"b\"}", "{} {}", "{\"nested\":{\"a\":1,\"a\":2}}")) {
            http.perform(post("/api/suts/qa/datasets/cards/population?list=ready").header("Authorization", "Bearer editor")
                .contentType("application/json").content(source)).andExpect(status().isBadRequest());
        }
        http.perform(post("/api/suts/qa/datasets/cards/population?list=ready").header("Authorization", "Bearer editor")
            .contentType("application/json").content(new byte[]{'{', '"', 'x', '"', ':', '"', (byte) 0xc3, '(', '"', '}'}))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(jobs, inventory);
    }
    @Test void everyJobAndRawResponseEndpointRequiresTheAuthoritativeEditorPolicy() throws Exception {
        for (int denied : List.of(401, 403, 503)) {
            AuthService auth = mock(AuthService.class); PopulationJobs jobs = mock(PopulationJobs.class); CsvInventory inventory = mock(CsvInventory.class);
            doThrow(new ApiFailure(denied, "Denied")).when(auth).requireEditor(any());
            MockMvc http = MockMvcBuilders.standaloneSetup(new PopulationController(auth, jobs, inventory)).setControllerAdvice(new ApiErrors()).build();
            String path = "/api/suts/qa/datasets/cards/population";
            http.perform(post(path + "?list=ready").header("Authorization", "Bearer test").contentType("application/json").content("{}")) .andExpect(status().is(denied));
            http.perform(get(path + "/job").header("Authorization", "Bearer test")).andExpect(status().is(denied));
            http.perform(post(path + "/job/stop").header("Authorization", "Bearer test")).andExpect(status().is(denied));
            http.perform(get(path + "/job/responses").header("Authorization", "Bearer test")).andExpect(status().is(denied));
            verify(auth, times(4)).requireEditor("Bearer test"); verifyNoInteractions(jobs, inventory);
        }
    }
    @Test void admittedStartReadAndStopProjectOnlyTheJobOwnersExactSnapshot() throws Exception {
        AuthService auth = mock(AuthService.class); PopulationJobs jobs = mock(PopulationJobs.class); CsvInventory inventory = mock(CsvInventory.class);
        PopulationSnapshot snapshot = new PopulationSnapshot("job", PopulationStatus.RUNNING, 3, 0, 0, 1, "account", "", "job",
            new PopulationPacing(PopulationPacingMode.DELAY, 0, PopulationTimeUnit.MILLISECONDS), 0, 0, false, 0);
        when(jobs.start(eq("qa"), eq("cards"), eq("ready"), any())).thenReturn(snapshot);
        when(jobs.read("qa", "cards", "job")).thenReturn(snapshot); when(jobs.stop("qa", "cards", "job")).thenReturn(snapshot);
        MockMvc http = MockMvcBuilders.standaloneSetup(new PopulationController(auth, jobs, inventory)).setControllerAdvice(new ApiErrors()).build();
        String path = "/api/suts/qa/datasets/cards/population";
        http.perform(post(path + "?list=ready").header("Authorization", "Bearer editor").contentType("application/json").content("{}"))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.id").value("job")).andExpect(jsonPath("$.status").value("RUNNING"));
        http.perform(get(path + "/job").header("Authorization", "Bearer editor")).andExpect(status().isOk()).andExpect(jsonPath("$.published").value(0));
        http.perform(post(path + "/job/stop").header("Authorization", "Bearer editor")).andExpect(status().isOk());
        verify(auth, times(3)).requireEditor("Bearer editor"); verify(jobs).read("qa", "cards", "job"); verify(jobs).stop("qa", "cards", "job");
    }
}
