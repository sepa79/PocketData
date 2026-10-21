package io.pockethive.pocketdata;

/** Responsibility: carry an explicit safe API failure. Must not: include secrets. Contract: docs/API.md. */
public class ApiFailure extends RuntimeException {
    private final int status;
    public ApiFailure(int status, String message) { super(message); this.status = status; }
    public int status() { return status; }
}
