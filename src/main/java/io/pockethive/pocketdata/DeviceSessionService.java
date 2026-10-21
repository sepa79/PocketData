package io.pockethive.pocketdata;

import io.pockethive.auth.client.AuthServiceClientException;
import io.pockethive.auth.client.DeviceAuthException;
import io.pockethive.auth.contract.DeviceAuthorizationDto;
import io.pockethive.auth.contract.DeviceTokenDto;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/** Responsibility: adapt the shared device client to the PocketData session API. Must not: store transactions, poll in a loop or decide edit permissions. Contract: docs/API.md. */
@Component
public final class DeviceSessionService {
    private final PhAuthClients clients;
    public DeviceSessionService(PhAuthClients clients) { this.clients = clients; }
    public DeviceAuthorizationDto start() { return request(() -> clients.device().start()); }

    public DeviceTokenDto poll(Map<String, String> body) {
        if (body == null || !body.keySet().equals(Set.of("deviceCode")) || body.get("deviceCode") == null
            || body.get("deviceCode").isBlank() || body.get("deviceCode").length() > 4096) {
            throw new ApiFailure(400, "A device code is required.");
        }
        return request(() -> clients.device().poll(body.get("deviceCode")));
    }

    public Map<String, String> logout(String authorization) {
        String token = PocketBearer.require(authorization);
        return request(() -> {
            String logoutUrl = clients.device().configuration().logoutUri().toString();
            clients.device().revoke(token);
            return Map.of("logoutUrl", logoutUrl);
        });
    }

    private <Result> Result request(Supplier<Result> action) {
        try { return action.get(); }
        catch (DeviceAuthException failure) { throw new ApiFailure(failure.getStatusCode(), failure.getError()); }
        catch (AuthServiceClientException failure) { throw new ApiFailure(503, "PocketHive authentication is unavailable."); }
    }
}
