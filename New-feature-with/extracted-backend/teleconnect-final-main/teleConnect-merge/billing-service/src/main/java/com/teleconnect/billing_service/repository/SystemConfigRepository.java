package com.teleconnect.billing_service.repository;

import com.teleconnect.billing_service.entity.SystemConfig;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SystemConfigRepository extends JpaRepository<SystemConfig, Integer> {
}
