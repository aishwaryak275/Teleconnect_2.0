package com.teleconnect.fault.repository;

import com.teleconnect.fault.entity.FaultTicket;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;

public interface FaultTicketRepository extends JpaRepository<FaultTicket, Integer> {

    List<FaultTicket> findByStatus(FaultTicket.TicketStatus status);

    List<FaultTicket> findByPriority(FaultTicket.Priority priority);

    List<FaultTicket> findByFaultType(FaultTicket.FaultType faultType);

    List<FaultTicket> findByAccountId(Integer accountId);

    List<FaultTicket> findByAssignedToId(Integer assignedToId);

    List<FaultTicket> findByStatusInAndDueDateBefore(List<FaultTicket.TicketStatus> statuses, LocalDate date);
}
