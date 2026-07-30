package com.teleconnect.billing_service.controller;

import com.teleconnect.billing_service.entity.SystemConfig;
import com.teleconnect.billing_service.service.SystemConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Tariff / late-fee / provisioning configuration — read by the Admin Console's
 * "Global Tariff & SLA Configuration" screen and the Billing Dashboard's
 * late-fee setting; both write to the same single row.
 */
@Slf4j
@RestController
@RequestMapping("/billing/config")
public class SystemConfigController {

    private final SystemConfigService service;

    public SystemConfigController(SystemConfigService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('VIEW_INVOICE', 'MANAGE_PLANS')")
    public ResponseEntity<SystemConfig> getConfig() {
        return ResponseEntity.ok(service.getConfig());
    }

    @PutMapping
    @PreAuthorize("hasAnyAuthority('EDIT_INVOICE', 'MANAGE_PLANS')")
    public ResponseEntity<SystemConfig> updateConfig(@RequestBody Map<String, Object> updates) {
        log.info("Update system config request keys={}", updates.keySet());
        return ResponseEntity.ok(service.updateConfig(updates));
    }
}
