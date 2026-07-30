package com.teleconnect.notification.client.dto;

import lombok.Data;

/** Mirrors only the fields the Notification module needs from Subscriber's SimLineResponseDTO. */
@Data
public class SimLineDto {
    private Integer lineId;
    private Integer accountId;
}
