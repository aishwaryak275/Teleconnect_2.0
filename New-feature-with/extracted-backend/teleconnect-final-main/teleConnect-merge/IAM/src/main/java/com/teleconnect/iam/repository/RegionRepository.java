package com.teleconnect.iam.repository;

import com.teleconnect.iam.entity.Region;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RegionRepository extends JpaRepository<Region, Integer> {
    Optional<Region> findByNameIgnoreCase(String name);
}
