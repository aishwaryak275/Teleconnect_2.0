package com.teleconnect.plan.dto.request;

import lombok.Data;

/** Attach an existing add-on to a subscription. */
@Data
public class AddOnAttachRequest {
    private Integer addOnId;
}
