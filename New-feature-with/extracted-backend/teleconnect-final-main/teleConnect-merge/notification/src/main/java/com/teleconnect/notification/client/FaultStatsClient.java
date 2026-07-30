package com.teleconnect.notification.client;

import com.teleconnect.notification.client.dto.FaultTicketDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class FaultStatsClient extends AbstractServiceClient {

    @Value("${teleconnect.modules.fault.base-url:http://localhost:8092}")
    private String baseUrl;

    public List<FaultTicketDto> getAllTickets() {
        return getOrElse(baseUrl + "/teleConnect/fault/getAllTickets", "GET_UPDATE_TICKET",
                new ParameterizedTypeReference<List<FaultTicketDto>>() {}, List.of());
    }
}
