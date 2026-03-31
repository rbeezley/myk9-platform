-- =============================================================================
-- Migration 101: Drop stale dashboard-created volunteer policies
--
-- These policies were created via the Supabase dashboard and bypass the
-- show-scoped policies from migration 100. They call is_club_admin() and
-- is_trial_secretary() with no arguments (no club_id/show scoping), so any
-- secretary for any club could manage all volunteers globally.
--
-- Since Postgres RLS policies are permissive by default, these unscoped
-- policies override the show-scoped ones from migration 100.
--
-- The correct policies are:
--   SELECT: "Authenticated users can view ..." (from migration 095)
--   ALL:    "Show managers can manage ..."     (from migration 100)
-- =============================================================================

-- Drop unscoped manage policies (bypass show scoping)
DROP POLICY IF EXISTS "volunteers_manage" ON volunteers;
DROP POLICY IF EXISTS "volunteer_class_assignments_manage" ON volunteer_class_assignments;
DROP POLICY IF EXISTS "volunteer_general_assignments_manage" ON volunteer_general_assignments;

-- Drop duplicate select policies (redundant with "Authenticated users can view ...")
DROP POLICY IF EXISTS "volunteers_select" ON volunteers;
DROP POLICY IF EXISTS "volunteer_class_assignments_select" ON volunteer_class_assignments;
DROP POLICY IF EXISTS "volunteer_general_assignments_select" ON volunteer_general_assignments;
