package com.teleconnect.fault.service;

import lombok.extern.slf4j.Slf4j;

import com.teleconnect.fault.dto.request.ServiceRequestRequest;
import com.teleconnect.fault.dto.response.*;
import com.teleconnect.fault.entity.ServiceRequest;
import com.teleconnect.fault.repository.ServiceRequestRepository;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestTemplate;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ServiceRequestService {

    private final ServiceRequestRepository requestRepo;
    private final RestTemplate restTemplate;
    private final com.teleconnect.fault.security.JwtUtil jwtUtil;

    public ServiceRequestService(ServiceRequestRepository requestRepo, RestTemplate restTemplate, com.teleconnect.fault.security.JwtUtil jwtUtil) {
        this.requestRepo = requestRepo;
        this.restTemplate = restTemplate;
        this.jwtUtil = jwtUtil;
    }

    // Convert Entity to Response DTO
    private ServiceRequestResponse toDTO(ServiceRequest r) {
        ServiceRequestResponse dto = new ServiceRequestResponse();
        dto.setRequestId(r.getRequestId());
        dto.setAccountId(r.getAccountId());
        dto.setLineId(r.getLineId());
        dto.setRequestType(r.getRequestType().name());
        dto.setRequestedBy(r.getRequestedBy());
        dto.setRaisedDate(r.getRaisedDate());
        dto.setStatus(r.getStatus().name());
        dto.setPreferredAccountType(r.getPreferredAccountType());
        dto.setIdProofReference(r.getIdProofReference());
        dto.setPreferredPlanId(r.getPreferredPlanId());
        return dto;
    }

    // POST — create new service request
    public MessageResponse createRequest(ServiceRequestRequest req) {
        log.info("Create service request received accountId={} lineId={} type={}", req.getAccountId(), req.getLineId(), req.getRequestType());
        try {
            ServiceRequest.RequestType.valueOf(req.getRequestType());
        } catch (IllegalArgumentException e) {
            log.error("Invalid requestType provided: {}", req.getRequestType());
            throw new RuntimeException(
                "requestType must be PlanChange, SIMReplacement, PortingRequest, AccountUpdate, or NewConnection");
        }
        ServiceRequest sr = new ServiceRequest();
        sr.setAccountId(req.getAccountId());
        sr.setLineId(req.getLineId());
        sr.setRequestType(ServiceRequest.RequestType.valueOf(req.getRequestType()));
        sr.setRequestedBy(req.getRequestedBy());
        sr.setRaisedDate(req.getRaisedDate());
        sr.setStatus(ServiceRequest.RequestStatus.O);
        sr.setPreferredAccountType(req.getPreferredAccountType());
        sr.setIdProofReference(req.getIdProofReference());
        sr.setPreferredPlanId(req.getPreferredPlanId());
        requestRepo.save(sr);
        log.info("Service request created accountId={} lineId={}", req.getAccountId(), req.getLineId());
        return new MessageResponse("Service request created successfully");
    }

    // GET all
    public List<ServiceRequestResponse> getAllRequests() {
        log.debug("Fetching all service requests");
        List<ServiceRequestResponse> res = requestRepo.findAll().stream()
            .map(this::toDTO).collect(Collectors.toList());
        log.debug("Retrieved {} service requests", res.size());
        return res;
    }

    // GET by ID
    public ServiceRequestResponse getRequestById(Integer requestId) {
        log.debug("Fetching service request id={}", requestId);
        ServiceRequest sr = requestRepo.findById(requestId)
            .orElseThrow(() -> {
                log.warn("Service request not found id={}", requestId);
                return new RuntimeException(
                "Service request with requestId " + requestId + " not found");
            });
        return toDTO(sr);
    }

    // PUT — update status
    public MessageResponse updateRequest(Integer requestId, ServiceRequestRequest req) {
        log.info("Update service request id={}", requestId);
        ServiceRequest sr = requestRepo.findById(requestId)
                .orElseThrow(() -> {
                    log.warn("Service request not found id={}", requestId);
                    return new RuntimeException(
                        "Service request with requestId " + requestId + " not found");
                });
        if (req.getStatus() != null) {
            try {
                sr.setStatus(ServiceRequest.RequestStatus.valueOf(req.getStatus()));
            } catch (IllegalArgumentException e) {
                log.error("Invalid service request status provided: {}", req.getStatus());
                throw new RuntimeException("status must be O, P, C, or X");
            }
        }
        requestRepo.save(sr);
        log.info("Service request updated id={}", requestId);
        return new MessageResponse("Service request updated successfully");
    }

    // PUT — cancel (only when Open)
    public MessageResponse cancelRequest(Integer requestId) {
        log.info("Cancel service request id={}", requestId);
        ServiceRequest sr = requestRepo.findById(requestId)
                .orElseThrow(() -> {
                    log.warn("Service request not found id={}", requestId);
                    return new RuntimeException(
                        "Service request with requestId " + requestId + " not found");
                });
        if (sr.getStatus() != ServiceRequest.RequestStatus.O) {
            log.warn("Cannot cancel non-open request id={}", requestId);
            throw new RuntimeException("Only Open requests can be cancelled");
        }
        sr.setStatus(ServiceRequest.RequestStatus.X);
        requestRepo.save(sr);
        log.info("Service request cancelled id={}", requestId);
        return new MessageResponse("Service request cancelled successfully");
    }

    // POST — Approve New Connection request
    public MessageResponse approveConnection(Integer requestId, String authHeader) {
        log.info("Approving connection for requestId={}", requestId);
        ServiceRequest sr = requestRepo.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Service request with requestId " + requestId + " not found"));

        if (sr.getRequestType() != ServiceRequest.RequestType.NewConnection) {
            throw new RuntimeException("Request #" + requestId + " is not a NewConnection request");
        }
        if (sr.getStatus() != ServiceRequest.RequestStatus.O) {
            throw new RuntimeException("Request #" + requestId + " is not in Open status (current: " + sr.getStatus() + ")");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (authHeader != null && !authHeader.isBlank()) {
            headers.set("Authorization", authHeader);
        }

        Integer accountId = null;
        Integer lineId = null;

        try {
            // i. Subscriber-service: POST /teleConnect/api/subscribers (create account) via API gateway
            String subscriberUrl = "http://localhost:9090/teleConnect/api/subscribers";
            Map<String, Object> accountReq = new HashMap<>();
            accountReq.put("subscriberId", sr.getRequestedBy());
            accountReq.put("accountType", sr.getPreferredAccountType() != null ? sr.getPreferredAccountType() : "Prepaid");
            accountReq.put("kycStatus", "Pending");

            HttpEntity<Map<String, Object>> entity1 = new HttpEntity<>(accountReq, headers);
            Map<?, ?> accountRes = restTemplate.postForObject(subscriberUrl, entity1, Map.class);
            if (accountRes != null && accountRes.get("accountId") != null) {
                accountId = ((Number) accountRes.get("accountId")).intValue();
            } else {
                throw new RuntimeException("Failed to obtain accountId from Subscriber service creation response");
            }
            log.info("Step i completed: created accountId={}", accountId);

            // ii. Subscriber-service: PUT /teleConnect/api/subscribers/{accountId}/kyc (set Verified) via API gateway
            String kycUrl = "http://localhost:9090/teleConnect/api/subscribers/" + accountId + "/kyc";
            Map<String, Object> kycReq = new HashMap<>();
            kycReq.put("kycStatus", "Verified");
            kycReq.put("idProofReference", sr.getIdProofReference() != null ? sr.getIdProofReference() : "ID-VERIFIED");

            HttpEntity<Map<String, Object>> entity2 = new HttpEntity<>(kycReq, headers);
            restTemplate.exchange(kycUrl, HttpMethod.PUT, entity2, Map.class);
            log.info("Step ii completed: verified KYC for accountId={}", accountId);

            // iii. Subscriber-service: POST /teleConnect/api/subscribers/{accountId}/simLines
            String simUrl = "http://localhost:9090/teleConnect/api/subscribers/" + accountId + "/simLines";
            String timestamp = String.valueOf(System.currentTimeMillis());
            String msisdn = "98" + String.format("%04d", accountId) + timestamp.substring(Math.max(0, timestamp.length() - 4));
            String iccid = "8991000" + String.format("%04d", accountId) + timestamp.substring(Math.max(0, timestamp.length() - 5));

            Map<String, Object> simReq = new HashMap<>();
            simReq.put("msisdn", msisdn);
            simReq.put("iccid", iccid);
            simReq.put("serviceType", "VoiceData");

            HttpEntity<Map<String, Object>> entity3 = new HttpEntity<>(simReq, headers);
            Map<?, ?> simRes = restTemplate.postForObject(simUrl, entity3, Map.class);
            if (simRes != null && simRes.get("lineId") != null) {
                lineId = ((Number) simRes.get("lineId")).intValue();
            } else {
                throw new RuntimeException("Failed to obtain lineId from SIM Line creation response");
            }
            log.info("Step iii completed: created lineId={} (msisdn={})", lineId, msisdn);

            // iv. Plan-service: POST /plan/createSubscriptions through gateway
            String planUrl = "http://localhost:9090/teleConnect/plan/createSubscriptions";
            Map<String, Object> planReq = new HashMap<>();
            planReq.put("lineId", lineId);
            planReq.put("planId", sr.getPreferredPlanId() != null ? sr.getPreferredPlanId() : 1);
            planReq.put("activationDate", LocalDate.now().toString());
            planReq.put("expiryDate", LocalDate.now().plusDays(28).toString());
            planReq.put("renewalType", "AutoRenew");
            planReq.put("status", "Active");

            HttpEntity<Map<String, Object>> entity4 = new HttpEntity<>(planReq, headers);
            restTemplate.postForObject(planUrl, entity4, Map.class);
            log.info("Step iv completed: created subscription for lineId={} planId={}", lineId, sr.getPreferredPlanId());

        } catch (Exception e) {
            log.error("Failed mid-chain provisioning for requestId={}: {}", requestId, e.getMessage(), e);
            throw new RuntimeException("Connection approval failed during provisioning: " + e.getMessage(), e);
        }

        // On success, update ServiceRequest
        sr.setAccountId(accountId);
        sr.setLineId(lineId);
        sr.setStatus(ServiceRequest.RequestStatus.C);
        requestRepo.save(sr);
        log.info("Service request requestId={} approved & completed. accountId={} lineId={}", requestId, accountId, lineId);

// v. Notification-service: POST /teleConnect/notification/createNotification through gateway
            try {
                String notifUrl = "http://localhost:9090/teleConnect/notification/createNotification";
            Map<String, Object> notifReq = new HashMap<>();
            notifReq.put("userId", Long.valueOf(sr.getRequestedBy()));
            notifReq.put("message", "Your new connection request #" + requestId + " has been approved! Account #" + accountId + " & SIM Line #" + lineId + " are now active.");
            notifReq.put("category", "SYSTEM");

            HttpEntity<Map<String, Object>> entity5 = new HttpEntity<>(notifReq, headers);
            restTemplate.postForObject(notifUrl, entity5, Map.class);
            log.info("Notification sent to subscriber userId={}", sr.getRequestedBy());
        } catch (Exception ne) {
            log.warn("Could not send approval notification: {}", ne.getMessage());
        }

        return new MessageResponse("New connection request approved successfully. Account #" + accountId + " created.");
    }
}
