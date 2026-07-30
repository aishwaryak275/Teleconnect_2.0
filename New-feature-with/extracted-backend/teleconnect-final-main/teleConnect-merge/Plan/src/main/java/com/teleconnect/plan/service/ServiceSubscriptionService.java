package com.teleconnect.plan.service;

import lombok.extern.slf4j.Slf4j;

import com.teleconnect.plan.dto.request.AddOnAttachRequest;
import com.teleconnect.plan.dto.request.PlanChangeRequest;
import com.teleconnect.plan.dto.request.ServiceSubscriptionRequest;
import com.teleconnect.plan.dto.response.ServiceSubscriptionResponse;
import com.teleconnect.plan.entity.AddOn;
import com.teleconnect.plan.entity.ServiceSubscription;
import com.teleconnect.plan.entity.TelecomPlan;
import com.teleconnect.plan.repository.AddOnRepository;
import com.teleconnect.plan.repository.ServiceSubscriptionRepository;
import com.teleconnect.plan.repository.TelecomPlanRepository;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ServiceSubscriptionService {

    private final ServiceSubscriptionRepository repository;
    private final TelecomPlanRepository planRepository;
    private final AddOnRepository addOnRepository;

    public ServiceSubscriptionService(ServiceSubscriptionRepository repository, TelecomPlanRepository planRepository,
            AddOnRepository addOnRepository) {
        this.repository = repository;
        this.planRepository = planRepository;
        this.addOnRepository = addOnRepository;
    }

    private ServiceSubscriptionResponse toDTO(ServiceSubscription s) {
        ServiceSubscriptionResponse dto = new ServiceSubscriptionResponse();
        dto.setSubscriptionId(s.getSubscriptionId());
        dto.setLineId(s.getLineId());
        dto.setPlanId(s.getPlanId());
        dto.setAddOnId(s.getAddOnId());
        dto.setActivationDate(s.getActivationDate());
        dto.setExpiryDate(s.getExpiryDate());
        dto.setRenewalType(s.getRenewalType().name());
        dto.setStatus(s.getStatus().name());
        return dto;
    }

    public String validate(ServiceSubscriptionRequest req) {
        log.debug("Validating subscription request planId={} lineId={}", req.getPlanId(), req.getLineId());
        if (req.getLineId() == null)
            return "lineId is required";
        if (req.getPlanId() == null)
            return "planId is required";
        if (req.getActivationDate() == null)
            return "activationDate is required";
        if (req.getExpiryDate() == null)
            return "expiryDate is required";
        if (req.getExpiryDate() != null
                && req.getActivationDate() != null
                && !req.getExpiryDate().isAfter(req.getActivationDate()))
            return "expiryDate must be after activationDate";
        if (req.getRenewalType() == null)
            return "renewalType must be AutoRenew or Manual";
        TelecomPlan plan = planRepository
            .findById(req.getPlanId()).orElse(null);
        if (plan == null) {
            log.warn("Plan not found during subscription validation planId={}", req.getPlanId());
            return "Plan with planId " + req.getPlanId() + " not found";
        }
        return null;
    }

    public void createSubscription(ServiceSubscriptionRequest req) {
        log.info("Create subscription request received lineId={} planId={}", req.getLineId(), req.getPlanId());
        if (req.getLineId() != null && repository.existsByLineIdAndStatus(req.getLineId(), ServiceSubscription.Status.A)) {
            log.warn("Duplicate active subscription blocked lineId={}", req.getLineId());
            throw new RuntimeException("An active subscription already exists for this SIM line. It must expire before activating a new plan.");
        }
        ServiceSubscription sub = new ServiceSubscription();
        sub.setLineId(req.getLineId());
        sub.setPlanId(req.getPlanId());
        sub.setAddOnId(req.getAddOnId());
        sub.setActivationDate(req.getActivationDate());
        sub.setExpiryDate(req.getExpiryDate());
        sub.setRenewalType(
            ServiceSubscription.RenewalType.valueOf(req.getRenewalType()));
        sub.setStatus(ServiceSubscription.Status.A);
        repository.save(sub);
        log.info("Subscription created successfully lineId={} subscriptionId={}", req.getLineId(), sub.getSubscriptionId());
    }

    public List<ServiceSubscriptionResponse> getAllSubscriptions() {
        log.debug("Fetching all subscriptions");
        List<ServiceSubscriptionResponse> res = repository.findAll()
            .stream().map(this::toDTO)
            .collect(Collectors.toList());
        log.debug("Retrieved {} subscriptions", res.size());
        return res;
    }

    public ServiceSubscriptionResponse getById(Integer subscriptionId) {
        log.debug("Fetching subscription by id={}", subscriptionId);
        ServiceSubscription sub = repository
            .findById(subscriptionId).orElse(null);
        if (sub == null) {
            log.warn("Subscription not found id={}", subscriptionId);
            return null;
        }
        return toDTO(sub);
    }

    public boolean updateSubscription(Integer subscriptionId,
            ServiceSubscriptionRequest req) {
        log.info("Update subscription requested id={}", subscriptionId);
        ServiceSubscription existing = repository
            .findById(subscriptionId).orElse(null);
        if (existing == null) return false;
        if (req.getAddOnId() != null)
            existing.setAddOnId(req.getAddOnId());
        if (req.getRenewalType() != null)
            existing.setRenewalType(ServiceSubscription.RenewalType
                .valueOf(req.getRenewalType()));
        if (req.getStatus() != null)
        existing.setStatus(ServiceSubscription.Status
            .valueOf(req.getStatus()));
        repository.save(existing);
        log.info("Subscription updated successfully id={}", subscriptionId);
        return true;
    }

    /**
     * Upgrade or downgrade a subscription to a different plan. Only an Active
     * subscription can change plans. Switching plans restarts the entitlement
     * window: activationDate resets to today and expiryDate is recomputed from
     * the new plan's validityDays, mirroring how a fresh activation behaves.
     * Returns an error message, or {@code null} on success.
     */
    public String changePlan(Integer subscriptionId, PlanChangeRequest req) {
        log.info("Change plan requested subscriptionId={} newPlanId={}", subscriptionId, req.getNewPlanId());
        if (req.getNewPlanId() == null) return "newPlanId is required";
        ServiceSubscription existing = repository.findById(subscriptionId).orElse(null);
        if (existing == null) return "Subscription with subscriptionId " + subscriptionId + " not found";
        if (existing.getStatus() != ServiceSubscription.Status.A)
            return "Only an Active subscription can change plans";
        TelecomPlan newPlan = planRepository.findById(req.getNewPlanId()).orElse(null);
        if (newPlan == null) return "Plan with planId " + req.getNewPlanId() + " not found";
        if (newPlan.getStatus() != TelecomPlan.PlanStatus.A) return "Plan with planId " + req.getNewPlanId() + " is not active";
        if (newPlan.getPlanId().equals(existing.getPlanId())) return "Subscription is already on this plan";

        existing.setPlanId(newPlan.getPlanId());
        existing.setActivationDate(LocalDate.now());
        existing.setExpiryDate(LocalDate.now().plusDays(newPlan.getValidityDays() != null ? newPlan.getValidityDays() : 28));
        repository.save(existing);
        log.info("Subscription plan changed subscriptionId={} newPlanId={}", subscriptionId, newPlan.getPlanId());
        return null;
    }

    /**
     * Attach an existing, Active add-on to a subscription. A subscription
     * carries a single addOnId, so this replaces any previously attached add-on.
     * Returns an error message, or {@code null} on success.
     */
    public String attachAddOn(Integer subscriptionId, AddOnAttachRequest req) {
        log.info("Attach add-on requested subscriptionId={} addOnId={}", subscriptionId, req.getAddOnId());
        if (req.getAddOnId() == null) return "addOnId is required";
        ServiceSubscription existing = repository.findById(subscriptionId).orElse(null);
        if (existing == null) return "Subscription with subscriptionId " + subscriptionId + " not found";
        if (existing.getStatus() != ServiceSubscription.Status.A)
            return "Only an Active subscription can have an add-on attached";
        AddOn addOn = addOnRepository.findById(req.getAddOnId()).orElse(null);
        if (addOn == null) return "AddOn with addOnId " + req.getAddOnId() + " not found";
        if (addOn.getStatus() != AddOn.AddOnStatus.A) return "AddOn with addOnId " + req.getAddOnId() + " is not active";

        existing.setAddOnId(addOn.getAddOnId());
        repository.save(existing);
        log.info("Add-on attached subscriptionId={} addOnId={}", subscriptionId, addOn.getAddOnId());
        return null;
    }
}