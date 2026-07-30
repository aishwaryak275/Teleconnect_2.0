package com.teleconnect.analytics_service.client.mock;

import com.teleconnect.analytics_service.client.PlanStatsClient;
import com.teleconnect.analytics_service.dto.external.SubscriptionDto;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Mock implementation of PlanStatsClient for testing without the actual Plan module.
 * Enable with: mock.clients.enabled=true
 */
@Component
@ConditionalOnProperty(name = "mock.clients.enabled", havingValue = "true")
public class MockPlanStatsClient implements PlanStatsClient {

    @Override
    public List<SubscriptionDto> getSubscriptionsByPlan(Integer planId) {
        List<SubscriptionDto> all = new ArrayList<>();
        all.add(create(1, 2001, 1, "A"));
        all.add(create(2, 2002, 1, "A"));
        all.add(create(3, 2003, 2, "A"));
        all.add(create(4, 2004, 2, "E"));
        all.add(create(5, 2005, 3, "A"));

        if (planId == null) return all;
        return all.stream().filter(s -> planId.equals(s.getPlanId())).toList();
    }

    private SubscriptionDto create(int subscriptionId, int lineId, int planId, String status) {
        SubscriptionDto s = new SubscriptionDto();
        s.setSubscriptionId(subscriptionId);
        s.setLineId(lineId);
        s.setPlanId(planId);
        s.setStatus(status);
        return s;
    }
}
