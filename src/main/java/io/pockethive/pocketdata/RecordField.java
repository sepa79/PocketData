package io.pockethive.pocketdata;

/** Responsibility: describe one shared record field. Must not: decide scenario compatibility. Contract: docs/DATASET.md. */
public record RecordField(String name, String type, @com.fasterxml.jackson.annotation.JsonProperty(value="required", required=true) boolean required) {}
