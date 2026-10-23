package io.pockethive.pocketdata;

import com.fasterxml.jackson.databind.JsonNode;

/** Responsibility: carry one versioned recipe draft for a DataSet. Must not: imply execution or embed credentials. Contract: docs/MCP.md; revision zero and null recipe mean no draft. */
public record PopulationDraft(long revision, String list, JsonNode recipe) {}
