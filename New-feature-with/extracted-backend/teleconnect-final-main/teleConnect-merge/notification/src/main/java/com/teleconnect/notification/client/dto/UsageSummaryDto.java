package com.teleconnect.notification.client.dto;

import lombok.Data;
import java.math.BigDecimal;

/** Mirrors only the fields the Notification module needs from Usage's UsageSummaryResponse. */
@Data
public class UsageSummaryDto {
    private Long lineId;
    private Long billingCycleId;
    private BigDecimal dataUsedMb;
    private BigDecimal voiceUsedMin;
    private Integer smsUsed;
    private BigDecimal dataRemainingMb;
    private BigDecimal voiceRemainingMin;
    private Integer smsRemaining;
}
