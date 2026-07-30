package com.teleconnect.analytics_service.dto.external;

/**
 * Lightweight projection of ServiceSubscription, as returned by the Plan &
 * Service Provisioning module's getAllSubscriptions API.
 */
public class SubscriptionDto {

    private Integer subscriptionId;
    private Integer lineId;
    private Integer planId;
    private String status;

    public SubscriptionDto() {}

    public Integer getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(Integer subscriptionId) { this.subscriptionId = subscriptionId; }

    public Integer getLineId() { return lineId; }
    public void setLineId(Integer lineId) { this.lineId = lineId; }

    public Integer getPlanId() { return planId; }
    public void setPlanId(Integer planId) { this.planId = planId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
