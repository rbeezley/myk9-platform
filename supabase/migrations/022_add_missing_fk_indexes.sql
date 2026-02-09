-- =============================================================================
-- Migration 022: Add Missing Foreign Key Indexes
-- =============================================================================
-- Postgres does NOT auto-index foreign key columns. Missing indexes cause:
-- - Full table scans on JOINs (10-100x slower)
-- - Slow CASCADE DELETE operations (locks table)
-- - Poor RLS policy performance (policies often JOIN on FK columns)
--
-- This migration adds indexes for all FK columns that are currently unindexed.
-- Grouped by priority: critical (used in RLS/frequent queries) then remaining.
--
-- Reference: https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK
-- Best Practice: Rule 4.2 - Index Foreign Key Columns
--
-- ROLLBACK: DROP INDEX IF EXISTS <index_name>; for each index below
-- =============================================================================

-- =============================================================================
-- CRITICAL: Used in RLS policies or frequent query patterns
-- =============================================================================

-- dogs: co_owner checked in RLS update/delete policies (migration 016)
CREATE INDEX IF NOT EXISTS dogs_co_owner_id_idx ON dogs(co_owner_id);

-- exhibitor_profiles: auth_user_id used in RLS policies (migration 009/020)
-- Note: There's a UNIQUE index on this column already from migration 009
-- (exhibitor_profiles_auth_user_id_idx), so this is already covered.

-- exhibitor_profiles: default_handler_id used in entry form lookups
CREATE INDEX IF NOT EXISTS exhibitor_profiles_default_handler_id_idx
  ON exhibitor_profiles(default_handler_id);

-- entry_cart_items: handler_id used in cart display JOINs
CREATE INDEX IF NOT EXISTS entry_cart_items_handler_id_idx
  ON entry_cart_items(handler_id);

-- waitlist_entries: dog_id and handler_id used in entry lookups
CREATE INDEX IF NOT EXISTS waitlist_entries_dog_id_idx ON waitlist_entries(dog_id);
CREATE INDEX IF NOT EXISTS waitlist_entries_handler_id_idx ON waitlist_entries(handler_id);

-- announcement_reads: announcement_id for CASCADE deletes and JOIN lookups
CREATE INDEX IF NOT EXISTS announcement_reads_announcement_id_idx
  ON announcement_reads(announcement_id);

-- nationals_rankings: entry_id for CASCADE deletes and result lookups
CREATE INDEX IF NOT EXISTS nationals_rankings_entry_id_idx
  ON nationals_rankings(entry_id);

-- notification_preferences: user_id for per-user lookups
CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx
  ON notification_preferences(user_id);

-- =============================================================================
-- HIGH: Used in JOINs or CASCADE operations
-- =============================================================================

-- dogs: breeder_id for breeder lookups
CREATE INDEX IF NOT EXISTS dogs_breeder_id_idx ON dogs(breeder_id);

-- entry_status_history: changed_by for audit trail queries
CREATE INDEX IF NOT EXISTS entry_status_history_changed_by_idx
  ON entry_status_history(changed_by);

-- announcements: trial_id for trial-specific announcements
CREATE INDEX IF NOT EXISTS announcements_trial_id_idx ON announcements(trial_id);

-- volunteer_class_assignments: volunteer_id for CASCADE and lookups
CREATE INDEX IF NOT EXISTS volunteer_class_assignments_volunteer_id_idx
  ON volunteer_class_assignments(volunteer_id);

-- volunteer_class_assignments: role_id for role-based filtering
CREATE INDEX IF NOT EXISTS volunteer_class_assignments_role_id_idx
  ON volunteer_class_assignments(role_id);

-- volunteer_general_assignments: all FK columns
CREATE INDEX IF NOT EXISTS volunteer_general_assignments_volunteer_id_idx
  ON volunteer_general_assignments(volunteer_id);
CREATE INDEX IF NOT EXISTS volunteer_general_assignments_trial_id_idx
  ON volunteer_general_assignments(trial_id);
CREATE INDEX IF NOT EXISTS volunteer_general_assignments_show_id_idx
  ON volunteer_general_assignments(show_id);
CREATE INDEX IF NOT EXISTS volunteer_general_assignments_role_id_idx
  ON volunteer_general_assignments(role_id);

-- push_notification_queue: subscription_id for CASCADE
CREATE INDEX IF NOT EXISTS push_notification_queue_subscription_id_idx
  ON push_notification_queue(subscription_id);

-- judge_assignments: trial_id for trial-scoped lookups
CREATE INDEX IF NOT EXISTS judge_assignments_trial_id_idx
  ON judge_assignments(trial_id);

-- armbands: trial_id and dog_id for lookups
CREATE INDEX IF NOT EXISTS armbands_trial_id_idx ON armbands(trial_id);
CREATE INDEX IF NOT EXISTS armbands_dog_id_idx ON armbands(dog_id);

-- sync_conflicts: resolved_by for audit queries
CREATE INDEX IF NOT EXISTS sync_conflicts_resolved_by_idx
  ON sync_conflicts(resolved_by);

-- =============================================================================
-- MEDIUM: Smaller tables or less frequent access patterns
-- =============================================================================

-- Rules system
CREATE INDEX IF NOT EXISTS rule_sports_organization_id_idx
  ON rule_sports(organization_id);
CREATE INDEX IF NOT EXISTS rulebooks_organization_id_idx
  ON rulebooks(organization_id);
CREATE INDEX IF NOT EXISTS rulebooks_sport_id_idx ON rulebooks(sport_id);
CREATE INDEX IF NOT EXISTS rules_feedback_query_log_id_idx
  ON rules_feedback(query_log_id);
CREATE INDEX IF NOT EXISTS rules_feedback_rule_id_idx
  ON rules_feedback(rule_id);

-- Result visibility (small tables, but CASCADE needs indexes)
CREATE INDEX IF NOT EXISTS show_result_visibility_defaults_show_id_idx
  ON show_result_visibility_defaults(show_id);
CREATE INDEX IF NOT EXISTS trial_result_visibility_overrides_trial_id_idx
  ON trial_result_visibility_overrides(trial_id);
CREATE INDEX IF NOT EXISTS class_result_visibility_overrides_class_id_idx
  ON class_result_visibility_overrides(class_id);

-- Templates: created_by for author lookups
CREATE INDEX IF NOT EXISTS show_templates_created_by_idx
  ON show_templates(created_by);
CREATE INDEX IF NOT EXISTS class_templates_created_by_idx
  ON class_templates(created_by);

-- RBAC: role_permissions already has unique constraint on (role_id, permission_id)
-- but single-column indexes help with individual lookups
-- Note: role_permissions_role_id_idx already created in migration 018
CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx
  ON role_permissions(permission_id);

-- user_roles: granted_by for audit trail
CREATE INDEX IF NOT EXISTS user_roles_granted_by_idx ON user_roles(granted_by);
-- Note: user_roles club_id and show_id partial indexes already in migration 018

-- =============================================================================
-- LOW: deleted_by columns (rarely queried, mainly for audit)
-- These are skipped intentionally - deleted_by is only used for audit trails
-- and these columns are rarely used in WHERE clauses or JOINs.
-- Adding indexes would consume storage with minimal query benefit.
-- =============================================================================

-- =============================================================================
SELECT 'Migration 022: Missing FK indexes added successfully' as status;
