package com.teleconnect.billing_service.service;

import com.teleconnect.billing_service.entity.SystemConfig;
import com.teleconnect.billing_service.repository.SystemConfigRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

@Slf4j
@Service
public class SystemConfigService {

    private final SystemConfigRepository repository;

    public SystemConfigService(SystemConfigRepository repository) {
        this.repository = repository;
    }

    public SystemConfig getConfig() {
        return repository.findById(1).orElseGet(() -> repository.save(new SystemConfig()));
    }

    /** Partial update — only overwrites keys present in the map, matching the frontend's FormGroup.value shape. */
    public SystemConfig updateConfig(Map<String, Object> updates) {
        log.info("Updating system config keys={}", updates.keySet());
        SystemConfig config = getConfig();
        if (updates.containsKey("taxPercentage")) config.setTaxPercentage(toBigDecimal(updates.get("taxPercentage")));
        if (updates.containsKey("excessDataRateMb")) config.setExcessDataRateMb(toBigDecimal(updates.get("excessDataRateMb")));
        if (updates.containsKey("excessVoiceRateMin")) config.setExcessVoiceRateMin(toBigDecimal(updates.get("excessVoiceRateMin")));
        if (updates.containsKey("excessSmsRateCount")) config.setExcessSmsRateCount(toBigDecimal(updates.get("excessSmsRateCount")));
        if (updates.containsKey("lateFeeFlat")) config.setLateFeeFlat(toBigDecimal(updates.get("lateFeeFlat")));
        if (updates.containsKey("lateFeePercentage")) config.setLateFeePercentage(toBigDecimal(updates.get("lateFeePercentage")));
        if (updates.containsKey("lateFeeGraceDays")) config.setLateFeeGraceDays(toInt(updates.get("lateFeeGraceDays")));
        if (updates.containsKey("autoSuspendDays")) config.setAutoSuspendDays(toInt(updates.get("autoSuspendDays")));
        if (updates.containsKey("alertThreshold80")) config.setAlertThreshold80(Boolean.TRUE.equals(updates.get("alertThreshold80")));
        if (updates.containsKey("alertThreshold100")) config.setAlertThreshold100(Boolean.TRUE.equals(updates.get("alertThreshold100")));
        config.setUpdatedAt(LocalDateTime.now());
        SystemConfig saved = repository.save(config);
        log.info("System config updated");
        return saved;
    }

    private BigDecimal toBigDecimal(Object v) {
        return v == null ? null : new BigDecimal(v.toString());
    }

    private Integer toInt(Object v) {
        return v == null ? null : Integer.parseInt(v.toString());
    }
}
