package com.teleconnect.usage.service;

import lombok.extern.slf4j.Slf4j;

import com.teleconnect.usage.dto.request.UsageRecordRequest;
import com.teleconnect.usage.dto.response.*;
import com.teleconnect.usage.entity.UsageRecord;
import com.teleconnect.usage.entity.UsageSummary;
import com.teleconnect.usage.entity.enums.UsageType;
import com.teleconnect.usage.entity.enums.UsageUnit;
import com.teleconnect.usage.exception.ResourceNotFoundException;
import com.teleconnect.usage.repository.UsageRecordRepository;
import com.teleconnect.usage.repository.UsageSummaryRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class UsageService {
    private final UsageRecordRepository recordRepo;
    private final UsageSummaryRepository summaryRepo;
    @Value("${app.alert.warning.threshold:80}")
    private double warningThreshold;

    public UsageService(UsageRecordRepository recordRepo, UsageSummaryRepository summaryRepo) {
        this.recordRepo = recordRepo;
        this.summaryRepo = summaryRepo;
    }
    @Value("${app.alert.critical.threshold:90}")
    private double criticalThreshold;

    // HELPER: derive unit from usageType
    private UsageUnit deriveUnit(UsageType type) {
        return switch (type) {
            case DATA -> UsageUnit.MB;
            case VOICE -> UsageUnit.MINUTES;
            case SMS -> UsageUnit.COUNT;
        };
    }

    // HELPER: map entity → response DTO
    private UsageRecordResponse toRecordDTO(UsageRecord r) {
        UsageRecordResponse dto = new UsageRecordResponse();
        dto.setUsageId(r.getUsageId());
        dto.setLineId(r.getLineId());
        dto.setUsageType(r.getUsageType().name());
        dto.setQuantity(r.getQuantity());
        dto.setUnit(r.getUnit().name());
        dto.setUsageDate(r.getUsageDate());
        dto.setBillingCycleId(r.getBillingCycleId());
        return dto;
    }

    private UsageSummaryResponse toSummaryDTO(UsageSummary s) {
        UsageSummaryResponse dto = new UsageSummaryResponse();
        dto.setSummaryId(s.getSummaryId());
        dto.setLineId(s.getLineId());
        dto.setBillingCycleId(s.getBillingCycleId());
        dto.setDataUsedMb(s.getDataUsedMb());
        dto.setVoiceUsedMin(s.getVoiceUsedMin());
        dto.setSmsUsed(s.getSmsUsed());
        dto.setDataRemainingMb(s.getDataRemainingMb());
        dto.setVoiceRemainingMin(s.getVoiceRemainingMin());
        dto.setSmsRemaining(s.getSmsRemaining());
        dto.setLastUpdated(s.getLastUpdated());
        return dto;
    }

    // 1. CREATE USAGE RECORD
    // POST /teleConnect/usage/createRecord
    public Map<String, String> createUsageRecord(UsageRecordRequest req) {
        log.info("Create usage record for lineId={} billingCycleId={} type={}", req.getLineId(), req.getBillingCycleId(), req.getUsageType());
        // Parse and validate usageType
        UsageType type;
        try {
            type = UsageType.valueOf(req.getUsageType().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "Invalid usageType value: '" + req.getUsageType() +
                            "'. Must be DATA, VOICE, or SMS.");
        }
        // Build and save UsageRecord
        UsageRecord record = new UsageRecord();
        record.setLineId(req.getLineId());
        record.setBillingCycleId(req.getBillingCycleId());
        record.setUsageType(type);
        record.setQuantity(req.getQuantity());
        record.setUnit(deriveUnit(type)); // auto-set from type
        record.setUsageDate(req.getUsageDate());
        recordRepo.save(record);
        log.debug("Usage record persisted for lineId={} (billingCycleId={})", req.getLineId(), req.getBillingCycleId());
        // Auto-update the summary after every new record
        autoUpdateSummary(
                req.getLineId(),
                req.getBillingCycleId(),
                type,
                req.getQuantity(),
                req.getDataLimitMb(), // add these 3 fields to UsageRecordRequest
                req.getVoiceLimitMin(),
                req.getSmsLimit());

        return Map.of("message", "Usage recorded successfully");
    }

    // Auto-updates the UsageSummary whenever a new record is created
    private void autoUpdateSummary(Long lineId, Long cycleId,
            UsageType type, BigDecimal quantity,
            double dataLimitMb, double voiceLimitMin,
            int smsLimit) {
        UsageSummary summary = summaryRepo
                .findByLineIdAndBillingCycleId(lineId, cycleId)
                .orElseGet(() -> {
                    UsageSummary s = new UsageSummary();
                    s.setLineId(lineId);
                    s.setBillingCycleId(cycleId);
                    // Set initial remaining = full plan limits
                    s.setDataRemainingMb(BigDecimal.valueOf(dataLimitMb));
                    s.setVoiceRemainingMin(BigDecimal.valueOf(voiceLimitMin));
                    s.setSmsRemaining(smsLimit);
                    return s;
                });

        switch (type) {
            case DATA -> {
                BigDecimal newUsed = summary.getDataUsedMb().add(quantity);
                summary.setDataUsedMb(newUsed);
                // remaining = limit - used (never go below 0)
                double remaining = Math.max(0, dataLimitMb - newUsed.doubleValue());
                summary.setDataRemainingMb(BigDecimal.valueOf(remaining));
            }
            case VOICE -> {
                BigDecimal newUsed = summary.getVoiceUsedMin().add(quantity);
                summary.setVoiceUsedMin(newUsed);
                double remaining = Math.max(0, voiceLimitMin - newUsed.doubleValue());
                summary.setVoiceRemainingMin(BigDecimal.valueOf(remaining));
            }
            case SMS -> {
                int newUsed = summary.getSmsUsed() + quantity.intValue();
                summary.setSmsUsed(newUsed);
                summary.setSmsRemaining(Math.max(0, smsLimit - newUsed));
            }
        }
        summary.setLastUpdated(LocalDateTime.now());
        summaryRepo.save(summary);
    }

    // 2. FETCH ALL RECORDS FOR A LINE
    public List<UsageRecordResponse> fetchRecordsByLine(Long lineId) {
        log.debug("Fetching usage records for lineId={}", lineId);
        List<UsageRecord> records = recordRepo.findByLineId(lineId);
        if (records.isEmpty()) {
            log.warn("No usage records found for lineId={}", lineId);
            throw new ResourceNotFoundException("No records found for lineId: " + lineId);
        }
        return records.stream().map(this::toRecordDTO).collect(Collectors.toList());
    }

    // 3. FETCH RECORDS BY BILLING CYCLE
    public List<UsageRecordResponse> fetchRecordsByCycle(
            Long lineId, Long billingCycleId) {
        log.debug("Fetching usage records for lineId={} cycleId={}", lineId, billingCycleId);
        List<UsageRecord> records = recordRepo.findByLineIdAndBillingCycleId(lineId, billingCycleId);
        if (records.isEmpty()) {
            log.warn("No usage records found for lineId={} cycleId={}", lineId, billingCycleId);
            throw new ResourceNotFoundException("No records found for given cycle");
        }
        return records.stream().map(this::toRecordDTO).collect(Collectors.toList());
    }

    // 4. FETCH USAGE SUMMARY
    public UsageSummaryResponse fetchSummary(Long lineId, Long billingCycleId) {
        log.debug("Fetching usage summary for lineId={} cycleId={}", lineId, billingCycleId);
        UsageSummary summary = summaryRepo
            .findByLineIdAndBillingCycleId(lineId, billingCycleId)
            .orElseThrow(() -> new ResourceNotFoundException("Summary not found"));
        return toSummaryDTO(summary);
    }

    // 4b. FETCH ALL SUMMARIES (cross-service use — e.g. Notification's usage-threshold sweep)
    public List<UsageSummaryResponse> fetchAllSummaries() {
        log.debug("Fetching all usage summaries");
        return summaryRepo.findAll().stream().map(this::toSummaryDTO).collect(Collectors.toList());
    }

    // 5. UPDATE SUMMARY MANUALLY
    public Map<String, Object> updateSummary(Long lineId, Long billingCycleId,
            BigDecimal dataUsedMb,
            BigDecimal voiceUsedMin,
            Integer smsUsed) {
        log.info("Update summary requested for lineId={} cycleId={}", lineId, billingCycleId);
        UsageSummary summary = summaryRepo
            .findByLineIdAndBillingCycleId(lineId, billingCycleId)
            .orElseThrow(() -> new ResourceNotFoundException("Summary not found"));
        if (dataUsedMb != null)
            summary.setDataUsedMb(dataUsedMb);
        if (voiceUsedMin != null)
            summary.setVoiceUsedMin(voiceUsedMin);
        if (smsUsed != null)
            summary.setSmsUsed(smsUsed);
        summary.setLastUpdated(LocalDateTime.now());
        summaryRepo.save(summary);
        log.debug("Usage summary updated for lineId={} cycleId={}", lineId, billingCycleId);
        return Map.of("message", "Summary updated successfully",
            "lastUpdated", summary.getLastUpdated().toString());
    }

    // 6. LIMIT STATUS (plan limits passed as params)
    public LimitStatusResponse getLimitStatus(Long lineId, Long billingCycleId,
            double dataLimitMb,
            double voiceLimitMin, int smsLimit) {
        log.debug("Getting limit status for lineId={} cycleId={}", lineId, billingCycleId);
        UsageSummary s = summaryRepo
            .findByLineIdAndBillingCycleId(lineId, billingCycleId)
            .orElseThrow(() -> new ResourceNotFoundException("Line or cycle not found"));
        LimitStatusResponse res = new LimitStatusResponse();
        res.setLineId(lineId);
        LimitStatusResponse.DataStatus data = new LimitStatusResponse.DataStatus();
        data.setUsedMb(s.getDataUsedMb().doubleValue());
        data.setLimitMb(dataLimitMb);
        data.setStatus(s.getDataUsedMb().doubleValue() > dataLimitMb ? "LIMIT_EXCEEDED" : "WITHIN_LIMIT");
        res.setData(data);
        LimitStatusResponse.VoiceStatus voice = new LimitStatusResponse.VoiceStatus();
        voice.setUsedMin(s.getVoiceUsedMin().doubleValue());
        voice.setLimitMin(voiceLimitMin);
        voice.setStatus(s.getVoiceUsedMin().doubleValue() > voiceLimitMin ? "LIMIT_EXCEEDED" : "WITHIN_LIMIT");
        res.setVoice(voice);
        LimitStatusResponse.SmsStatus sms = new LimitStatusResponse.SmsStatus();
        sms.setUsed(s.getSmsUsed());
        sms.setLimit(smsLimit);
        sms.setStatus(s.getSmsUsed() > smsLimit ? "LIMIT_EXCEEDED" : "WITHIN_LIMIT");
        res.setSms(sms);
        return res;
    }

    // 7. REMAINING QUOTA
    public Map<String, Object> getRemainingQuota(Long lineId, Long billingCycleId) {
        log.debug("Getting remaining quota for lineId={} cycleId={}", lineId, billingCycleId);
        UsageSummary s = summaryRepo
            .findByLineIdAndBillingCycleId(lineId, billingCycleId)
            .orElseThrow(() -> new ResourceNotFoundException("No quota data found"));
        return Map.of("lineId", lineId,
            "dataRemainingMb", s.getDataRemainingMb(),
            "voiceRemainingMin", s.getVoiceRemainingMin(),
            "smsRemaining", s.getSmsRemaining());
    }

    // 8. THRESHOLD ALERTS
    public AlertResponse getThresholdAlerts(Long lineId, Long billingCycleId,
            double dataLimitMb,
            double voiceLimitMin, int smsLimit) {
        log.debug("Checking threshold alerts for lineId={} cycleId={}", lineId, billingCycleId);
        UsageSummary s = summaryRepo
            .findByLineIdAndBillingCycleId(lineId, billingCycleId)
            .orElseThrow(() -> new ResourceNotFoundException("No alerts found"));
        List<AlertResponse.Alert> alerts = new ArrayList<>();
        double dataPct = (s.getDataUsedMb().doubleValue() / dataLimitMb) * 100;
        double voicePct = (s.getVoiceUsedMin().doubleValue() / voiceLimitMin) * 100;
        double smsPct = ((double) s.getSmsUsed() / smsLimit) * 100;
        if (dataPct >= warningThreshold)
            alerts.add(new AlertResponse.Alert("DATA",
                    Math.round(dataPct * 100.0) / 100.0, dataPct >= criticalThreshold ? "CRITICAL" : "WARNING"));
        if (voicePct >= warningThreshold)
            alerts.add(new AlertResponse.Alert("VOICE",
                    Math.round(voicePct * 100.0) / 100.0, voicePct >= criticalThreshold ? "CRITICAL" : "WARNING"));
        if (smsPct >= warningThreshold)
            alerts.add(new AlertResponse.Alert("SMS",
                    Math.round(smsPct * 100.0) / 100.0, smsPct >= criticalThreshold ? "CRITICAL" : "WARNING"));
        return new AlertResponse(alerts);
    }

    // 9. USAGE TREND
    public AnalyticsTrendResponse getUsageTrend(Long lineId) {
        log.debug("Generating usage trend for lineId={}", lineId);
        List<UsageSummary> summaries = summaryRepo.findByLineId(lineId);
        if (summaries.isEmpty())
            throw new ResourceNotFoundException("No trend data found");
        List<AnalyticsTrendResponse.CycleTrend> trend = summaries.stream().map(s -> {
            AnalyticsTrendResponse.CycleTrend ct = new AnalyticsTrendResponse.CycleTrend();
            ct.setBillingCycleId(s.getBillingCycleId());
            ct.setDataUsedMb(s.getDataUsedMb().doubleValue());
            ct.setVoiceUsedMin(s.getVoiceUsedMin().doubleValue());
            ct.setSmsUsed(s.getSmsUsed());
            return ct;
        }).collect(Collectors.toList());
        AnalyticsTrendResponse res = new AnalyticsTrendResponse();
        res.setLineId(lineId);
        res.setTrend(trend);
        return res;
    }

    // 10. TOP USAGE
    public Map<String, Object> getTopUsage(Long lineId) {
        log.debug("Computing top usage for lineId={}", lineId);
        double dataTotal = recordRepo
            .sumQuantityByLineIdAndUsageType(lineId, UsageType.DATA).orElse(0.0);
        double voiceTotal = recordRepo
                .sumQuantityByLineIdAndUsageType(lineId, UsageType.VOICE).orElse(0.0);
        double smsTotal = recordRepo
                .sumQuantityByLineIdAndUsageType(lineId, UsageType.SMS).orElse(0.0);
        if (dataTotal == 0 && voiceTotal == 0 && smsTotal == 0)
            throw new ResourceNotFoundException("No usage data found");
        String topType;
        double topQty;
        String topUnit;
        if (dataTotal >= voiceTotal && dataTotal >= smsTotal) {
            topType = "DATA";
            topQty = dataTotal;
            topUnit = "MB";
        } else if (voiceTotal >= smsTotal) {
            topType = "VOICE";
            topQty = voiceTotal;
            topUnit = "MINUTES";
        } else {
            topType = "SMS";
            topQty = smsTotal;
            topUnit = "COUNT";
        }
        return Map.of("lineId", lineId,
                "topUsage", Map.of("usageType", topType,
                        "quantity", topQty, "unit", topUnit));
    }
} // end UsageService
