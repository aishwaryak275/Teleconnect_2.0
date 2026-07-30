package com.teleconnect.notification.client.dto;

import lombok.Data;
import java.util.List;

/** Mirrors Subscriber's AccountListResponseDTO envelope. */
@Data
public class AccountListDto {
    private List<AccountDto> subscribers;
    private Integer totalCount;
}
