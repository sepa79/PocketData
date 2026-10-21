package io.pockethive.pocketdata;

import java.util.List;

/** Responsibility: carry canonical Redis format metadata. Must not: own record circulation. Contract: docs/DATASET.md. */
public record DatasetDefinition(String sutId, String name, String description, List<RecordField> fields, List<String> lists) {}
