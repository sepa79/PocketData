package io.pockethive.pocketdata;

import jakarta.annotation.PreDestroy;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.apache.hc.client5.http.classic.methods.HttpUriRequestBase;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.io.entity.StringEntity;
import org.apache.hc.core5.util.Timeout;
import org.springframework.stereotype.Component;
import io.pockethive.templating.PortableHttpRequest;

/** Responsibility: execute one bounded fixed-origin HTTP call without retries or redirects. Must not: interpret SOAP, compose records or own job state. Contract: docs/POPULATION.md. */
@Component
public final class PopulationHttp {
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon().name("pd-request-deadline").factory());
    private final CloseableHttpClient client = HttpClients.custom().disableAutomaticRetries().disableRedirectHandling().disableContentCompression().disableCookieManagement().disableAuthCaching()
            .setConnectionManager(PoolingHttpClientConnectionManagerBuilder.create().setMaxConnTotal(2).setMaxConnPerRoute(2)
                    .setDefaultConnectionConfig(ConnectionConfig.custom().setConnectTimeout(Timeout.ofSeconds(3)).setSocketTimeout(Timeout.ofSeconds(5)).build()).build())
            .setDefaultRequestConfig(RequestConfig.custom().setConnectionRequestTimeout(Timeout.ofSeconds(3)).setResponseTimeout(Timeout.ofSeconds(5)).build()).build();

    public PopulationHttpResponse execute(PortableHttpRequest call) {
        HttpUriRequestBase request = new HttpUriRequestBase(call.method(), call.uri());
        request.setEntity(new StringEntity(call.body(), ContentType.create("application/octet-stream", StandardCharsets.UTF_8)));
        call.headers().forEach(request::setHeader);
        var deadline = deadlines.schedule(request::cancel, 10, TimeUnit.SECONDS);
        try {
            return client.execute(request, response -> {
                byte[] bytes = response.getEntity() == null ? new byte[0] : response.getEntity().getContent().readNBytes(1024 * 1024 + 1);
                if (bytes.length > 1024 * 1024) throw new ApiFailure(502, "SUT response exceeded 1 MiB; inspect the SUT before repeating the operation.");
                String body = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
                return new PopulationHttpResponse(response.getCode(), body);
            });
        } catch (ApiFailure failure) { throw failure; }
        catch (Exception failure) { throw new ApiFailure(502, "SUT request failed or timed out; its result may be uncertain. No retry was performed."); }
        finally { deadline.cancel(false); request.cancel(); }
    }

    @PreDestroy public void close() throws Exception { deadlines.shutdownNow(); client.close(); }
}
