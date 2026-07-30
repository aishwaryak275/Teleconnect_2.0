package com.teleconnect.plan.controller;

import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PostConstruct;

import com.teleconnect.plan.dto.request.AddOnAttachRequest;
import com.teleconnect.plan.dto.request.PlanChangeRequest;
import com.teleconnect.plan.dto.request.ServiceSubscriptionRequest;
import com.teleconnect.plan.dto.response.ServiceSubscriptionResponse;
import com.teleconnect.plan.dto.response.MessageResponse;
import com.teleconnect.plan.service.ServiceSubscriptionService;
import com.teleconnect.common.audit.AuditAction;
import com.teleconnect.common.audit.AuditModule;
import com.teleconnect.common.audit.AuditClient;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/plan")
public class ServiceSubscriptionController {

    private final ServiceSubscriptionService service;
    private final AuditClient auditClient;

    public ServiceSubscriptionController(ServiceSubscriptionService service, AuditClient auditClient) {
        this.service = service;
        this.auditClient = auditClient;
    }

    @PostConstruct
    public void init() {
        log.info("Initialized ServiceSubscriptionController");
    }

    @PostMapping("/createSubscriptions")
    @PreAuthorize("hasAnyAuthority('CREATE_SUB', 'PAY_BILL', 'VIEW_OWN_PLAN', 'VIEW_PLAN')")
    public ResponseEntity<?> createSubscription(
            @RequestBody ServiceSubscriptionRequest req,
            HttpServletRequest httpReq) {
        log.info("Create subscription request lineId={} planId={}", req.getLineId(), req.getPlanId());
        String error = service.validate(req);
        if (error != null) {
            log.warn("Create subscription validation failed: {}", error);
            return ResponseEntity.status(
                error.contains("not found") ? 404 : 400)
                .body(new MessageResponse(error));
        }
        service.createSubscription(req);
        auditClient.record(AuditAction.CREATE_SUBSCRIPTION, AuditModule.PLAN, httpReq);
        log.info("Subscription created lineId={} planId={}", req.getLineId(), req.getPlanId());
        return ResponseEntity.status(201)
            .body(new MessageResponse("Subscription created successfully"));
    }

    @GetMapping("/getAllSubscriptions")
    @PreAuthorize("hasAuthority('GET_SUB')")
    public ResponseEntity<?> getAllSubscriptions() {
        log.info("Fetching all subscriptions");
        List<ServiceSubscriptionResponse> list =
            service.getAllSubscriptions();
        if (list.isEmpty()) {
            log.info("No subscriptions found");
            return ResponseEntity.status(404)
                .body(new MessageResponse("No subscriptions found"));
        }
        log.info("Retrieved {} subscriptions", list.size());
        return ResponseEntity.ok(list);
    }

    @GetMapping("/getSubscriptions/{subscriptionId}")
    @PreAuthorize("hasAuthority('GET_SUB')")
    public ResponseEntity<?> getSubscriptionById(
            @PathVariable Integer subscriptionId) {
        log.info("Fetching subscription by id={}", subscriptionId);
        ServiceSubscriptionResponse sub =
            service.getById(subscriptionId);
        if (sub == null) {
            log.warn("Subscription not found subscriptionId={}", subscriptionId);
            return ResponseEntity.status(404)
                .body(new MessageResponse(
                    "Subscription with subscriptionId "
                    + subscriptionId + " not found"));
        }
        log.debug("Subscription retrieved subscriptionId={}", subscriptionId);
        return ResponseEntity.ok(sub);
    }

    @PutMapping("/updateSubscriptions/{subscriptionId}")
    @PreAuthorize("hasAnyAuthority('CREATE_SUB', 'PAY_BILL', 'VIEW_OWN_PLAN')")
    public ResponseEntity<?> updateSubscription(
            @PathVariable Integer subscriptionId,
            @RequestBody ServiceSubscriptionRequest req,
            HttpServletRequest httpReq) {
        log.info("Update subscription request subscriptionId={}", subscriptionId);
        boolean updated =
            service.updateSubscription(subscriptionId, req);
        if (!updated) {
            log.warn("Subscription not found subscriptionId={}", subscriptionId);
            return ResponseEntity.status(404)
                .body(new MessageResponse(
                    "Subscription with subscriptionId "
                    + subscriptionId + " not found"));
        }
        auditClient.record(AuditAction.UPDATE_SUBSCRIPTION, AuditModule.PLAN, httpReq);
        log.info("Subscription updated subscriptionId={}", subscriptionId);
        return ResponseEntity.ok(
            new MessageResponse("Subscription updated successfully"));
    }

    @PutMapping("/subscriptions/{subscriptionId}/change-plan")
    @PreAuthorize("hasAnyAuthority('CREATE_SUB', 'PAY_BILL', 'VIEW_OWN_PLAN')")
    public ResponseEntity<?> changePlan(
            @PathVariable Integer subscriptionId,
            @RequestBody PlanChangeRequest req,
            HttpServletRequest httpReq) {
        log.info("Change plan request subscriptionId={} newPlanId={}", subscriptionId, req.getNewPlanId());
        String error = service.changePlan(subscriptionId, req);
        if (error != null) {
            log.warn("Change plan failed subscriptionId={}: {}", subscriptionId, error);
            return ResponseEntity.status(error.contains("not found") ? 404 : 400)
                .body(new MessageResponse(error));
        }
        auditClient.record(AuditAction.CHANGE_SUBSCRIPTION_PLAN, AuditModule.PLAN, httpReq);
        log.info("Plan changed subscriptionId={} newPlanId={}", subscriptionId, req.getNewPlanId());
        return ResponseEntity.ok(new MessageResponse("Plan changed successfully"));
    }

    @PutMapping("/subscriptions/{subscriptionId}/attach-addon")
    @PreAuthorize("hasAnyAuthority('CREATE_SUB', 'PAY_BILL', 'VIEW_OWN_PLAN')")
    public ResponseEntity<?> attachAddOn(
            @PathVariable Integer subscriptionId,
            @RequestBody AddOnAttachRequest req,
            HttpServletRequest httpReq) {
        log.info("Attach add-on request subscriptionId={} addOnId={}", subscriptionId, req.getAddOnId());
        String error = service.attachAddOn(subscriptionId, req);
        if (error != null) {
            log.warn("Attach add-on failed subscriptionId={}: {}", subscriptionId, error);
            return ResponseEntity.status(error.contains("not found") ? 404 : 400)
                .body(new MessageResponse(error));
        }
        auditClient.record(AuditAction.ATTACH_ADDON, AuditModule.PLAN, httpReq);
        log.info("Add-on attached subscriptionId={} addOnId={}", subscriptionId, req.getAddOnId());
        return ResponseEntity.ok(new MessageResponse("Add-on attached successfully"));
    }
}