package io.pockethive.pocketdata;

import io.pockethive.auth.client.AuthServiceClientException;
import io.pockethive.auth.contract.AuthenticatedUserDto;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;

/** Responsibility: decide PocketData access from freshly resolved PH identity. Must not: implement OAuth, issue identity or cache authorization. Contract: docs/AUTH.md. */
@Component
public final class AuthService {
    private static final String EDITOR = "local-admin";
    private final PhAuthClients clients;

    public AuthService(PhAuthClients clients) { this.clients = clients; }
    public boolean configured() { return clients.configured(); }

    public SessionAccess access(String authorization) {
        if (authorization == null || authorization.isBlank()) return new SessionAccess(null, false, configured());
        PocketBearer.require(authorization);
        try {
            AuthenticatedUserDto user = clients.identity().me(authorization);
            if (user == null || !user.active()) throw new ApiFailure(401, "Invalid or inactive PocketHive session.");
            return new SessionAccess(new SessionUser(user.username(), user.displayName()), EDITOR.equals(user.username()), true);
        } catch (AuthServiceClientException failure) {
            int status = failure.getStatusCode();
            throw new ApiFailure(status == 401 || status == 403 ? status : 503, "PocketHive rejected the session or is unavailable.");
        } catch (RestClientException failure) {
            throw new ApiFailure(503, "PocketHive authentication is unavailable.");
        }
    }

    public void requireEditor(String authorization) {
        SessionAccess result = access(authorization);
        if (!result.canEdit()) throw new ApiFailure(result.user() == null ? 401 : 403, "PocketHive local-admin is required to edit data.");
    }
}
