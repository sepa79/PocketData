package io.pockethive.pocketdata;

/** Responsibility: carry one bounded SUT response. Must not: interpret success, retry or persist it. Contract: docs/POPULATION.md. */
public record PopulationHttpResponse(int status, String body) {}
