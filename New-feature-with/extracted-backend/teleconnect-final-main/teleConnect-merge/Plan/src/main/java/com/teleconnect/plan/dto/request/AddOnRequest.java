
package com.teleconnect.plan.dto.request;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class AddOnRequest {
    private String name;
    private String type;
    private BigDecimal quota;
    private Integer validityDays;
    private BigDecimal price;
    private String status;
}

