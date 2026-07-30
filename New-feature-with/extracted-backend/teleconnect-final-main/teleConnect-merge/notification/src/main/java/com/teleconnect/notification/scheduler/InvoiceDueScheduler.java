package com.teleconnect.notification.scheduler;

import com.teleconnect.notification.client.BillingStatsClient;
import com.teleconnect.notification.client.SubscriberDirectoryClient;
import com.teleconnect.notification.client.dto.InvoiceDto;
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
 * Runs daily at 09:00. Sends a BILLING payment-due reminder when an Invoice
 * (cross-service HTTP to Billing's own database, teleconnect_billing) due date is
 * {@code app.notification.invoice-due-reminder-days} days away (default 2), and
 * an OVERDUE alert for invoices whose status is already OVERDUE.
 */
@Slf4j
@Component
public class InvoiceDueScheduler {

    @Autowired
    private NotificationService notificationService;
    @Autowired
    private BillingStatsClient billingStatsClient;
    @Autowired
    private SubscriberDirectoryClient directoryClient;

    @Value("${app.notification.invoice-due-reminder-days:2}")
    private int reminderDays;

    @Scheduled(cron = "${app.scheduler.invoice-due.cron:0 0 9 * * *}")
    public void remindUpcomingInvoices() {
        var invoices = billingStatsClient.getAllInvoices();
        if (invoices.isEmpty()) return;

        LocalDate targetDate = LocalDate.now().plusDays(reminderDays);
        Map<Integer, Long> accountToUserId = directoryClient.loadAccountToUserIdMap();
        int alerted = 0;

        for (InvoiceDto inv : invoices) {
            if (inv.getAccountId() == null || inv.getDueDate() == null) continue;
            Long userId = accountToUserId.get(inv.getAccountId().intValue());
            if (userId == null) continue;

            if ("OVERDUE".equalsIgnoreCase(inv.getStatus())) {
                String message = "OVERDUE: Your invoice of ₹" + inv.getTotalAmount() +
                        " was due on " + inv.getDueDate() + ". Late fees may apply.";
                notificationService.createIfNew(userId, message, NotificationCategory.BILLING);
                alerted++;
            } else if ("SENT".equalsIgnoreCase(inv.getStatus()) && inv.getDueDate().isEqual(targetDate)) {
                String message = "Your invoice of ₹" + inv.getTotalAmount() +
                        " is due on " + inv.getDueDate() + ". Please pay to avoid late fees.";
                notificationService.createIfNew(userId, message, NotificationCategory.BILLING);
                alerted++;
            }
        }
        if (alerted > 0) log.info("[InvoiceDueScheduler] {} invoice alert(s) created", alerted);
    }
}
