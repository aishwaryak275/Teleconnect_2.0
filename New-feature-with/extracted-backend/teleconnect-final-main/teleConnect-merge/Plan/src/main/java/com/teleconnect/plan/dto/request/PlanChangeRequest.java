package com.teleconnect.plan.dto.request;

import lombok.Data;

/** Upgrade/downgrade a subscription to a different plan. */
@Data
public class PlanChangeRequest {
    private Integer newPlanId;
}
