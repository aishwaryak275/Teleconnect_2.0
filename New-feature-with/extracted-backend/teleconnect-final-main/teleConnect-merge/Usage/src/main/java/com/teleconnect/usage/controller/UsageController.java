package com.teleconnect.usage.controller;

import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PostConstruct;

import com.teleconnect.usage.dto.request.UsageRecordRequest;
import com.teleconnect.usage.dto.response.*;
import com.teleconnect.usage.service.UsageService;
import com.teleconnect.common.audit.AuditAction;
import com.teleconnect.common.audit.AuditModule;
import com.teleconnect.common.audit.AuditClient;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/teleConnect/usage")
public class UsageController {
        private final UsageService usageService;
        private final AuditClient auditClient;

        public UsageController(UsageService usageService, AuditClient auditClient) {
                this.usageService = usageService;
                this.auditClient = auditClient;
        }

        @PostConstruct
        public void init() {
            log.info("Initialized UsageController");
        }

        // USAGE RECORDING
        @PostMapping("/createRecord")
        @PreAuthorize("hasAnyAuthority('CREATE_USER','USAGE_RECORDS')")
        public ResponseEntity<Map<String, String>> createRecord(
                        @Valid @RequestBody UsageRecordRequest req, HttpServletRequest httpReq) {
                log.info("Creating usage record lineId={}", req.getLineId());
                var result = ResponseEntity.status(HttpStatus.CREATED)
                                .body(usageService.createUsageRecord(req));
                auditClient.record(AuditAction.CREATE_USAGE_RECORD, AuditModule.USAGE, httpReq);
                log.info("Usage record created lineId={}", req.getLineId());
                return result;
        }

        @GetMapping("/fetchRecords/{lineId}")
        @PreAuthorize("hasAuthority('USAGE_RECORDS')")
        public ResponseEntity<Map<String, Object>> fetchByLine(@PathVariable Long lineId) {
                log.info("Fetching usage records by lineId={}", lineId);
                var records = usageService.fetchRecordsByLine(lineId);
                log.debug("Retrieved usage records for lineId={}", lineId);
                return ResponseEntity.ok(Map.of("lineId", lineId,
                                "records", records));
        }

        @GetMapping("/fetchRecords/{lineId}/{billingCycleId}")
        @PreAuthorize("hasAuthority('USAGE_RECORDS')")
        public ResponseEntity<Map<String, Object>> fetchByCycle(
                        @PathVariable Long lineId, @PathVariable Long billingCycleId) {
                log.info("Fetching usage records lineId={} cycleId={}", lineId, billingCycleId);
                var records = usageService.fetchRecordsByCycle(lineId, billingCycleId);
                log.debug("Retrieved records lineId={} cycleId={}", lineId, billingCycleId);
                return ResponseEntity.ok(Map.of(
                                "lineId", lineId, "billingCycleId", billingCycleId,
                                "records", records));
        }

        // USAGE SUMMARY
        @GetMapping("/fetchSummary/{lineId}/{billingCycleId}")
        @PreAuthorize("hasAuthority('USAGE_RECORDS')")
        public ResponseEntity<UsageSummaryResponse> fetchSummary(
                        @PathVariable Long lineId, @PathVariable Long billingCycleId) {
                log.info("Fetching usage summary lineId={} cycleId={}", lineId, billingCycleId);
                UsageSummaryResponse summary = usageService.fetchSummary(lineId, billingCycleId);
                log.debug("Usage summary retrieved lineId={} cycleId={}", lineId, billingCycleId);
                return ResponseEntity.ok(summary);
        }

        // Cross-service bulk read — backs the Notification module's usage-threshold sweep.
        @GetMapping("/allSummaries")
        @PreAuthorize("hasAuthority('USAGE_ANALYTICS')")
        public ResponseEntity<List<UsageSummaryResponse>> fetchAllSummaries() {
                log.info("Fetching all usage summaries");
                return ResponseEntity.ok(usageService.fetchAllSummaries());
        }

        @PutMapping("/updateSummary/{lineId}/{billingCycleId}")
        @PreAuthorize("hasAuthority('CREATE_USER')")
        public ResponseEntity<Map<String, Object>> updateSummary(
                        @PathVariable Long lineId, @PathVariable Long billingCycleId,
                        @RequestBody Map<String, Object> body, HttpServletRequest httpReq) {
                log.info("Updating usage summary lineId={} cycleId={}", lineId, billingCycleId);
                BigDecimal dataUsedMb = body.get("dataUsedMb") != null
                                ? new BigDecimal(body.get("dataUsedMb").toString())
                                : null;
                BigDecimal voiceUsedMin = body.get("voiceUsedMin") != null
                                ? new BigDecimal(body.get("voiceUsedMin").toString())
                                : null;
                Integer smsUsed = body.get("smsUsed") != null ? Integer.parseInt(body.get("smsUsed").toString()) : null;
                var result = ResponseEntity.ok(usageService.updateSummary(
                                lineId, billingCycleId, dataUsedMb, voiceUsedMin, smsUsed));
                auditClient.record(AuditAction.UPDATE_USAGE_SUMMARY, AuditModule.USAGE, httpReq);
                log.info("Usage summary updated lineId={} cycleId={}", lineId, billingCycleId);
                return result;
        }

        // PLAN LIMIT TRACKING
        // Pass plan limits as query params:
        // ?dataLimitMb=5120&voiceLimitMin=300&smsLimit=100
        @GetMapping("/limitStatus/{lineId}/{billingCycleId}")
        @PreAuthorize("hasAuthority('USAGE_RECORDS')")
        public ResponseEntity<LimitStatusResponse> getLimitStatus(
                        @PathVariable Long lineId, @PathVariable Long billingCycleId,
                        @RequestParam double dataLimitMb, @RequestParam double voiceLimitMin,
                        @RequestParam int smsLimit) {
                log.info("Getting limit status lineId={} cycleId={}", lineId, billingCycleId);
                LimitStatusResponse status = usageService.getLimitStatus(
                                lineId, billingCycleId, dataLimitMb, voiceLimitMin, smsLimit);
                log.debug("Limit status retrieved lineId={} cycleId={}", lineId, billingCycleId);
                return ResponseEntity.ok(status);
        }

        @GetMapping("/remaining/{lineId}/{billingCycleId}")
        @PreAuthorize("hasAuthority('USAGE_RECORDS')")
        public ResponseEntity<Map<String, Object>> getRemaining(
                        @PathVariable Long lineId, @PathVariable Long billingCycleId) {
                log.info("Getting remaining quota lineId={} cycleId={}", lineId, billingCycleId);
                Map<String, Object> quota = usageService.getRemainingQuota(lineId, billingCycleId);
                log.debug("Remaining quota retrieved lineId={} cycleId={}", lineId, billingCycleId);
                return ResponseEntity.ok(quota);
        }

        // ALERTS
        @GetMapping("/alerts/{lineId}/{billingCycleId}")
        @PreAuthorize("hasAuthority('USAGE_RECORDS')")
        public ResponseEntity<AlertResponse> getAlerts(
                        @PathVariable Long lineId, @PathVariable Long billingCycleId,
                        @RequestParam double dataLimitMb, @RequestParam double voiceLimitMin,
                        @RequestParam int smsLimit) {
                log.info("Getting threshold alerts lineId={} cycleId={}", lineId, billingCycleId);
                AlertResponse alerts = usageService.getThresholdAlerts(
                                lineId, billingCycleId, dataLimitMb, voiceLimitMin, smsLimit);
                log.debug("Threshold alerts retrieved lineId={} cycleId={}", lineId, billingCycleId);
                return ResponseEntity.ok(alerts);
        }

        // ANALYTICS
        @GetMapping("/analytics/{lineId}")
        @PreAuthorize("hasAuthority('USAGE_ANALYTICS')")
        public ResponseEntity<AnalyticsTrendResponse> getAnalyticsTrend(
                        @PathVariable Long lineId) {
                log.info("Getting usage trend lineId={}", lineId);
                AnalyticsTrendResponse trend = usageService.getUsageTrend(lineId);
                log.debug("Usage trend retrieved lineId={}", lineId);
                return ResponseEntity.ok(trend);
        }

        // GET /teleConnect/usage/analytics/{lineId}/top-usage
        @GetMapping("/analytics/{lineId}/top-usage")
        @PreAuthorize("hasAuthority('USAGE_ANALYTICS')")
        public ResponseEntity<Map<String, Object>> getTopUsage(
                        @PathVariable Long lineId) {
                log.info("Getting top usage lineId={}", lineId);
                Map<String, Object> topUsage = usageService.getTopUsage(lineId);
                log.debug("Top usage retrieved lineId={}", lineId);
                return ResponseEntity.ok(topUsage);
        }
}
