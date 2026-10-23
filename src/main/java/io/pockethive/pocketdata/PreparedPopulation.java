package io.pockethive.pocketdata;

/** Responsibility: bind a validated recipe to its exact DataSet format snapshot. Must not: execute requests or persist a second format. Contract: docs/POPULATION.md; start rechecks this format before publication. */
public record PreparedPopulation(DatasetDefinition format, PopulationRequest recipe) {}
