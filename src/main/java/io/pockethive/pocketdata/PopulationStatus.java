package io.pockethive.pocketdata;

/** Responsibility: name explicit finite job outcomes. Must not: represent Redis record ownership. Contract: docs/POPULATION.md. */
public enum PopulationStatus { RUNNING, STOPPING, STOPPED, SUCCEEDED, FAILED }
