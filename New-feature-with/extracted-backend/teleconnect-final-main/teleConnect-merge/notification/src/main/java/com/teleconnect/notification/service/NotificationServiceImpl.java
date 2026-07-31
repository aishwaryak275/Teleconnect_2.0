package com.teleconnect.notification.service;

import lombok.extern.slf4j.Slf4j;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;

import com.teleconnect.notification.dto.request.NotificationRequest;
import com.teleconnect.notification.dto.response.NotificationResponse;
import com.teleconnect.notification.dto.response.NotificationSummaryResponse;
import com.teleconnect.notification.entity.Notification;
import com.teleconnect.notification.entity.enums.NotificationCategory;
import com.teleconnect.notification.entity.enums.NotificationStatus;
import com.teleconnect.notification.repository.NotificationRepository;

@Slf4j
@Service
public class NotificationServiceImpl implements NotificationService {

    private final NotificationRepository repository;

    public NotificationServiceImpl(NotificationRepository repository) {
        this.repository = repository;
    }

    @Override
    public NotificationResponse createNotification(NotificationRequest request) {

        Notification notification = new Notification();

        notification.setUserId(request.getUserId());
        notification.setMessage(request.getMessage());
        notification.setCategory(request.getCategory());
        notification.setStatus(NotificationStatus.UNREAD);
        notification.setCreatedDate(LocalDateTime.now());

        Notification saved = repository.save(notification);

        return map(saved);
    }

    @Override
    public List<NotificationResponse> getNotifications(Long userId) {

        return repository.findByUserId(userId)
                .stream()
                .map(this::map)
                .toList();
    }

    @Override
    public NotificationResponse getNotificationById(Long notificationId) {

        Notification notification =
                repository.findById(notificationId)
                        .orElseThrow(() ->
                                new com.teleconnect.notification.exception.ResourceNotFoundException("Notification not found"));

        return map(notification);
    }

    @Override
    public List<NotificationResponse> getByStatus(
            Long userId,
            NotificationStatus status) {

        return repository.findByUserIdAndStatus(userId, status)
                .stream()
                .map(this::map)
                .toList();
    }

    @Override
    public List<NotificationResponse> getByCategory(
            Long userId,
            NotificationCategory category) {

        return repository.findByUserIdAndCategory(userId, category)
                .stream()
                .map(this::map)
                .toList();
    }

    @Override
    public NotificationSummaryResponse getUnreadCount(Long userId) {

        Long count = repository.countByUserIdAndStatus(
                userId,
                NotificationStatus.UNREAD);

        return new NotificationSummaryResponse(userId, count);
    }

    @Override
    public NotificationResponse createIfNew(Long userId, String message, NotificationCategory category) {
        // Check if notification with same userId, message, and category already exists
        List<Notification> existing = repository.findByUserIdAndCategory(userId, category);
        for (Notification n : existing) {
            if (message.equals(n.getMessage())) {
                log.debug("Notification already exists for userId={}, category={}", userId, category);
                return map(n);
            }
        }
        // Create new notification if it doesn't exist
        Notification notification = new Notification();
        notification.setUserId(userId);
        notification.setMessage(message);
        notification.setCategory(category);
        notification.setStatus(NotificationStatus.UNREAD);
        notification.setCreatedDate(LocalDateTime.now());
        Notification saved = repository.save(notification);
        log.info("Created new notification for userId={}, category={}", userId, category);
        return map(saved);
    }

    @Override
    public String markAsRead(Long notificationId) {

        Notification notification =
                repository.findById(notificationId)
                        .orElseThrow(() ->
                                new com.teleconnect.notification.exception.ResourceNotFoundException("Notification not found"));

        notification.setStatus(NotificationStatus.READ);

        repository.save(notification);

        return "Notification marked as read";
    }

    @Override
    public String dismissNotification(Long notificationId) {

        Notification notification =
                repository.findById(notificationId)
                        .orElseThrow(() ->
                                new com.teleconnect.notification.exception.ResourceNotFoundException("Notification not found"));

        notification.setStatus(NotificationStatus.DISMISSED);

        repository.save(notification);

        return "Notification dismissed successfully";
    }

    @Override
    public String markAllAsRead(Long userId) {

        List<Notification> notifications =
                repository.findByUserId(userId);

        notifications.forEach(n ->
                n.setStatus(NotificationStatus.READ));

        repository.saveAll(notifications);

        return "All notifications marked as read";
    }

    private NotificationResponse map(Notification n) {

        NotificationResponse response = new NotificationResponse();

        response.setNotificationId(n.getNotificationId());
        response.setUserId(n.getUserId());
        response.setMessage(n.getMessage());
        response.setCategory(n.getCategory());
        response.setStatus(n.getStatus());
        response.setCreatedDate(n.getCreatedDate());

        return response;
    }
}