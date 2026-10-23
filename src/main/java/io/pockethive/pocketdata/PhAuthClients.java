package io.pockethive.pocketdata;

import io.pockethive.auth.client.AuthServiceClient;
import io.pockethive.auth.client.DeviceAuthClient;
import io.pockethive.auth.contract.PocketHiveDeviceAuth;
import java.net.URI;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Responsibility: construct shared PH clients from one explicit ingress. Must not: select alternate auth providers or grant access. Contract: docs/AUTH.md. */
@Component
public final class PhAuthClients {
    private final boolean configured;
    private final AuthServiceClient identity;
    private final DeviceAuthClient device;

    public PhAuthClients(@Value("${POCKETHIVE_AUTH_BASE_URL:}") String base,
                         @Value("${POCKETHIVE_ALLOW_REMOTE_HTTP:false}") boolean allowRemoteHttp) {
        configured = !base.isBlank();
        if (configured) {
            URI endpoint = URI.create(base);
            identity = new AuthServiceClient(endpoint, Duration.ofSeconds(5), Duration.ofSeconds(5));
            device = new DeviceAuthClient(endpoint, PocketHiveDeviceAuth.DATA_CLIENT_ID,
                Duration.ofSeconds(5), Duration.ofSeconds(5), allowRemoteHttp);
        } else {
            identity = null;
            device = null;
        }
    }

    public boolean configured() { return configured; }
    public AuthServiceClient identity() { requireConfigured(); return identity; }
    public DeviceAuthClient device() { requireConfigured(); return device; }
    private void requireConfigured() {
        if (!configured) throw new ApiFailure(503, "PocketHive auth is not configured.");
    }
}
