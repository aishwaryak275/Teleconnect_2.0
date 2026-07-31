package com.teleconnect.billing_service.controller;

import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PostConstruct;

import com.teleconnect.billing_service.dto.request.BillingCycleRequest;
import com.teleconnect.billing_service.dto.request.CycleGenerationRequest;
import com.teleconnect.billing_service.dto.response.BillingCycleResponse;
import com.teleconnect.billing_service.dto.response.MessageResponse;
import com.teleconnect.billing_service.enums.BillingCycleStatus;
import com.teleconnect.billing_service.service.BillingCycleService;
import com.teleconnect.common.audit.AuditAction;
import com.teleconnect.common.audit.AuditModule;
import com.teleconnect.common.audit.AuditClient;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/billing/cycles")
public class BillingCycleController {

    private final BillingCycleService billingCycleService;
    private final AuditClient auditClient;

    public BillingCycleController(BillingCycleService billingCycleService, AuditClient auditClient) {
        this.billingCycleService = billingCycleService;
        this.auditClient = auditClient;
    }

    @PostConstruct
    public void init() {
        log.info("Initialized BillingCycleController");
    }

    /**
     * POST /teleConnect/billing/cycles
     * Creates a new billing cycle for an account.
     */
    // PAY_BILL is allowed so a subscriber purchasing a plan can open the billing
    // cycle for their own account (self-service checkout); billing staff use BILLING_CYCLE.
    @PostMapping
    @PreAuthorize("hasAnyAuthority('BILLING_CYCLE','PAY_BILL')")
    public ResponseEntity<BillingCycleResponse> createBillingCycle(
            @Valid @RequestBody BillingCycleRequest request,
            HttpServletRequest httpReq) {
        BillingCycleResponse result = billingCycleService.createBillingCycle(request);
        auditClient.record(AuditAction.CREATE_BILLING_CYCLE, AuditModule.BILLING, httpReq);
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    /**
     * POST /teleConnect/billing/cycles/generate
     * Triggers batch invoice generation for all eligible open cycles.
     * NOTE: Must be declared before /{cycleId} to avoid path conflict.
     */
    @PostMapping("/generate")
    @PreAuthorize("hasAuthority('BILLING_CYCLE')")
    public ResponseEntity<MessageResponse> generateInvoices(
            @Valid @RequestBody CycleGenerationRequest request,
            HttpServletRequest httpReq) {
        billingCycleService.generateInvoicesBatch(request);
        auditClient.record(AuditAction.GENERATE_INVOICES, AuditModule.BILLING, httpReq);
        return ResponseEntity.ok(new MessageResponse("Invoice generation completed successfully"));
    }

    /**
     * GET /teleConnect/billing/cycles/account/{accountId}
     * Returns a paginated list of billing cycles for a subscriber account.
     * NOTE: Must be declared before /{cycleId} to avoid "account" being parsed as Long.
     */
    @GetMapping("/account/{accountId}")
    @PreAuthorize("hasAnyAuthority('BILLING_CYCLE','VIEW_INVOICE')")
    public ResponseEntity<List<BillingCycleResponse>> getCyclesByAccount(
            @PathVariable Long accountId,
            @RequestParam(required = false) BillingCycleStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "5") int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<BillingCycleResponse> data = billingCycleService.getCyclesByAccount(accountId, status, pageable);
        return ResponseEntity.ok(data.getContent());
    }

    /**
     * PUT /teleConnect/billing/cycles/{cycleId}/close
     * Manually closes a billing cycle. Irreversible.
     * NOTE: Must be declared before /{cycleId} GET to avoid conflict.
     */
    @PutMapping("/{cycleId}/close")
    @PreAuthorize("hasAuthority('BILLING_CYCLE')")
    public ResponseEntity<MessageResponse> closeCycle(@PathVariable Long cycleId,
            HttpServletRequest httpReq) {
        billingCycleService.closeBillingCycle(cycleId);
        auditClient.record(AuditAction.CLOSE_BILLING_CYCLE, AuditModule.BILLING, httpReq);
        return ResponseEntity.ok(new MessageResponse("Billing cycle closed successfully"));
    }

    /**
     * PUT /teleConnect/billing/cycles/{cycleId}/status
     * Updates the status of a billing cycle.
     */
    @PutMapping("/{cycleId}/status")
    @PreAuthorize("hasAuthority('BILLING_CYCLE')")
    public ResponseEntity<BillingCycleResponse> updateStatus(
            @PathVariable Long cycleId,
            @RequestParam BillingCycleStatus status,
            HttpServletRequest httpReq) {
        BillingCycleResponse result = billingCycleService.updateCycleStatus(cycleId, status);
        auditClient.record(AuditAction.UPDATE_BILLING_CYCLE_STATUS, AuditModule.BILLING, httpReq);
        return ResponseEntity.ok(result);
    }

    /**
     * GET /teleConnect/billing/cycles/{cycleId}
     * Returns full details of one billing cycle by its ID.
     * NOTE: Declared last — only matches numeric IDs.
     */
    @GetMapping("/{cycleId}")
    @PreAuthorize("hasAuthority('BILLING_CYCLE')")
    public ResponseEntity<BillingCycleResponse> getBillingCycle(@PathVariable Long cycleId) {
        return ResponseEntity.ok(billingCycleService.getBillingCycleById(cycleId));
    }
}
