package io.pockethive.pocketdata;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PopulationPacingTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test void delayIsAddedAfterCompletionAndZeroMeansAsFastAsPossible() {
        var delay = new PopulationPacing(PopulationPacingMode.DELAY, 5, PopulationTimeUnit.SECONDS);
        assertEquals(TimeUnit.SECONDS.toNanos(5), delay.delayAfter(TimeUnit.SECONDS.toNanos(3)));
        assertEquals(0, new PopulationPacing(PopulationPacingMode.DELAY, 0, PopulationTimeUnit.MILLISECONDS).delayAfter(100));
        assertEquals(TimeUnit.DAYS.toNanos(3), new PopulationPacing(PopulationPacingMode.DELAY, 3, PopulationTimeUnit.DAYS).delayAfter(100));
    }

    @Test void attemptedRateUsesTheActualIterationStartAndNeverBuildsACatchupQueue() {
        var hourly = new PopulationPacing(PopulationPacingMode.RATE, 3, PopulationTimeUnit.HOURS);
        assertEquals(TimeUnit.SECONDS.toNanos(1195), hourly.delayAfter(TimeUnit.SECONDS.toNanos(5)));
        var fast = new PopulationPacing(PopulationPacingMode.RATE, 3, PopulationTimeUnit.SECONDS);
        assertEquals(0, fast.delayAfter(TimeUnit.SECONDS.toNanos(2)));
        assertEquals(233_333_334L, fast.delayAfter(TimeUnit.MILLISECONDS.toNanos(100)));
        assertEquals(TimeUnit.HOURS.toNanos(6), new PopulationPacing(PopulationPacingMode.RATE, 4, PopulationTimeUnit.DAYS).delayAfter(0));
    }

    @Test void acceptsExplicitPacingAndFractionalRates() throws Exception {
        var pacing = PopulationPacing.parse(mapper.readTree("{\"mode\":\"RATE\",\"value\":0.2,\"unit\":\"SECONDS\"}"));
        assertEquals(TimeUnit.SECONDS.toNanos(5), pacing.delayAfter(0));
        assertEquals(TimeUnit.MILLISECONDS.toNanos(1), new PopulationPacing(PopulationPacingMode.DELAY, .001, PopulationTimeUnit.SECONDS).delayAfter(0));
        assertEquals(TimeUnit.DAYS.toNanos(365), new PopulationPacing(PopulationPacingMode.DELAY, 365, PopulationTimeUnit.DAYS).delayAfter(0));
    }

    @ParameterizedTest @ValueSource(strings = {
        "null", "[]", "{}", "{\"mode\":\"DELAY\",\"value\":0}",
        "{\"mode\":\"DELAY\",\"value\":0,\"unit\":\"SECONDS\",\"extra\":1}",
        "{\"mode\":\"BURST\",\"value\":1,\"unit\":\"SECONDS\"}",
        "{\"mode\":\"RATE\",\"value\":0,\"unit\":\"SECONDS\"}",
        "{\"mode\":\"RATE\",\"value\":1,\"unit\":\"MILLISECONDS\"}",
        "{\"mode\":\"DELAY\",\"value\":-1,\"unit\":\"SECONDS\"}",
        "{\"mode\":\"DELAY\",\"value\":366,\"unit\":\"DAYS\"}",
        "{\"mode\":\"DELAY\",\"value\":0.1,\"unit\":\"MILLISECONDS\"}",
        "{\"mode\":\"RATE\",\"value\":0.00001,\"unit\":\"DAYS\"}",
        "{\"mode\":\"RATE\",\"value\":1e100,\"unit\":\"SECONDS\"}",
        "{\"mode\":\"RATE\",\"value\":\"3\",\"unit\":\"HOURS\"}",
        "{\"mode\":\"DELAY\",\"value\":1,\"unit\":\"years\"}"
    }) void rejectsInvalidSettingsWithoutFallback(String source) throws Exception {
        var document = mapper.readTree(source);
        assertEquals(400, assertThrows(ApiFailure.class, () -> PopulationPacing.parse(document)).status());
    }

    @Test void rejectsNonFiniteValues() {
        for (double value : new double[]{Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY})
            assertThrows(ApiFailure.class, () -> new PopulationPacing(PopulationPacingMode.RATE, value, PopulationTimeUnit.SECONDS));
    }
}
