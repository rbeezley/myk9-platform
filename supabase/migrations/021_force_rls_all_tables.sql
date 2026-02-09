-- =============================================================================
-- Migration 021: Force Row Level Security on All Tables
-- =============================================================================
-- Without FORCE ROW LEVEL SECURITY, the table owner (postgres role) bypasses
-- all RLS policies. This is a critical security gap - if any query runs as
-- the table owner without proper context, it sees all data.
--
-- This migration applies FORCE RLS to every table that has RLS enabled.
--
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security
-- Best Practice: Rule 11.3 - Common RLS Pitfalls
--
-- ROLLBACK:
-- ALTER TABLE <table_name> NO FORCE ROW LEVEL SECURITY;
-- (apply to each table listed below)
-- =============================================================================

-- Core entities
ALTER TABLE clubs FORCE ROW LEVEL SECURITY;
ALTER TABLE people FORCE ROW LEVEL SECURITY;
ALTER TABLE dogs FORCE ROW LEVEL SECURITY;
ALTER TABLE dog_registrations FORCE ROW LEVEL SECURITY;

-- Shows and events
ALTER TABLE shows FORCE ROW LEVEL SECURITY;
ALTER TABLE trials FORCE ROW LEVEL SECURITY;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;

-- Entries and scoring
ALTER TABLE entries FORCE ROW LEVEL SECURITY;
ALTER TABLE entry_status_history FORCE ROW LEVEL SECURITY;

-- myK9Q specific
ALTER TABLE nationals_scores FORCE ROW LEVEL SECURITY;
ALTER TABLE nationals_rankings FORCE ROW LEVEL SECURITY;
ALTER TABLE nationals_advancement FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteer_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteers FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteer_class_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE volunteer_general_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads FORCE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE push_notification_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE rule_organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE rule_sports FORCE ROW LEVEL SECURITY;
ALTER TABLE rulebooks FORCE ROW LEVEL SECURITY;
ALTER TABLE rules FORCE ROW LEVEL SECURITY;
ALTER TABLE rules_query_log FORCE ROW LEVEL SECURITY;
ALTER TABLE rules_feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE show_result_visibility_defaults FORCE ROW LEVEL SECURITY;
ALTER TABLE trial_result_visibility_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE class_result_visibility_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics FORCE ROW LEVEL SECURITY;
ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;

-- myK9Show specific
ALTER TABLE health_records FORCE ROW LEVEL SECURITY;
ALTER TABLE vaccinations FORCE ROW LEVEL SECURITY;
ALTER TABLE medications FORCE ROW LEVEL SECURITY;
ALTER TABLE allergies FORCE ROW LEVEL SECURITY;
ALTER TABLE vet_visits FORCE ROW LEVEL SECURITY;
ALTER TABLE achievements FORCE ROW LEVEL SECURITY;
ALTER TABLE show_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE class_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE template_fields FORCE ROW LEVEL SECURITY;
ALTER TABLE judge_certifications FORCE ROW LEVEL SECURITY;
ALTER TABLE judge_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE permission_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE stripe_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE fcm_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE offline_scoring FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts FORCE ROW LEVEL SECURITY;
ALTER TABLE armbands FORCE ROW LEVEL SECURITY;

-- Online entry system (migration 009)
ALTER TABLE exhibitor_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE entry_carts FORCE ROW LEVEL SECURITY;
ALTER TABLE entry_cart_items FORCE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries FORCE ROW LEVEL SECURITY;

-- =============================================================================
SELECT 'Migration 021: FORCE ROW LEVEL SECURITY applied to all tables' as status;
