package com.teleconnect.notification.client.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Mirrors only the fields the Notification module needs from Billing's InvoiceResponse. */
@Data
public class InvoiceDto {
    private Long invoiceId;
    private Long accountId;
    private BigDecimal totalAmount;
    private LocalDate dueDate;
    private String status;
}
