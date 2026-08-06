package com.teleconnect.analytics_service.config;

import com.teleconnect.analytics_service.service.SLAComplianceService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Slf4j
@Configuration
@EnableScheduling
public class SchedulingConfig {

    private final SLAComplianceService slaComplianceService;

    public SchedulingConfig(SLAComplianceService slaComplianceService) {
        this.slaComplianceService = slaComplianceService;
    }

    @Scheduled(fixedRateString = "PT1H")
    public void scheduledSLAEscalation() {
        log.info("Running scheduled SLA breach escalation check");
        try {
            slaComplianceService.escalateBreachingTickets();
        } catch (Exception e) {
            log.error("SLA escalation job failed: {}", e.getMessage());
        }
    }
}
