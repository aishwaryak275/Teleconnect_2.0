package com.teleconnect.analytics_service.client.impl;

import com.teleconnect.analytics_service.client.PlanStatsClient;
import com.teleconnect.analytics_service.dto.external.SubscriptionDto;
import com.teleconnect.analytics_service.exception.ModuleClientException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Arrays;
import java.util.List;

@Component
@ConditionalOnProperty(name = "mock.clients.enabled", havingValue = "false", matchIfMissing = true)
public class PlanStatsClientImpl implements PlanStatsClient {

    private static final String MODULE = "Plan & Service Provisioning";

    private final RestTemplate restTemplate;
    private final String baseUrl;

    public PlanStatsClientImpl(RestTemplate restTemplate,
                                @Value("${teleconnect.modules.plan.base-url}") String baseUrl) {
        this.restTemplate = restTemplate;
        this.baseUrl = baseUrl;
    }

    @Override
    public List<SubscriptionDto> getSubscriptionsByPlan(Integer planId) {
        String url = baseUrl + "/teleConnect/plan/getAllSubscriptions";
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.add("X-Authenticated-User", "analytics-service");
            headers.add("X-Authenticated-Permissions", "GET_SUB");
            SubscriptionDto[] result = restTemplate.exchange(
                    url, HttpMethod.GET, new HttpEntity<>(headers), SubscriptionDto[].class).getBody();
            if (result == null) return List.of();
            return Arrays.stream(result)
                    .filter(s -> planId == null || planId.equals(s.getPlanId()))
                    .toList();
        } catch (RestClientException e) {
            throw new ModuleClientException(MODULE, "GET " + url + " failed: " + e.getMessage(), e);
        }
    }
}
