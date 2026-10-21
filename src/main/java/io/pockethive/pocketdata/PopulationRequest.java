package io.pockethive.pocketdata;

import java.util.List;
import java.util.Map;

/** Responsibility: carry one fully validated finite population recipe. Must not: own jobs or record state. Contract: docs/POPULATION.md. */
public record PopulationRequest(String name, int count, Map<String, String> values, Map<String, String> params,
                                List<PopulationStep> steps, List<String> columns) {}
