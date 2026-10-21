package io.pockethive.pocketdata;

import io.pockethive.requesttemplates.PortableHttpCall;
import java.net.URI;

/** Responsibility: carry one preflighted request step. Must not: execute or persist requests. Contract: docs/POPULATION.md. */
public record PopulationStep(String name, URI endpoint, PortableHttpCall call) {}
