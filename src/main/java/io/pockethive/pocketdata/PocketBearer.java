package io.pockethive.pocketdata;

/** Responsibility: validate incoming bearer header syntax. Must not: infer identity or authorize operations. Contract: docs/AUTH.md. */
final class PocketBearer {
    private PocketBearer() {}
    static String require(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")
            || !authorization.substring(7).matches("[A-Za-z0-9._~-]{1,16000}")) {
            throw new ApiFailure(401, "A PocketHive bearer session is required.");
        }
        return authorization.substring(7);
    }
}
