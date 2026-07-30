package com.teleconnect.notification.service;

import com.teleconnect.notification.dto.request.NotificationRequest;
import com.teleconnect.notification.dto.response.NotificationResponse;
import com.teleconnect.notification.dto.response.NotificationSummaryResponse;
import com.teleconnect.notification.entity.enums.NotificationCategory;
import com.teleconnect.notification.entity.enums.NotificationStatus;

import java.util.List;

public interface NotificationService {

    NotificationResponse createNotification(NotificationRequest request);

    List<NotificationResponse> getNotifications(Long userId);

    NotificationResponse getNotificationById(Long notificationId);

    List<NotificationResponse> getByStatus(
            Long userId,
            NotificationStatus status);

    List<NotificationResponse> getByCategory(
            Long userId,
            NotificationCategory category);

    NotificationSummaryResponse getUnreadCount(Long userId);

    String markAsRead(Long notificationId);

    String dismissNotification(Long notificationId);

    String markAllAsRead(Long userId);

    /**
     * Used by scheduled alert producers (usage threshold, plan expiry, invoice due,
     * fault update / SLA breach). Creates the notification unless the user already
     * has an UNREAD one in the same category from today — schedulers run repeatedly
     * (hourly/daily) for an ongoing condition, so this prevents alert spam.
     */
    void createIfNew(Long userId, String message, NotificationCategory category);
}