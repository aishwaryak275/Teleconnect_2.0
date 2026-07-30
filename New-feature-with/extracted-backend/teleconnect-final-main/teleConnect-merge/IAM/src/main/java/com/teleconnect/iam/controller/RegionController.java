package com.teleconnect.iam.controller;

import com.teleconnect.iam.dto.request.RegionRequest;
import com.teleconnect.iam.entity.Region;
import com.teleconnect.iam.service.RegionService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Region reference-data catalog (Admin Console "user and region management" —
 * see requirements §7). Regions back the RegionID dropdown used when
 * registering subscribers/staff, replacing the free-text numeric field.
 */
@Slf4j
@RestController
@RequestMapping("/teleConnect/iam/api/regions")
public class RegionController {

    private final RegionService regionService;

    public RegionController(RegionService regionService) {
        this.regionService = regionService;
    }

    @PostMapping
    @PreAuthorize("hasAuthority('CREATE_USER')")
    public ResponseEntity<Region> createRegion(@Valid @RequestBody RegionRequest req) {
        log.info("Create region request name={}", req.getName());
        Region region = regionService.createRegion(req);
        return ResponseEntity.status(201).body(region);
    }

    // Broadly readable — any authenticated staff needs this list to populate a
    // RegionID dropdown (e.g. the register-subscriber form used by CS/Admin).
    @GetMapping
    public ResponseEntity<List<Region>> getAllRegions() {
        log.debug("Fetching all regions");
        return ResponseEntity.ok(regionService.getAllRegions());
    }

    @PutMapping("/{regionId}/status")
    @PreAuthorize("hasAuthority('DELETE_USER')")
    public ResponseEntity<Region> updateStatus(@PathVariable Integer regionId, @RequestBody RegionRequest req) {
        log.info("Update region status request regionId={} status={}", regionId, req.getStatus());
        Region region = regionService.updateStatus(regionId, req.getStatus());
        return ResponseEntity.ok(region);
    }
}
