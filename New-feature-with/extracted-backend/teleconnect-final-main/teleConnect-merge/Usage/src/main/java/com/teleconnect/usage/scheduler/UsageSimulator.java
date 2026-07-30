package com.teleconnect.usage.scheduler;

import com.teleconnect.usage.entity.UsageRecord;
import com.teleconnect.usage.entity.UsageSummary;
import com.teleconnect.usage.entity.enums.UsageType;
import com.teleconnect.usage.entity.enums.UsageUnit;
import com.teleconnect.usage.repository.UsageRecordRepository;
import com.teleconnect.usage.repository.UsageSummaryRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Random;

/**
 * Simulates ongoing subscriber consumption so usage grows in real time.
 *
 * On each tick it adds a small, random amount of data / voice / SMS usage to
 * every {@link UsageSummary} that still has entitlement remaining, and writes a
 * matching {@link UsageRecord} (dated "now") so the daily usage trend keeps
 * climbing. Increments are clamped to each line's remaining entitlement, so a
 * line naturally stops growing once it reaches its plan limit.
 *
 * Controlled via configuration:
 *   usage.simulator.enabled     (default true)   — master on/off switch
 *   usage.simulator.interval-ms (default 120000) — how often a tick fires (2 minutes)
 */
@Slf4j
@Component
public class UsageSimulator {

    private final UsageSummaryRepository summaryRepository;
    private final UsageRecordRepository recordRepository;
    private final Random random = new Random();

    @Value("${usage.simulator.enabled:true}")
    private boolean enabled;

    public UsageSimulator(UsageSummaryRepository summaryRepository,
                          UsageRecordRepository recordRepository) {
        this.summaryRepository = summaryRepository;
        this.recordRepository = recordRepository;
    }

    @Scheduled(fixedRateString = "${usage.simulator.interval-ms:120000}")
    @Transactional
    public void simulate() {
        if (!enabled) {
            return;
        }

        List<UsageSummary> summaries = summaryRepository.findAll();
        LocalDateTime now = LocalDateTime.now();
        int touched = 0;

        for (UsageSummary s : summaries) {
            boolean changed = false;

            // DATA: 5–25 MB per tick
            BigDecimal dataRem = nz(s.getDataRemainingMb());
            if (dataRem.signum() > 0) {
                BigDecimal inc = clamp(BigDecimal.valueOf(5 + random.nextInt(21)), dataRem);
                s.setDataUsedMb(nz(s.getDataUsedMb()).add(inc));
                s.setDataRemainingMb(dataRem.subtract(inc));
                writeRecord(s, UsageType.DATA, UsageUnit.MB, inc, now);
                changed = true;
            }

            // VOICE: 0–3 minutes per tick
            BigDecimal voiceRem = nz(s.getVoiceRemainingMin());
            if (voiceRem.signum() > 0) {
                BigDecimal inc = clamp(BigDecimal.valueOf(random.nextInt(4)), voiceRem);
                if (inc.signum() > 0) {
                    s.setVoiceUsedMin(nz(s.getVoiceUsedMin()).add(inc));
                    s.setVoiceRemainingMin(voiceRem.subtract(inc));
                    writeRecord(s, UsageType.VOICE, UsageUnit.MINUTES, inc, now);
                    changed = true;
                }
            }

            // SMS: 0–2 messages per tick
            int smsRem = s.getSmsRemaining() == null ? 0 : s.getSmsRemaining();
            if (smsRem > 0) {
                int inc = Math.min(random.nextInt(3), smsRem);
                if (inc > 0) {
                    s.setSmsUsed((s.getSmsUsed() == null ? 0 : s.getSmsUsed()) + inc);
                    s.setSmsRemaining(smsRem - inc);
                    writeRecord(s, UsageType.SMS, UsageUnit.COUNT, BigDecimal.valueOf(inc), now);
                    changed = true;
                }
            }

            if (changed) {
                s.setLastUpdated(now);
                summaryRepository.save(s);
                touched++;
            }
        }

        if (touched > 0) {
            log.info("[UsageSimulator] Simulated usage for {} line(s)", touched);
        }
    }

    private void writeRecord(UsageSummary s, UsageType type, UsageUnit unit,
                             BigDecimal quantity, LocalDateTime when) {
        UsageRecord r = new UsageRecord();
        r.setLineId(s.getLineId());
        r.setBillingCycleId(s.getBillingCycleId());
        r.setUsageType(type);
        r.setUnit(unit);
        r.setQuantity(quantity);
        r.setUsageDate(when);
        recordRepository.save(r);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static BigDecimal clamp(BigDecimal value, BigDecimal max) {
        return value.compareTo(max) > 0 ? max : value;
    }
}
