package com.teleconnect.notification.client;

import com.teleconnect.notification.client.dto.SubscriptionDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class PlanStatsClient extends AbstractServiceClient {

    @Value("${teleconnect.modules.plan.base-url:http://localhost:8083}")
    private String baseUrl;

    public List<SubscriptionDto> getAllSubscriptions() {
        return getOrElse(baseUrl + "/teleConnect/plan/getAllSubscriptions", "GET_SUB",
                new ParameterizedTypeReference<List<SubscriptionDto>>() {}, List.of());
    }
}
