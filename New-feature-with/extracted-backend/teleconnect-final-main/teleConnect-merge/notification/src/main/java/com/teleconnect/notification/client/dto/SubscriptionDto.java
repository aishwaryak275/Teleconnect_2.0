package com.teleconnect.notification.client.dto;

import lombok.Data;
import java.time.LocalDate;

/** Mirrors only the fields the Notification module needs from Plan's ServiceSubscriptionResponse. */
@Data
public class SubscriptionDto {
    private Integer subscriptionId;
    private Integer lineId;
    private Integer planId;
    private LocalDate expiryDate;
    private String status;
}
