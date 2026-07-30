package com.teleconnect.notification.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.RestClient;

/**
 * Base for the small set of read-only, best-effort HTTP clients the Notification
 * schedulers use to pull data from other modules. Each downstream service trusts
 * the {@code X-Authenticated-User}/{@code X-Authenticated-Permissions} headers
 * (see each module's JwtFilter) rather than requiring a real JWT for
 * service-to-service calls — the same trust model already used by
 * {@code teleconnect-shared}'s AuditClient.
 *
 * Every call swallows failures (service down, 404, network blip) and returns an
 * empty/null result so a single unreachable service never breaks the scheduler
 * or crashes the JVM — alerting is inherently best-effort.
 */
@Slf4j
abstract class AbstractServiceClient {

    private static final String SYSTEM_USER = "notification-scheduler";

    private final RestClient restClient = RestClient.create();

    protected <T> T getOrElse(String url, String permissions, ParameterizedTypeReference<T> type, T fallback) {
        try {
            T body = restClient.get()
                    .uri(url)
                    .header("X-Authenticated-User", SYSTEM_USER)
                    .header("X-Authenticated-Permissions", permissions)
                    .retrieve()
                    .body(type);
            return body != null ? body : fallback;
        } catch (Exception e) {
            log.warn("Cross-service call failed [{}]: {}", url, e.getMessage());
            return fallback;
        }
    }
}
