package com.teleconnect.common.audit;

/**
 * The specific action being audited. The enum name is stored verbatim in
 * audit_logs.action (e.g. CREATE_PLAN, UPDATE_SUBSCRIPTION).
 *
 * Only state-changing (POST / PUT / PATCH) operations are represented here;
 * the row is written only after the operation succeeds.
 */
public enum AuditAction {

    // ---- Subscriber module ----
    CREATE_SUBSCRIBER_ACCOUNT,
    UPDATE_KYC_STATUS,
    UPDATE_ACCOUNT_STATUS,
    CREATE_SIM_LINE,
    UPDATE_SIM_STATUS,
    REPLACE_SIM,
    UPDATE_SIM_SERVICE_TYPE,
    DELETE_SUBSCRIBER_ACCOUNT,
    DELETE_SIM_LINE,

    // ---- Plan module ----
    CREATE_PLAN,
    UPDATE_PLAN,
    CREATE_ADDON,
    CREATE_SUBSCRIPTION,
    UPDATE_SUBSCRIPTION,
    CHANGE_SUBSCRIPTION_PLAN,
    ATTACH_ADDON,

    // ---- Usage module ----
    CREATE_USAGE_RECORD,
    UPDATE_USAGE_SUMMARY,

    // ---- Billing module ----
    CREATE_BILLING_CYCLE,
    GENERATE_INVOICES,
    CLOSE_BILLING_CYCLE,
    UPDATE_BILLING_CYCLE_STATUS,
    GENERATE_INVOICE,
    MARK_INVOICES_OVERDUE,
    SEND_INVOICE,
    RECORD_PAYMENT,
    APPLY_LATE_FEE,
    WAIVE_LATE_FEE,
    RAISE_DISPUTE,
    REVIEW_DISPUTE,
    RESOLVE_DISPUTE,
    UPDATE_DISPUTE_STATUS,

    // ---- Notification module ----
    CREATE_NOTIFICATION,
    MARK_NOTIFICATION_READ,
    MARK_ALL_NOTIFICATIONS_READ,
    DELETE_NOTIFICATION,
    DELETE_ALL_NOTIFICATIONS,

    // ---- Fault module ----
    CREATE_FAULT_TICKET,
    ASSIGN_FAULT_TICKET,
    UPDATE_FAULT_TICKET,
    RESOLVE_FAULT_TICKET,
    ESCALATE_FAULT_TICKET,
    CREATE_SERVICE_REQUEST,
    UPDATE_SERVICE_REQUEST,
    CANCEL_SERVICE_REQUEST,

    // ---- Analytics module ----
    GENERATE_REPORT
}
