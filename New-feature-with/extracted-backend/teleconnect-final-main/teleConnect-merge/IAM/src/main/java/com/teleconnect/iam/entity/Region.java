package com.teleconnect.iam.entity;

import jakarta.persistence.*;
import lombok.Data;

/**
 * Reference-data catalog for RegionID — the field User/SubscriberAccount already
 * carry as a plain Integer. This table gives Admins a real place to add/retire
 * regions instead of typing an arbitrary number.
 */
@Entity
@Table(name = "region")
@Data
public class Region {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer regionId;

    @Column(nullable = false, unique = true)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RegionStatus status = RegionStatus.Active;

    public enum RegionStatus {
        Active, Inactive
    }
}
