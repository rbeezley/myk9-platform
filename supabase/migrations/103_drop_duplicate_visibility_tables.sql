-- 103_drop_duplicate_visibility_tables.sql
--
-- Drop the duplicate result visibility tables created by migrations 004 and 093.
--
-- CONTEXT:
-- Migration 060 created show_visibility_settings, trial_visibility_overrides,
-- and class_visibility_overrides. These are the canonical visibility tables used
-- by the myK9Show Results Control Page, Show Settings Page, self-check-in
-- cascade, and the SettingsOverrideCard component.
--
-- Migration 004 (myK9Q-specific) originally created show_result_visibility_defaults,
-- trial_result_visibility_overrides, and class_result_visibility_overrides with a
-- different schema. Migration 093 attempted to re-create them with an updated
-- schema (matching 060's column layout but using preset_name instead of preset),
-- however CREATE TABLE IF NOT EXISTS made this a no-op where the tables already
-- existed from 004.
--
-- RISK ADDRESSED:
-- Two parallel table sets caused split-brain writes. The 060 tables are the
-- authoritative source for the secretary UI. The 093-named tables have separate
-- RLS policies (including judge write access) that bypass frontend role guards.
-- Any data written via the Results Control Page was invisible to consumers
-- reading from the 093-named tables, and vice versa.
--
-- TYPESCRIPT FILES THAT REFERENCE THESE TABLES (will need updating separately):
--   myK9Show:
--     - apps/myk9show/src/hooks/queries/useVisibilitySettings.ts
--     - apps/myk9show/src/hooks/mutations/useVisibilityMutations.ts
--     - apps/myk9show/src/hooks/useVisibleResultFields.ts
--     - apps/myk9show/src/features/pipeline/components/ShowSettingsPanel.tsx
--   myK9Q:
--     - apps/myk9q/src/services/resultVisibilityService.ts
--     - apps/myk9q/src/services/replication/ConnectionManager.ts
--     - apps/myk9q/src/services/replication/initReplication.ts
--     - apps/myk9q/src/services/replication/tables/ReplicatedShowVisibilityDefaultsTable.ts
--     - apps/myk9q/src/services/replication/tables/ReplicatedTrialVisibilityOverridesTable.ts
--     - apps/myk9q/src/services/replication/tables/ReplicatedClassVisibilityOverridesTable.ts
--     - apps/myk9q/src/config/featureFlags.ts
--     - apps/myk9q/src/config/emergencyKillSwitch.ts
--     - apps/myk9q/src/pages/ClassList/hooks/useClassListFetch.ts
--     - apps/myk9q/src/pages/Admin/hooks/useCompetitionAdminData.ts
--     - apps/myk9q/src/pages/EntryList/hooks/useEntryListDataHelpers.ts
--     - apps/myk9q/src/components/dialogs/ClassSettingsDialog.tsx
--   Supabase types (auto-generated, will be regenerated):
--     - packages/supabase/src/database.types.ts
--     - packages/supabase/src/types/database.types.ts
--     - apps/myk9show/src/types/supabase.ts

-- ============================================================
-- Drop RLS policies on the 093-named tables
-- ============================================================

-- Policies created by migration 006_rls_policies.sql
DROP POLICY IF EXISTS "show_result_visibility_defaults_select" ON show_result_visibility_defaults;
DROP POLICY IF EXISTS "show_result_visibility_defaults_all" ON show_result_visibility_defaults;
DROP POLICY IF EXISTS "trial_result_visibility_overrides_select" ON trial_result_visibility_overrides;
DROP POLICY IF EXISTS "trial_result_visibility_overrides_all" ON trial_result_visibility_overrides;
DROP POLICY IF EXISTS "class_result_visibility_overrides_select" ON class_result_visibility_overrides;
DROP POLICY IF EXISTS "class_result_visibility_overrides_all" ON class_result_visibility_overrides;

-- Policies created by migration 093_result_visibility_tables.sql
DROP POLICY IF EXISTS "visibility_show_select" ON show_result_visibility_defaults;
DROP POLICY IF EXISTS "visibility_show_modify" ON show_result_visibility_defaults;
DROP POLICY IF EXISTS "visibility_trial_select" ON trial_result_visibility_overrides;
DROP POLICY IF EXISTS "visibility_trial_modify" ON trial_result_visibility_overrides;
DROP POLICY IF EXISTS "visibility_class_select" ON class_result_visibility_overrides;
DROP POLICY IF EXISTS "visibility_class_modify" ON class_result_visibility_overrides;

-- ============================================================
-- Drop the duplicate tables (CASCADE removes triggers, indexes, FK constraints)
-- ============================================================

DROP TABLE IF EXISTS class_result_visibility_overrides CASCADE;
DROP TABLE IF EXISTS trial_result_visibility_overrides CASCADE;
DROP TABLE IF EXISTS show_result_visibility_defaults CASCADE;
