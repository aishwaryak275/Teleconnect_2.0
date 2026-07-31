package com.teleconnect.iam;

import com.teleconnect.iam.entity.Permission;
import com.teleconnect.iam.entity.Role;
import com.teleconnect.iam.entity.User;
import com.teleconnect.iam.repository.PermissionRepository;
import com.teleconnect.iam.repository.RoleRepository;
import com.teleconnect.iam.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component // must run before SubscriberSeeder (it needs the "S" role to exist)
public class DataLoader implements CommandLineRunner {

    private final RoleRepository roleRepo;
    private final PermissionRepository permRepo;
    private final UserRepository userRepo;
    private final PasswordEncoder passwordEncoder;

    public DataLoader(RoleRepository roleRepo, PermissionRepository permRepo,
                      UserRepository userRepo, PasswordEncoder passwordEncoder) {
        this.roleRepo = roleRepo;
        this.permRepo = permRepo;
        this.userRepo = userRepo;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {

        // 1. Create all 18 permissions if they do not exist
        List<String> permNames = List.of(
            "VIEW_PLAN", "PAY_BILL", "RAISE_SERVICE_REQUEST",
            "VIEW_SUBSCRIBER", "CREATE_FAULT_TICKET", "UPDATE_FAULT_TICKET",
            "VIEW_INVOICE", "EDIT_INVOICE", "RAISE_DISPUTE",
            "VIEW_NETWORK_FAULTS", "CLOSE_FAULT_TICKET",
            "VIEW_AUDIT_LOGS", "VIEW_REPORTS", "VIEW_KYC",
            "CREATE_USER", "DELETE_USER", "MANAGE_PLANS",
            "VIEW_ALL_USERS","USAGE_RECORDS","USAGE_ANALYTICS",
            "KYC_EXPIRE","CREATE_SUB","GET_SUB","BILLING_CYCLE",
            "BILLING_REPORT","BILLING_DISPUTE","EDIT_DISPUTE","CREATE_NOTIFICATION",
            "VIEW_NOTIFICATIONS","MARK_NOTIFICATIONS","SERVICE_REQUEST","GET_UPDATE_TICKET","RESOLVE_TICKET",
            "VIEW_OWN_PLAN",
            "VIEW_REPORT_ARPU","VIEW_REPORT_CHURN","VIEW_REPORT_NETWORK_UTILISATION",
            "VIEW_REPORT_SLA_COMPLIANCE","VIEW_REPORT_COLLECTION_EFFICIENCY",
            "VIEW_REPORT_SUBSCRIBER_GROWTH","GENERATE_REPORT"
        );

        Map<String, Permission> permMap = new HashMap<>();
        for (String name : permNames) {
            try {
                Permission p = permRepo.findByPermissionName(name).orElseGet(() -> {
                    Permission np = new Permission();
                    np.setPermissionName(name);
                    return permRepo.save(np);
                });
                permMap.put(name, p);
                log.info("[TeleConnect IAM] Created permission: {}", name);
            } catch (Exception e) {
                log.error("[TeleConnect IAM] ERROR creating permission '{}'", name, e);
            }
        }
        log.info("[TeleConnect IAM] Total permissions created: {} out of {}", permMap.size(), permNames.size());

        // Helper
        java.util.function.Function<String[], List<Permission>> perms =
            names -> Arrays.stream(names).map(permMap::get).toList();

        // 2. Create all 6 roles with their permissions if they do not exist
        createRole("S",   perms.apply(new String[]{"VIEW_PLAN", "PAY_BILL", "RAISE_SERVICE_REQUEST","USAGE_RECORDS","GET_SUB","CREATE_SUB","VIEW_INVOICE","BILLING_DISPUTE","CREATE_NOTIFICATION","MARK_NOTIFICATIONS","VIEW_NOTIFICATIONS","VIEW_OWN_PLAN"}));
        createRole("CS",  perms.apply(new String[]{"VIEW_SUBSCRIBER", "CREATE_FAULT_TICKET", "UPDATE_FAULT_TICKET","USAGE_RECORDS","USAGE_ANALYTICS","VIEW_KYC","VIEW_PLAN","CREATE_SUB","GET_SUB","CREATE_NOTIFICATION","VIEW_NOTIFICATIONS","MARK_NOTIFICATIONS","SERVICE_REQUEST","GET_UPDATE_TICKET"}));
        createRole("B",   perms.apply(new String[]{"VIEW_INVOICE", "EDIT_INVOICE", "RAISE_DISPUTE","USAGE_RECORDS","USAGE_ANALYTICS","VIEW_SUBSCRIBER","VIEW_PLAN","GET_SUB","BILLING_CYCLE","PAY_BILL","BILLING_REPORT","BILLING_DISPUTE","EDIT_DISPUTE","CREATE_NOTIFICATION","VIEW_NOTIFICATIONS","MARK_NOTIFICATIONS",
                                                           "VIEW_REPORT_ARPU","VIEW_REPORT_COLLECTION_EFFICIENCY","GENERATE_REPORT"}));
        createRole("N",   perms.apply(new String[]{"VIEW_NETWORK_FAULTS", "CLOSE_FAULT_TICKET","USAGE_ANALYTICS","VIEW_PLAN","VIEW_NOTIFICATIONS","GET_UPDATE_TICKET","RESOLVE_TICKET",
                                                           "VIEW_REPORT_NETWORK_UTILISATION","VIEW_REPORT_SLA_COMPLIANCE","GENERATE_REPORT"}));
        createRole("C",   perms.apply(new String[]{"VIEW_REPORTS","USAGE_RECORDS","USAGE_ANALYTICS","VIEW_PLAN","GET_SUB","CREATE_NOTIFICATION","VIEW_NOTIFICATIONS","MARK_NOTIFICATIONS",
                                                           "VIEW_REPORT_CHURN","VIEW_REPORT_SLA_COMPLIANCE","VIEW_REPORT_SUBSCRIBER_GROWTH"}));
        createRole("A",   perms.apply(new String[]{"CREATE_USER", "DELETE_USER", "MANAGE_PLANS", "VIEW_ALL_USERS", "USAGE_RECORDS","USAGE_ANALYTICS","VIEW_SUBSCRIBER","VIEW_KYC","KYC_EXPIRE","VIEW_PLAN",
                                                           "CREATE_SUB","GET_SUB","BILLING_CYCLE","BILLING_REPORT","VIEW_INVOICE", "EDIT_INVOICE",
                                                           "PAY_BILL","BILLING_DISPUTE","EDIT_DISPUTE","CREATE_NOTIFICATION","VIEW_NOTIFICATIONS","MARK_NOTIFICATIONS","SERVICE_REQUEST","GET_UPDATE_TICKET","RESOLVE_TICKET",
                                                           "VIEW_REPORT_ARPU","VIEW_REPORT_CHURN","VIEW_REPORT_NETWORK_UTILISATION","VIEW_REPORT_SLA_COMPLIANCE",
                                                           "VIEW_REPORT_COLLECTION_EFFICIENCY","VIEW_REPORT_SUBSCRIBER_GROWTH","GENERATE_REPORT","VIEW_AUDIT_LOGS"}));

        log.info("[TeleConnect IAM] Roles and permissions seeded successfully.");

        // 3. Create bootstrap users if they don't exist
        createBootstrapUsers();
    }

    private void createBootstrapUsers() {
        try {
            seedUser("Administrator",       "admin@teleconnect.com",       "0000000000", "A",  "Admin@123",    false);
            seedUser("Subscriber User",     "subscriber@teleconnect.com",  "9000000001", "S",  "Password@123", false);
            seedUser("CS Agent User",       "agent@teleconnect.com",       "9000000002", "CS", "Password@123", false);
            seedUser("Billing Executive",   "billing@teleconnect.com",     "9000000003", "B",  "Password@123", false);
            seedUser("Network NOC User",    "networkops@teleconnect.com",  "9000000004", "N",  "Password@123", false);
            seedUser("Compliance Officer",  "compliance@teleconnect.com",  "9000000005", "C",  "Password@123", false);
        } catch (Exception e) {
            log.error("[TeleConnect IAM] ERROR creating bootstrap users", e);
        }
    }

    private void seedUser(String name, String email, String phone, String roleName, String password, boolean mustChange) {
        if (userRepo.existsByEmail(email)) {
            log.info("[TeleConnect IAM] Bootstrap user already exists: {}", email);
            return;
        }
        Role role = roleRepo.findByRoleName(roleName)
            .orElseThrow(() -> new RuntimeException("Role not found: " + roleName));
        User user = new User();
        user.setName(name);
        user.setEmail(email);
        user.setPhone(phone);
        user.setPassword(passwordEncoder.encode(password));
        user.setRole(role);
        user.setRegionId(1);
        user.setStatus(User.Status.A);
        user.setMustChangePassword(mustChange);
        userRepo.save(user);
        log.info("[TeleConnect IAM] Created bootstrap user: {} (role: {})", email, roleName);
    }

    private void createRole(String name, List<Permission> permissions) {
        try {
            var existingRole = roleRepo.findByRoleName(name);
            if (existingRole.isPresent()) {
                Role role = existingRole.get();
                // Update permissions for existing role
                role.setPermissions(permissions);
                roleRepo.save(role);
                log.info("[TeleConnect IAM] Updated role: {} with {} permissions", name, permissions.size());
            } else {
                Role role = new Role();
                role.setRoleName(name);
                role.setPermissions(permissions);
                roleRepo.save(role);
                log.info("[TeleConnect IAM] Created role: {} with {} permissions", name, permissions.size());
            }
        } catch (Exception e) {
            log.error("[TeleConnect IAM] ERROR creating/updating role '{}'", name, e);
        }
    }
}
