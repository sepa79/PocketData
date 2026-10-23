package io.pockethive.pocketdata;

/** Responsibility: carry a DataSet edit and its opening snapshot. Must not: validate or persist metadata. Contract: docs/API.md. */
public record DatasetUpdate(DatasetDefinition expected, DatasetDefinition definition) {}
