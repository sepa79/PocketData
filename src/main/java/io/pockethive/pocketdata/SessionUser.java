package io.pockethive.pocketdata;

/** Responsibility: project safe identity display fields. Must not: own identity or grant permissions. Contract: docs/API.md. */
public record SessionUser(String username, String displayName) {}
