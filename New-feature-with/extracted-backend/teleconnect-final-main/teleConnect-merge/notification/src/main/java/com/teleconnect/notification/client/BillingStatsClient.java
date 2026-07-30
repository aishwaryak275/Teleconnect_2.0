package com.teleconnect.notification.client;

import com.teleconnect.notification.client.dto.InvoiceDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class BillingStatsClient extends AbstractServiceClient {

    @Value("${teleconnect.modules.billing.base-url:http://localhost:8085}")
    private String baseUrl;

    public List<InvoiceDto> getAllInvoices() {
        return getOrElse(baseUrl + "/teleConnect/billing/invoices", "VIEW_INVOICE",
                new ParameterizedTypeReference<List<InvoiceDto>>() {}, List.of());
    }
}
