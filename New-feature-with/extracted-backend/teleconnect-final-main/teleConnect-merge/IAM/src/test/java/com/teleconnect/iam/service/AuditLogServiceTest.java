package com.teleconnect.iam.service;

import com.teleconnect.iam.dto.request.AuditLogFilterDTO;
import com.teleconnect.iam.entity.AuditLog;
import com.teleconnect.iam.repository.AuditLogRepository;
import com.teleconnect.iam.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuditLogServiceTest {

    @Mock
    private AuditLogRepository repository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private AuditLogService service;

    @Test
    void log_savesAuditLog() {
        AuditLog log = new AuditLog();
        log.setUserId(123L);
        log.setAction("TEST_ACTION");
        log.setModule("IAM");
        log.setIpAddress("127.0.0.1");

        service.log(123L, "TEST_ACTION", "IAM", "127.0.0.1");

        verify(repository).save(org.mockito.ArgumentMatchers.any(AuditLog.class));
    }

    @Test
    void getLogsByUser_filtersByActionAndModule() {
        AuditLog log1 = new AuditLog();
        log1.setAuditId(1L);
        log1.setUserId(5L);
        log1.setAction("LOGIN");
        log1.setModule("IAM");
        log1.setTimestamp(LocalDateTime.now().minusHours(1));

        AuditLog log2 = new AuditLog();
        log2.setAuditId(2L);
        log2.setUserId(5L);
        log2.setAction("LOGOUT");
        log2.setModule("IAM");
        log2.setTimestamp(LocalDateTime.now().minusMinutes(30));

        when(repository.findAll()).thenReturn(List.of(log1, log2));

        AuditLogFilterDTO filter = new AuditLogFilterDTO();
        filter.setAction("LOGIN");
        filter.setModule("IAM");

        var result = service.getLogsByUser(5L, filter);

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getContent().get(0).getAction()).isEqualTo("LOGIN");
    }

    @Test
    void getAllLogs_returnsPagedResults() {
        AuditLog log1 = new AuditLog();
        log1.setAuditId(1L);
        log1.setUserId(5L);
        log1.setAction("LOGIN");
        log1.setModule("IAM");
        log1.setTimestamp(LocalDateTime.now().minusHours(1));

        AuditLog log2 = new AuditLog();
        log2.setAuditId(2L);
        log2.setUserId(6L);
        log2.setAction("LOGOUT");
        log2.setModule("IAM");
        log2.setTimestamp(LocalDateTime.now().minusMinutes(30));

        AuditLog log3 = new AuditLog();
        log3.setAuditId(3L);
        log3.setUserId(7L);
        log3.setAction("UPDATE");
        log3.setModule("IAM");
        log3.setTimestamp(LocalDateTime.now().minusMinutes(10));

        when(repository.findAll()).thenReturn(List.of(log1, log2, log3));

        AuditLogFilterDTO filter = new AuditLogFilterDTO();
        filter.setPage(1);
        filter.setSize(1);

        var result = service.getAllLogs(filter);

        assertThat(result.getTotalElements()).isEqualTo(3);
        assertThat(result.getNumber()).isEqualTo(1);
        assertThat(result.getSize()).isEqualTo(1);
        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getContent().get(0).getAuditId()).isEqualTo(2L);
    }
}
