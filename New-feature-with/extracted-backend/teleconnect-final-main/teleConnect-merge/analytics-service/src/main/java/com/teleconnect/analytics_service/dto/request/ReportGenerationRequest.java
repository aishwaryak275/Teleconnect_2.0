package com.teleconnect.analytics_service.dto.request;

import com.teleconnect.analytics_service.enums.ReportScope;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public class ReportGenerationRequest {

    @NotNull(message = "Scope is required")
    private ReportScope scope;

    @NotNull(message = "scopeValue is required")
    private String scopeValue;

    @NotNull(message = "periodStart is required")
    private LocalDate periodStart;

    @NotNull(message = "periodEnd is required")
    private LocalDate periodEnd;

    private Long generatedBy;

    // Optional — when supplied, generateReport() also computes ARPU and
    // DataConsumption (both require a specific billing cycle). Omit to get a
    // report with just Churn/SLA/SubscriberGrowth metrics, as before.
    private Long cycleId;

    public ReportGenerationRequest() {}

    public ReportScope getScope() { return scope; }
    public void setScope(ReportScope scope) { this.scope = scope; }

    public String getScopeValue() { return scopeValue; }
    public void setScopeValue(String scopeValue) { this.scopeValue = scopeValue; }

    public LocalDate getPeriodStart() { return periodStart; }
    public void setPeriodStart(LocalDate periodStart) { this.periodStart = periodStart; }

    public LocalDate getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(LocalDate periodEnd) { this.periodEnd = periodEnd; }

    public Long getGeneratedBy() { return generatedBy; }
    public void setGeneratedBy(Long generatedBy) { this.generatedBy = generatedBy; }

    public Long getCycleId() { return cycleId; }
    public void setCycleId(Long cycleId) { this.cycleId = cycleId; }
}
