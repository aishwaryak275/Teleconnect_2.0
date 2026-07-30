package com.teleconnect.fault.dto.response;

import lombok.Data;
import java.time.LocalDate;

@Data
public class FaultTicketResponse {
    private Integer ticketId;
    private Integer accountId;
    private Integer lineId;
    private String faultType;
    private String description;
    private String priority;
    private LocalDate raisedDate;
    private LocalDate resolvedDate;
    private LocalDate dueDate;
    private boolean slaBreached;
    private Integer assignedToId;
    private String status;
}
