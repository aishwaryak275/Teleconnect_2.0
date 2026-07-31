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

    @Column(name = "dueDate", nullable = true)
    private LocalDate dueDate;

    // nullable — only populated when status changes to R (Resolved)
    @Column(name = "resolvedDate", nullable = true)
    private LocalDate resolvedDate;

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
        L(7), M(3), H(1), C(0);
        // L=Low (7 days)  M=Medium (3 days)  H=High (1 day)  C=Critical (0 days)
        private final int slaDays;
        Priority(int slaDays) {
            this.slaDays = slaDays;
        }
        public int slaDays() {
            return slaDays;
        }
    }

    public enum TicketStatus {
        O, P, R, C, E
        // O=Open  P=InProgress  R=Resolved  C=Closed  E=Escalated
    }
}
