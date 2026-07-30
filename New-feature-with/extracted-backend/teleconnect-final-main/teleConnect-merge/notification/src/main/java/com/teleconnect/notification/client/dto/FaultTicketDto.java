package com.teleconnect.notification.client.dto;

import lombok.Data;
import java.time.LocalDate;

/** Mirrors only the fields the Notification module needs from Fault's FaultTicketResponse. */
@Data
public class FaultTicketDto {
    private Integer ticketId;
    private Integer accountId;
    private Integer lineId;
    private String faultType;
    private String priority;
    private LocalDate dueDate;
    private boolean slaBreached;
    private Integer assignedToId;
    private String status;
}
