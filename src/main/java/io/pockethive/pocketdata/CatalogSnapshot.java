package io.pockethive.pocketdata;

import java.util.List;

/** Responsibility: carry revisioned SUT definitions. Must not: duplicate Redis dataset metadata. Contract: docs/API.md. */
public record CatalogSnapshot(long revision, List<SutDefinition> suts) {}
