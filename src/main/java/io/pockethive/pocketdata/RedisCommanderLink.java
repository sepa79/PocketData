package io.pockethive.pocketdata;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Responsibility: validate the explicit browser URL for the external Redis inspector. Must not: connect to Redis, proxy records or infer addresses from request headers. Contract: docs/REDIS.md; empty disables the link. */
@Component
public final class RedisCommanderLink {
    private final String url;
    public RedisCommanderLink(@Value("${POCKETDATA_REDIS_COMMANDER_URL:}") String url) {
        if (!url.isEmpty()) {
            URI address = URI.create(url);
            if (!java.util.Set.of("http", "https").contains(address.getScheme()) || address.getHost() == null
                    || address.getUserInfo() != null || address.getRawQuery() != null || address.getRawFragment() != null
                    || !url.equals(url.strip()) || address.getPort() == 0 || address.getPort() > 65535)
                throw new IllegalArgumentException("POCKETDATA_REDIS_COMMANDER_URL requires an HTTP(S) URL without credentials, query or fragment.");
        }
        this.url = url;
    }
    public String url() { return url; }
}
