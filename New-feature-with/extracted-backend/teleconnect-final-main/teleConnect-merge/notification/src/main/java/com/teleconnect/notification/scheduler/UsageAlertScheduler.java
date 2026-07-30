package com.teleconnect.notification.scheduler;

import com.teleconnect.notification.client.SubscriberDirectoryClient;
import com.teleconnect.notification.client.UsageStatsClient;
import com.teleconnect.notification.client.dto.UsageSummaryDto;
import com.teleconnect.notification.entity.enums.NotificationCategory;
import com.teleconnect.notification.service.NotificationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Polls Usage's summaries every hour (cross-service HTTP — Usage has its own
 * database, teleconnect_usage) and fires a USAGE alert once a subscriber has
 * consumed &gt;= WARNING_THRESHOLD of any quota (data/voice/SMS), matching the
 * same used/(used+remaining) approximation Usage's own getThresholdAlerts uses
 * when no external plan-limit is supplied.
 */
@Slf4j
@Component
public class UsageAlertScheduler {

    @Autowired
    private NotificationService notificationService;
    @Autowired
    private UsageStatsClient usageStatsClient;
    @Autowired
    private SubscriberDirectoryClient directoryClient;

    @Value("${app.scheduler.usage-alert.cron:0 0 * * * *}")
    private String cron;

    private static final double WARNING_THRESHOLD = 80.0;
    private static final double CRITICAL_THRESHOLD = 90.0;

    @Scheduled(cron = "${app.scheduler.usage-alert.cron:0 0 * * * *}")
    public void checkDataUsageThresholds() {
        List<UsageSummaryDto> summaries = usageStatsClient.getAllSummaries();
        if (summaries.isEmpty()) return;

        Map<Integer, Long> accountToUserId = directoryClient.loadAccountToUserIdMap();
        Map<Integer, Integer> lineToAccountCache = new HashMap<>();
        int alerted = 0;

        for (UsageSummaryDto s : summaries) {
            if (s.getLineId() == null) continue;
            double dataPct = pct(s.getDataUsedMb(), s.getDataRemainingMb());
            double voicePct = pct(s.getVoiceUsedMin(), s.getVoiceRemainingMin());
            double smsPct = pct(BigDecimal.valueOf(nz(s.getSmsUsed())), BigDecimal.valueOf(nz(s.getSmsRemaining())));
            double maxPct = Math.max(dataPct, Math.max(voicePct, smsPct));
            if (maxPct < WARNING_THRESHOLD) continue;

            Integer lineId = s.getLineId().intValue();
            Integer accountId = lineToAccountCache.computeIfAbsent(lineId, directoryClient::resolveAccountIdForLine);
            Long userId = accountId != null ? accountToUserId.get(accountId) : null;
            if (userId == null) continue;

            String level = maxPct >= CRITICAL_THRESHOLD ? "CRITICAL" : "WARNING";
            String metric = maxPct == dataPct ? "data" : (maxPct == voicePct ? "voice" : "SMS");
            String message = String.format("%s: You have used %.0f%% of your %s allowance this cycle.", level, maxPct, metric);
            notificationService.createIfNew(userId, message, NotificationCategory.USAGE);
            alerted++;
        }
        if (alerted > 0) log.info("[UsageAlertScheduler] {} usage threshold alert(s) created", alerted);
    }

    private double pct(BigDecimal used, BigDecimal remaining) {
        double u = used == null ? 0 : used.doubleValue();
        double r = remaining == null ? 0 : remaining.doubleValue();
        double total = u + r;
        return total <= 0 ? 0 : (u / total) * 100.0;
    }

    private int nz(Integer v) {
        return v == null ? 0 : v;
    }
}
