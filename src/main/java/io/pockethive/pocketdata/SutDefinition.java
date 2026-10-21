package io.pockethive.pocketdata;

import java.util.Map;

/** Responsibility: carry a SUT definition. Must not: resolve or execute endpoints. Contract: docs/API.md. */
public record SutDefinition(String id, String name, String description, Map<String, String> endpoints) {}
