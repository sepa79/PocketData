package io.pockethive.pocketdata;

/** Responsibility: define the authored pacing units. Must not: own scheduling or job state. Contract: docs/POPULATION.md. */
public enum PopulationTimeUnit {
    MILLISECONDS(1_000_000L), SECONDS(1_000_000_000L), MINUTES(60_000_000_000L),
    HOURS(3_600_000_000_000L), DAYS(86_400_000_000_000L);

    private final long nanos;
    PopulationTimeUnit(long nanos) { this.nanos = nanos; }
    public long nanos() { return nanos; }
}
