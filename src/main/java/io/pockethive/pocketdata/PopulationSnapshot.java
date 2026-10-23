package io.pockethive.pocketdata;

/** Responsibility: expose a read-only job observation. Must not: infer or mutate completion. Contract: docs/POPULATION.md. */
public record PopulationSnapshot(String id, PopulationStatus status, int total, int completed, int published,
                                 int iteration, String step, String error, String inventoryId,
                                 PopulationPacing pacing, long elapsedMs, double achievedPerSecond,
                                 boolean waiting, long waitRemainingMs) {}
