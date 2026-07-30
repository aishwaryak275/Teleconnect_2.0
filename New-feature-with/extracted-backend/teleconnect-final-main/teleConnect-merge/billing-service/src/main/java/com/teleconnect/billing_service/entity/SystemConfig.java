package com.teleconnect.billing_service.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Single-row tariff/provisioning configuration, shared by the Admin Console's
 * "Global Tariff & SLA Configuration" screen and the Billing Dashboard's
 * late-fee setting. Always read/written via configId=1.
 */
@Entity
@Table(name = "system_config")
@Data
public class SystemConfig {

    @Id
    private Integer configId = 1;

    private BigDecimal taxPercentage = new BigDecimal("18.00");
    private BigDecimal excessDataRateMb = new BigDecimal("0.50");
    private BigDecimal excessVoiceRateMin = new BigDecimal("1.00");
    private BigDecimal excessSmsRateCount = new BigDecimal("0.50");
    private BigDecimal lateFeeFlat = new BigDecimal("100");
    private BigDecimal lateFeePercentage = new BigDecimal("2.0");
    private Integer lateFeeGraceDays = 5;
    private Integer autoSuspendDays = 15;
    private boolean alertThreshold80 = true;
    private boolean alertThreshold100 = true;

    private LocalDateTime updatedAt;
}
