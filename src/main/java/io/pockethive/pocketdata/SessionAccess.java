package io.pockethive.pocketdata;

/** Responsibility: expose the current authoritative access decision. Must not: validate credentials or persist session state. Contract: docs/API.md. */
public record SessionAccess(SessionUser user, boolean canEdit, boolean configured) {}
