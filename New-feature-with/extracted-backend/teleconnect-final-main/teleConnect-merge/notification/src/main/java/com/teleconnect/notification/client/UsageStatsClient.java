package com.teleconnect.notification.client;

import com.teleconnect.notification.client.dto.UsageSummaryDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class UsageStatsClient extends AbstractServiceClient {

    @Value("${teleconnect.modules.usage.base-url:http://localhost:8084}")
    private String baseUrl;

    public List<UsageSummaryDto> getAllSummaries() {
        return getOrElse(baseUrl + "/teleConnect/usage/allSummaries", "USAGE_ANALYTICS",
                new ParameterizedTypeReference<List<UsageSummaryDto>>() {}, List.of());
    }
}
