package com.teleconnect.fault.scheduler;

import com.teleconnect.common.audit.AuditAction;
import com.teleconnect.common.audit.AuditClient;
import com.teleconnect.common.audit.AuditModule;
import com.teleconnect.fault.dto.response.FaultTicketResponse;
import com.teleconnect.fault.service.FaultTicketService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Hourly SLA sweep — escalates any fault ticket still Open/InProgress past its
 * dueDate (see {@link com.teleconnect.fault.entity.FaultTicket.Priority#slaDays()}).
 * One best-effort audit record is written per escalated ticket.
 */
@Slf4j
@Component
public class SlaEscalationScheduler {

    @Autowired
    private FaultTicketService ticketService;

    @Autowired
    private AuditClient auditClient;

    @Scheduled(cron = "${app.scheduler.sla-escalation.cron:0 0 * * * *}")
    public void escalateOverdueTickets() {
        List<FaultTicketResponse> escalated = ticketService.escalateOverdueTickets();
        for (FaultTicketResponse t : escalated) {
            log.info("SLA breach: ticketId={} accountId={} priority={} dueDate={} -> Escalated",
                    t.getTicketId(), t.getAccountId(), t.getPriority(), t.getDueDate());
            auditClient.record(AuditAction.ESCALATE_FAULT_TICKET, AuditModule.FAULT, "system", null);
        }
    }
}
