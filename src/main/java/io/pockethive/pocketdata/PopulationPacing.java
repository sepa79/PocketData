package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashSet;
import java.util.Set;

/** Responsibility: validate pacing and calculate the wait after one actual iteration. Must not: sleep, queue missed starts or change template behavior. Contract: docs/POPULATION.md. */
public record PopulationPacing(PopulationPacingMode mode, double value, PopulationTimeUnit unit) {
    public PopulationPacing {
        if (mode == null || unit == null || !Double.isFinite(value) || value < 0)
            throw new ApiFailure(400, "Specify a valid pacing mode, finite non-negative value and time unit.");
        if (mode == PopulationPacingMode.RATE && (value == 0 || unit == PopulationTimeUnit.MILLISECONDS))
            throw new ApiFailure(400, "Attempted rate must be positive, per second, minute, hour or day.");
        double interval = mode == PopulationPacingMode.DELAY ? value * unit.nanos() : unit.nanos() / value;
        if (!Double.isFinite(interval) || interval > 365d * PopulationTimeUnit.DAYS.nanos()
                || (mode == PopulationPacingMode.RATE && interval < 1)
                || (mode == PopulationPacingMode.DELAY && interval > 0 && interval < PopulationTimeUnit.MILLISECONDS.nanos()))
            throw new ApiFailure(400, "Pacing interval must be at most 365 days; delay is zero or at least 1 ms, rate interval at least 1 ns.");
    }

    public static PopulationPacing parse(JsonNode source) {
        if (source == null || !source.isObject()) throw new ApiFailure(400, "An explicit pacing object is required.");
        Set<String> fields = new HashSet<>(); source.fieldNames().forEachRemaining(fields::add);
        if (!fields.equals(Set.of("mode", "value", "unit")) || !source.path("mode").isTextual()
                || !source.path("unit").isTextual() || !source.path("value").isNumber())
            throw new ApiFailure(400, "Pacing requires exactly mode, numeric value and unit.");
        try {
            return new PopulationPacing(PopulationPacingMode.valueOf(source.get("mode").textValue()),
                source.get("value").doubleValue(), PopulationTimeUnit.valueOf(source.get("unit").textValue()));
        } catch (IllegalArgumentException failure) { throw new ApiFailure(400, "Unknown pacing mode or time unit."); }
    }

    public long delayAfter(long iterationElapsedNanos) {
        long interval = (long) Math.ceil(mode == PopulationPacingMode.DELAY ? value * unit.nanos() : unit.nanos() / value);
        return mode == PopulationPacingMode.DELAY ? interval : Math.max(0, interval - Math.max(0, iterationElapsedNanos));
    }
}
