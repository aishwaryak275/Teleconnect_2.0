package com.teleconnect.analytics_service.controller;

import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PostConstruct;

import com.teleconnect.analytics_service.dto.response.*;
import com.teleconnect.analytics_service.service.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@Slf4j
@RestController
@RequestMapping("/api/reports")
public class AnalyticsController {

    private final ARPUService arpuService;
    private final ChurnService churnService;
    private final NetworkUtilisationService networkUtilisationService;
    private final SLAComplianceService slaComplianceService;
    private final CollectionEfficiencyService collectionEfficiencyService;
    private final SubscriberGrowthService subscriberGrowthService;

    public AnalyticsController(ARPUService arpuService,
                               ChurnService churnService,
                               NetworkUtilisationService networkUtilisationService,
                               SLAComplianceService slaComplianceService,
                               CollectionEfficiencyService collectionEfficiencyService,
                               SubscriberGrowthService subscriberGrowthService) {
        this.arpuService = arpuService;
        this.churnService = churnService;
        this.networkUtilisationService = networkUtilisationService;
        this.slaComplianceService = slaComplianceService;
        this.collectionEfficiencyService = collectionEfficiencyService;
        this.subscriberGrowthService = subscriberGrowthService;
    }

    @PostConstruct
    public void init() {
        log.info("Initialized AnalyticsController");
    }

    
    @GetMapping("/arpu")
    public ResponseEntity<ApiResponse<ARPUReportResponse>> getARPU(
            @RequestParam Long cycleId,
            @RequestParam(required = false, defaultValue = "PERIOD") String scope,
            @RequestParam(required = false, defaultValue = "ALL") String scopeValue) {
        log.info("Fetching ARPU for cycleId={} scope={} scopeValue={}", cycleId, scope, scopeValue);
        ARPUReportResponse result = arpuService.computeARPU(cycleId, scope, scopeValue);
        log.info("ARPU computed for cycleId={}", cycleId);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

   
    @GetMapping("/churn")
    public ResponseEntity<ApiResponse<ChurnReportResponse>> getChurn(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodEnd,
            @RequestParam(required = false) String region) {
        log.info("Fetching churn for periodStart={} periodEnd={} region={}", periodStart, periodEnd, region);
        ChurnReportResponse result = churnService.computeChurn(periodStart, periodEnd, region);
        log.info("Churn computed for periodStart={} periodEnd={}", periodStart, periodEnd);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

   
    @GetMapping("/network-utilisation")
    public ResponseEntity<ApiResponse<NetworkUtilisationResponse>> getNetworkUtilisation(
            @RequestParam Long cycleId,
            @RequestParam(required = false) String region) {
        log.info("Fetching network utilisation for cycleId={} region={}", cycleId, region);
        NetworkUtilisationResponse result = networkUtilisationService.computeUtilisation(cycleId, region);
        log.info("Network utilisation computed for cycleId={}", cycleId);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    
    @GetMapping("/sla-compliance")
    public ResponseEntity<ApiResponse<SLAComplianceResponse>> getSLACompliance(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodEnd) {
        log.info("Fetching SLA compliance for periodStart={} periodEnd={}", periodStart, periodEnd);
        SLAComplianceResponse result = slaComplianceService.computeSLACompliance(periodStart, periodEnd);
        log.info("SLA compliance computed for periodStart={} periodEnd={}", periodStart, periodEnd);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    
    @GetMapping("/collection-efficiency")
    public ResponseEntity<ApiResponse<CollectionEfficiencyResponse>> getCollectionEfficiency(
            @RequestParam Long cycleId) {
        log.info("Fetching collection efficiency for cycleId={}", cycleId);
        CollectionEfficiencyResponse result = collectionEfficiencyService.computeCollectionEfficiency(cycleId);
        log.info("Collection efficiency computed for cycleId={}", cycleId);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    
    @GetMapping("/subscriber-growth")
    public ResponseEntity<ApiResponse<SubscriberGrowthResponse>> getSubscriberGrowth(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodEnd) {
        log.info("Fetching subscriber growth for periodStart={} periodEnd={}", periodStart, periodEnd);
        SubscriberGrowthResponse result = subscriberGrowthService.computeGrowth(periodStart, periodEnd);
        log.info("Subscriber growth computed for periodStart={} periodEnd={}", periodStart, periodEnd);
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
