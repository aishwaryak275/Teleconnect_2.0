package com.teleconnect.iam.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class RegionRequest {
    @NotBlank(message = "name is required")
    private String name;

    // status — only meaningful on update; ignored on create (always starts Active)
    private String status;
}
