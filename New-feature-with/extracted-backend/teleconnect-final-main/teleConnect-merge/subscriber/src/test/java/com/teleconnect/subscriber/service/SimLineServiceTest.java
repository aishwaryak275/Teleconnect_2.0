package com.teleconnect.subscriber.service;

import com.teleconnect.subscriber.dto.request.CreateSimLineRequest;
import com.teleconnect.subscriber.dto.request.UpdateServiceTypeRequest;
import com.teleconnect.subscriber.entity.SimLine;
import com.teleconnect.subscriber.repository.SimLineRepository;
import com.teleconnect.subscriber.repository.SubscriberAccountRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SimLineServiceTest {

    @Mock
    private SimLineRepository simLineRepo;

    @Mock
    private SubscriberAccountRepository accountRepo;

    @InjectMocks
    private SimLineService service;

    @Test
    void createSimLine_savesSuccess() {
        CreateSimLineRequest request = new CreateSimLineRequest();
        request.setMsisdn("1234567890");
        request.setIccid("ICCID-0001");
        request.setServiceType("VoiceData");

        com.teleconnect.subscriber.entity.SubscriberAccount account =
                new com.teleconnect.subscriber.entity.SubscriberAccount();
        account.setKycStatus(com.teleconnect.subscriber.entity.SubscriberAccount.KycStatus.Verified);
        when(accountRepo.findById(1)).thenReturn(Optional.of(account));
        when(simLineRepo.existsByMsisdn("1234567890")).thenReturn(false);
        when(simLineRepo.existsByIccid("ICCID-0001")).thenReturn(false);

        var result = service.createSimLine(1, request);

        assertThat(result.getMessage()).contains("activated successfully");
    }

    @Test
    void getSimLineById_whenAccountMismatch_throws() {
        SimLine simLine = new SimLine();
        simLine.setLineId(5);
        simLine.setAccountId(2);

        when(simLineRepo.findById(5)).thenReturn(Optional.of(simLine));

        assertThatThrownBy(() -> service.getSimLineById(1, 5))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("does not belong to account");
    }

    @Test
    void updateServiceType_savesUpdatedServiceType() {
        SimLine simLine = new SimLine();
        simLine.setLineId(10);
        simLine.setAccountId(1);
        simLine.setServiceType(SimLine.ServiceType.VoiceData);

        when(simLineRepo.findById(10)).thenReturn(Optional.of(simLine));
        when(simLineRepo.save(any(SimLine.class))).thenReturn(simLine);

        UpdateServiceTypeRequest request = new UpdateServiceTypeRequest();
        request.setServiceType("Data");

        var result = service.updateServiceType(1, 10, request);

        assertThat(result.getMessage()).contains("Data");
        assertThat(simLine.getServiceType()).isEqualTo(SimLine.ServiceType.Data);
    }
}
