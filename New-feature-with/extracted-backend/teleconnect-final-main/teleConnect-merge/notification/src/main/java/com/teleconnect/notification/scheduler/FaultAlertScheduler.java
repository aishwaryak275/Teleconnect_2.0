package com.teleconnect.notification.scheduler;

import com.teleconnect.notification.client.FaultStatsClient;
import com.teleconnect.notification.client.SubscriberDirectoryClient;
import com.teleconnect.notification.client.dto.FaultTicketDto;
import com.teleconnect.notification.entity.enums.NotificationCategory;
import com.teleconnect.notification.service.NotificationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Runs hourly (cross-service HTTP to Fault-service's own database, teleconnect_fault).
 * Covers the two remaining §4.8 alert types for operations teams:
 *   - Fault ticket updates: the assigned engineer is notified when their ticket
 *     is resolved or escalated.
 *   - SLA breach alerts: when a ticket has been auto-escalated (Fault-service's
 *     own SlaEscalationScheduler flips status to Escalated once past dueDate),
 *     notify the assigned engineer, or the account owner if unassigned.
 */
@Slf4j
@Component
public class FaultAlertScheduler {

    @Autowired
    private NotificationService notificationService;
    @Autowired
    private FaultStatsClient faultStatsClient;
    @Autowired
    private SubscriberDirectoryClient directoryClient;

    @Scheduled(cron = "${app.scheduler.fault-alert.cron:0 0 * * * *}")
    public void checkFaultTicketAlerts() {
        var tickets = faultStatsClient.getAllTickets();
        if (tickets.isEmpty()) return;

        Map<Integer, Long> accountToUserId = directoryClient.loadAccountToUserIdMap();
        int alerted = 0;

        for (FaultTicketDto t : tickets) {
            if ("E".equals(t.getStatus())) {
                // SLA breach — prefer notifying the assigned engineer; fall back to the account owner.
                Long userId = t.getAssignedToId() != null ? Long.valueOf(t.getAssignedToId())
                        : (t.getAccountId() != null ? accountToUserId.get(t.getAccountId()) : null);
                if (userId != null) {
                    String message = "SLA BREACH: Fault ticket #" + t.getTicketId() + " (" + t.getFaultType() +
                            ", priority " + t.getPriority() + ") is past its SLA deadline and has been escalated.";
                    notificationService.createIfNew(userId, message, NotificationCategory.FAULT);
                    alerted++;
                }
            } else if ("R".equals(t.getStatus()) && t.getAccountId() != null) {
                // Fault ticket update — let the subscriber know their issue was resolved.
                Long userId = accountToUserId.get(t.getAccountId());
                if (userId != null) {
                    String message = "Your fault ticket #" + t.getTicketId() + " (" + t.getFaultType() + ") has been resolved.";
                    notificationService.createIfNew(userId, message, NotificationCategory.FAULT);
                    alerted++;
                }
            }
        }
        if (alerted > 0) log.info("[FaultAlertScheduler] {} fault/SLA alert(s) created", alerted);
    }
}
