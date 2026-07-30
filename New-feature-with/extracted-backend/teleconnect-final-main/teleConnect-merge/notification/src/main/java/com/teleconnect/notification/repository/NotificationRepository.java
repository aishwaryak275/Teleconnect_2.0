package com.teleconnect.notification.repository;

import com.teleconnect.notification.entity.Notification;
import com.teleconnect.notification.entity.enums.NotificationCategory;
import com.teleconnect.notification.entity.enums.NotificationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByUserId(Long userId);

    List<Notification> findByUserIdAndStatus(
            Long userId,
            NotificationStatus status);

    List<Notification> findByUserIdAndCategory(
            Long userId,
            NotificationCategory category);

    Long countByUserIdAndStatus(
            Long userId,
            NotificationStatus status);

    /** Anti-spam check for scheduled alerts — has this user already been alerted in this category since a given time? */
    boolean existsByUserIdAndCategoryAndStatusAndCreatedDateAfter(
            Long userId,
            NotificationCategory category,
            NotificationStatus status,
            LocalDateTime after);
}