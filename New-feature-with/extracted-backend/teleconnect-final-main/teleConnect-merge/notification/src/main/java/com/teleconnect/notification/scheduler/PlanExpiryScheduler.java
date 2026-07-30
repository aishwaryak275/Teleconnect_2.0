package com.teleconnect.notification.scheduler;

import com.teleconnect.notification.client.PlanStatsClient;
import com.teleconnect.notification.client.SubscriberDirectoryClient;
import com.teleconnect.notification.client.dto.SubscriptionDto;
import com.teleconnect.notification.entity.enums.NotificationCategory;
import com.teleconnect.notification.service.NotificationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Map;

/**
 * Runs daily at 08:00. Sends a PLAN expiry reminder when a ServiceSubscription
 * (cross-service HTTP to Plan's own database, teleconnect_plan) expires in
 * {@code app.notification.plan-expiry-reminder-days} days (default 3).
 */
@Slf4j
@Component
public class PlanExpiryScheduler {

    @Autowired
    private NotificationService notificationService;
    @Autowired
    private PlanStatsClient planStatsClient;
    @Autowired
    private SubscriberDirectoryClient directoryClient;

    @Value("${app.notification.plan-expiry-reminder-days:3}")
    private int reminderDays;

    @Scheduled(cron = "${app.scheduler.plan-expiry.cron:0 0 8 * * *}")
    public void remindExpiringPlans() {
        var subscriptions = planStatsClient.getAllSubscriptions();
        if (subscriptions.isEmpty()) return;

        LocalDate targetDate = LocalDate.now().plusDays(reminderDays);
        Map<Integer, Long> accountToUserId = directoryClient.loadAccountToUserIdMap();
        int alerted = 0;

        for (SubscriptionDto sub : subscriptions) {
            if (!"A".equals(sub.getStatus())) continue; // only currently-active subscriptions
            if (sub.getExpiryDate() == null || !sub.getExpiryDate().isEqual(targetDate)) continue;
            if (sub.getLineId() == null) continue;

            Integer accountId = directoryClient.resolveAccountIdForLine(sub.getLineId());
            Long userId = accountId != null ? accountToUserId.get(accountId) : null;
            if (userId == null) continue;

            String message = "Your plan (Plan ID " + sub.getPlanId() + ") expires in " + reminderDays +
                    " days on " + sub.getExpiryDate() + ". Renew now to avoid service interruption.";
            notificationService.createIfNew(userId, message, NotificationCategory.PLAN);
            alerted++;
        }
        if (alerted > 0) log.info("[PlanExpiryScheduler] {} plan expiry reminder(s) created", alerted);
    }
}
