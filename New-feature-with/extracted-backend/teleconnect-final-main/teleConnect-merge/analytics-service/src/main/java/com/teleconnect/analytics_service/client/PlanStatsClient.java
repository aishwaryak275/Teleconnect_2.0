package com.teleconnect.analytics_service.client;

import com.teleconnect.analytics_service.dto.external.SubscriptionDto;

import java.util.List;

/**
 * HTTP client for the Plan &amp; Service Provisioning module — backs
 * plan-scoped ({@link com.teleconnect.analytics_service.enums.ReportScope#PLAN})
 * report aggregation.
 */
public interface PlanStatsClient {

    /** All subscriptions currently on the given plan, any status. */
    List<SubscriptionDto> getSubscriptionsByPlan(Integer planId);
}
