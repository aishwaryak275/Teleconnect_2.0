package com.teleconnect.fault.service;

import lombok.extern.slf4j.Slf4j;

import com.teleconnect.fault.dto.request.FaultTicketRequest;
import com.teleconnect.fault.dto.response.*;
import com.teleconnect.fault.entity.FaultTicket;
import com.teleconnect.fault.repository.FaultTicketRepository;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
public class FaultTicketService {

    private final FaultTicketRepository ticketRepo;

    FaultTicketService(FaultTicketRepository ticketRepo) {
        this.ticketRepo = ticketRepo;
    }

    // Convert Entity to Response DTO
    private FaultTicketResponse toDTO(FaultTicket t) {
        FaultTicketResponse dto = new FaultTicketResponse();
        dto.setTicketId(t.getTicketId());
        dto.setAccountId(t.getAccountId());
        dto.setLineId(t.getLineId());
        dto.setFaultType(t.getFaultType().name());
        dto.setDescription(t.getDescription());
        dto.setPriority(t.getPriority().name());
        dto.setRaisedDate(t.getRaisedDate());
        dto.setResolvedDate(t.getResolvedDate());
        dto.setAssignedToId(t.getAssignedToId());
        dto.setStatus(t.getStatus().name());
        dto.setDueDate(t.getDueDate());
        boolean open = t.getStatus() == FaultTicket.TicketStatus.O || t.getStatus() == FaultTicket.TicketStatus.P;
        dto.setSlaBreached(open && t.getDueDate() != null && LocalDate.now().isAfter(t.getDueDate()));
        return dto;
    }

    // POST — create fault ticket
    public MessageResponse createTicket(FaultTicketRequest req) {
        log.info("Create fault ticket request accountId={} lineId={} type={}", req.getAccountId(), req.getLineId(), req.getFaultType());
        try {
            FaultTicket.FaultType.valueOf(req.getFaultType());
        } catch (IllegalArgumentException e) {
            log.error("Invalid faultType provided: {}", req.getFaultType());
            throw new RuntimeException(
                "faultType must be NoCoverage, CallDrops, SlowData, BillingIssue, or Activation");
        }
        FaultTicket ticket = new FaultTicket();
        ticket.setAccountId(req.getAccountId());
        ticket.setLineId(req.getLineId());
        ticket.setFaultType(FaultTicket.FaultType.valueOf(req.getFaultType()));
        ticket.setDescription(req.getDescription());
        // priority defaults to M if not provided
        if (req.getPriority() != null) {
            try {
                ticket.setPriority(FaultTicket.Priority.valueOf(req.getPriority()));
            } catch (IllegalArgumentException e) {
                throw new RuntimeException("priority must be L, M, H, or C");
            }
        } else {
            ticket.setPriority(FaultTicket.Priority.M);
        }
        ticket.setRaisedDate(req.getRaisedDate());
        ticket.setAssignedToId(req.getAssignedToId());
        ticket.setStatus(FaultTicket.TicketStatus.O);
        ticket.setDueDate(req.getRaisedDate().plusDays(ticket.getPriority().slaDays()));
        ticketRepo.save(ticket);
        log.info("Fault ticket created for accountId={} lineId={} dueDate={}", req.getAccountId(), req.getLineId(), ticket.getDueDate());
        return new MessageResponse("Fault ticket created successfully");
    }

    // GET all
    public List<FaultTicketResponse> getAllTickets() {
        log.debug("Fetching all fault tickets");
        List<FaultTicketResponse> res = ticketRepo.findAll().stream()
            .map(this::toDTO).collect(Collectors.toList());
        log.debug("Retrieved {} fault tickets", res.size());
        return res;
    }

    // GET by ID
    public FaultTicketResponse getTicketById(Integer ticketId) {
        log.debug("Fetching fault ticket id={}", ticketId);
        FaultTicket ticket = ticketRepo.findById(ticketId)
            .orElseThrow(() -> {
                log.warn("Fault ticket not found id={}", ticketId);
                return new RuntimeException(
                "Fault ticket with ticketId " + ticketId + " not found");
            });
        return toDTO(ticket);
    }

    // PUT — assign to engineer
    public MessageResponse assignTicket(Integer ticketId, FaultTicketRequest req) {
        log.info("Assign ticket requested ticketId={} assignedTo={}", ticketId, req.getAssignedToId());
        FaultTicket ticket = ticketRepo.findById(ticketId)
                .orElseThrow(() -> {
                    log.warn("Assign failed - ticket not found id={}", ticketId);
                    return new RuntimeException(
                        "Fault ticket with ticketId " + ticketId + " not found");
                });
        if (req.getAssignedToId() == null) {
            log.warn("Assign failed - assignedToId missing for ticketId={}", ticketId);
            throw new RuntimeException("assignedToId is required");
        }
        ticket.setAssignedToId(req.getAssignedToId());
        ticketRepo.save(ticket);
        log.info("Fault ticket assigned ticketId={} to {}", ticketId, req.getAssignedToId());
        return new MessageResponse("Fault ticket assigned successfully");
    }

    // PUT — update status
    public MessageResponse updateTicket(Integer ticketId, FaultTicketRequest req) {
        log.info("Update ticket requested ticketId={}", ticketId);
        FaultTicket ticket = ticketRepo.findById(ticketId)
                .orElseThrow(() -> {
                    log.warn("Update failed - ticket not found id={}", ticketId);
                    return new RuntimeException(
                        "Fault ticket with ticketId " + ticketId + " not found");
                });
        if (req.getStatus() != null) {
            try {
                ticket.setStatus(FaultTicket.TicketStatus.valueOf(req.getStatus()));
            } catch (IllegalArgumentException e) {
                log.error("Invalid ticket status provided: {}", req.getStatus());
                throw new RuntimeException("status must be O, P, R, C, or E");
            }
        }
        ticketRepo.save(ticket);
        log.info("Fault ticket updated ticketId={}", ticketId);
        return new MessageResponse("Fault ticket updated successfully");
    }

    // PUT — resolve ticket
    public MessageResponse resolveTicket(Integer ticketId, FaultTicketRequest req) {
        log.info("Resolve ticket requested ticketId={}", ticketId);
        FaultTicket ticket = ticketRepo.findById(ticketId)
                .orElseThrow(() -> {
                    log.warn("Resolve failed - ticket not found id={}", ticketId);
                    return new RuntimeException(
                        "Fault ticket with ticketId " + ticketId + " not found");
                });
        if (req.getResolvedDate() == null) {
            log.warn("Resolve failed - resolvedDate missing for ticketId={}", ticketId);
            throw new RuntimeException("resolvedDate is required");
        }
        if (req.getResolvedDate().isBefore(ticket.getRaisedDate())) {
            log.warn("Resolve failed - resolvedDate before raisedDate ticketId={}", ticketId);
            throw new RuntimeException("resolvedDate cannot be before raisedDate");
        }
        ticket.setResolvedDate(req.getResolvedDate());
        ticket.setStatus(FaultTicket.TicketStatus.R);
        ticketRepo.save(ticket);
        log.info("Fault ticket resolved ticketId={}", ticketId);
        return new MessageResponse("Fault ticket resolved successfully");
    }

    /**
     * SLA escalation sweep: any ticket still Open/InProgress past its dueDate is
     * flipped to Escalated. Returns the tickets that were just escalated (empty
     * list on a quiet run) so the scheduler can log/audit only real transitions.
     */
    public List<FaultTicketResponse> escalateOverdueTickets() {
        List<FaultTicket> overdue = ticketRepo.findByStatusInAndDueDateBefore(
                List.of(FaultTicket.TicketStatus.O, FaultTicket.TicketStatus.P), LocalDate.now());
        if (overdue.isEmpty()) return List.of();
        for (FaultTicket t : overdue) {
            t.setStatus(FaultTicket.TicketStatus.E);
        }
        ticketRepo.saveAll(overdue);
        log.info("SLA escalation: {} ticket(s) moved to Escalated", overdue.size());
        return overdue.stream().map(this::toDTO).collect(Collectors.toList());
    }
}
