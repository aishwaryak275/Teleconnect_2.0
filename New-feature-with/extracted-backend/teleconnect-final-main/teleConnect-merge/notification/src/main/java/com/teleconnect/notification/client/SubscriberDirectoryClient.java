package com.teleconnect.notification.client;

import com.teleconnect.notification.client.dto.AccountDto;
import com.teleconnect.notification.client.dto.AccountListDto;
import com.teleconnect.notification.client.dto.SimLineDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Resolves the identifiers other modules carry (accountId, lineId) down to the
 * IAM userId a notification should be addressed to. SubscriberAccount.subscriberId
 * *is* the IAM User.userId (accounts are created against the logged-in subscriber's
 * own userId — see AccountService.getAccountsBySubscriberId on the frontend).
 */
@Component
public class SubscriberDirectoryClient extends AbstractServiceClient {

    @Value("${teleconnect.modules.subscriber.base-url:http://localhost:8086}")
    private String baseUrl;

    /** accountId -> subscriberId (== IAM userId), for every account. One bulk call per sweep. */
    public Map<Integer, Long> loadAccountToUserIdMap() {
        AccountListDto list = getOrElse(baseUrl + "/teleConnect/api/subscribers", "VIEW_SUBSCRIBER,GET_SUB",
                new ParameterizedTypeReference<AccountListDto>() {}, null);
        Map<Integer, Long> map = new HashMap<>();
        if (list != null && list.getSubscribers() != null) {
            for (AccountDto a : list.getSubscribers()) {
                if (a.getAccountId() != null && a.getSubscriberId() != null) {
                    map.put(a.getAccountId(), a.getSubscriberId());
                }
            }
        }
        return map;
    }

    /** lineId -> accountId, for a single SIM line (usage summaries only carry lineId). */
    public Integer resolveAccountIdForLine(Integer lineId) {
        SimLineDto line = getOrElse(
                baseUrl + "/teleConnect/api/subscribers/sim-lines/lookup-by-id?lineId=" + lineId,
                "VIEW_SUBSCRIBER,GET_SUB",
                new ParameterizedTypeReference<SimLineDto>() {}, null);
        return line != null ? line.getAccountId() : null;
    }
}
