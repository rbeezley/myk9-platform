-- Complete the singular table naming refactor
-- Phase 2: Rename remaining plural tables to singular

-- Core application tables
ALTER TABLE competitions RENAME TO competition;
ALTER TABLE judge_assignments RENAME TO judge_assignment;
ALTER TABLE show_registrations RENAME TO show_registration;
ALTER TABLE armbands RENAME TO armband;
ALTER TABLE audit_entries RENAME TO audit_entry;
ALTER TABLE system_alerts RENAME TO system_alert;
ALTER TABLE draft_entries RENAME TO draft_entry;
ALTER TABLE judge_certifications RENAME TO judge_certification;
ALTER TABLE past_results RENAME TO past_result;

-- RBAC system tables
ALTER TABLE permissions RENAME TO permission;
ALTER TABLE roles RENAME TO role;

-- Notification system tables
ALTER TABLE notification_events RENAME TO notification_event;
ALTER TABLE notification_preferences RENAME TO notification_preference;
ALTER TABLE notification_templates RENAME TO notification_template;
ALTER TABLE notification_triggers RENAME TO notification_trigger;

-- Update any foreign key constraints and indexes
-- Note: PostgreSQL automatically renames constraints and indexes, but we should verify

-- Add comments to document the rename
COMMENT ON TABLE competition IS 'Renamed from competitions for singular table naming consistency';
COMMENT ON TABLE judge_assignment IS 'Renamed from judge_assignments for singular table naming consistency';
COMMENT ON TABLE show_registration IS 'Renamed from show_registrations for singular table naming consistency';
COMMENT ON TABLE armband IS 'Renamed from armbands for singular table naming consistency';
COMMENT ON TABLE audit_entry IS 'Renamed from audit_entries for singular table naming consistency';
COMMENT ON TABLE system_alert IS 'Renamed from system_alerts for singular table naming consistency';
COMMENT ON TABLE draft_entry IS 'Renamed from draft_entries for singular table naming consistency';
COMMENT ON TABLE judge_certification IS 'Renamed from judge_certifications for singular table naming consistency';
COMMENT ON TABLE past_result IS 'Renamed from past_results for singular table naming consistency';
COMMENT ON TABLE permission IS 'Renamed from permissions for singular table naming consistency';
COMMENT ON TABLE role IS 'Renamed from roles for singular table naming consistency';
COMMENT ON TABLE notification_event IS 'Renamed from notification_events for singular table naming consistency';
COMMENT ON TABLE notification_preference IS 'Renamed from notification_preferences for singular table naming consistency';
COMMENT ON TABLE notification_template IS 'Renamed from notification_templates for singular table naming consistency';
COMMENT ON TABLE notification_trigger IS 'Renamed from notification_triggers for singular table naming consistency';