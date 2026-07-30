package com.teleconnect.notification.client.dto;

import lombok.Data;

/** Mirrors only the fields the Notification module needs from Subscriber's AccountResponseDTO. */
@Data
public class AccountDto {
    private Integer accountId;
    private Long subscriberId;
}
