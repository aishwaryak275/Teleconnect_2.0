package com.teleconnect.fault.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;

@Entity
@Table(name = "fault_ticket")
@Data
public class FaultTicket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ticketId")
    private Integer ticketId;

    // accountId from Module 2.2 — stored as plain Integer, no @ManyToOne
    @Column(name = "accountId", nullable = false)
    private Integer accountId;

    // lineId from Module 2.2 — stored as plain Integer, no @ManyToOne
    @Column(name = "lineId", nullable = false)
    private Integer lineId;

    @Enumerated(EnumType.STRING)
    @Column(name = "faultType", nullable = false)
    private FaultType faultType;

    @Column(name = "description", nullable = false, length = 500)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false)
    private Priority priority = Priority.M;

    @Column(name = "raisedDate", nullable = false)
    private LocalDate raisedDate;

    // nullable — only populated when status changes to R (Resolved)
    @Column(name = "resolvedDate", nullable = true)
    private LocalDate resolvedDate;

    // SLA deadline — computed at creation from priority (see Priority.slaDays()).
    // Breached when status is still O/P past this date; the escalation scheduler
    // then flips status to E (Escalated).
    @Column(name = "dueDate", nullable = true)
    private LocalDate dueDate;

    // assignedToId from Module 4.1 — stored as plain Integer, no @ManyToOne; nullable until assigned
    @Column(name = "assignedToId", nullable = true)
    private Integer assignedToId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private TicketStatus status = TicketStatus.O;

    public enum FaultType {
        NoCoverage, CallDrops, SlowData, BillingIssue, Activation
    }

    public enum Priority {
        L, M, H, C;
        // L=Low  M=Medium  H=High  C=Critical

        /** SLA resolution window in days, by priority. */
        public int slaDays() {
            return switch (this) {
                case C -> 1;
                case H -> 2;
                case M -> 3;
                case L -> 5;
            };
        }
    }

    public enum TicketStatus {
        O, P, R, C, E
        // O=Open  P=InProgress  R=Resolved  C=Closed  E=Escalated
    }
}
