package com.teleconnect.iam.service;

import com.teleconnect.iam.dto.request.RegionRequest;
import com.teleconnect.iam.entity.Region;
import com.teleconnect.iam.repository.RegionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
public class RegionService {

    private final RegionRepository repository;

    public RegionService(RegionRepository repository) {
        this.repository = repository;
    }

    public Region createRegion(RegionRequest req) {
        log.info("Create region requested name={}", req.getName());
        if (repository.findByNameIgnoreCase(req.getName()).isPresent()) {
            throw new IllegalArgumentException("A region named '" + req.getName() + "' already exists");
        }
        Region region = new Region();
        region.setName(req.getName());
        region.setStatus(Region.RegionStatus.Active);
        Region saved = repository.save(region);
        log.info("Region created regionId={} name={}", saved.getRegionId(), saved.getName());
        return saved;
    }

    public List<Region> getAllRegions() {
        return repository.findAll();
    }

    public Region updateStatus(Integer regionId, String status) {
        log.info("Update region status requested regionId={} status={}", regionId, status);
        Region region = repository.findById(regionId)
                .orElseThrow(() -> new IllegalArgumentException("Region with regionId " + regionId + " not found"));
        try {
            region.setStatus(Region.RegionStatus.valueOf(status));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("status must be Active or Inactive");
        }
        Region saved = repository.save(region);
        log.info("Region status updated regionId={} status={}", regionId, saved.getStatus());
        return saved;
    }
}
