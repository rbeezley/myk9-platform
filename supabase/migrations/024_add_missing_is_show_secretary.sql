-- =============================================================================
-- Migration 024: Add Missing is_show_secretary() Function
-- =============================================================================
-- Migration 020 references is_show_secretary() in people INSERT/UPDATE policies
-- but the function was never defined. In the RBAC system, the role is called
-- "trial_secretary" (migration 009). This creates is_show_secretary() as a
-- thin wrapper around is_trial_secretary() to fix the broken policies.
--
-- Affected policies (from migration 020):
--   - people_insert: WITH CHECK (... OR is_show_secretary() ...)
--   - people_update: USING/WITH CHECK (... OR is_show_secretary() ...)
--
-- Without this fix, any INSERT/UPDATE on people that falls through to the
-- is_show_secretary() check would fail with "function does not exist".
--
-- ROLLBACK: DROP FUNCTION IF EXISTS is_show_secretary();
-- =============================================================================

CREATE OR REPLACE FUNCTION is_show_secretary()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.is_trial_secretary();
$$;

COMMENT ON FUNCTION is_show_secretary() IS
  'Alias for is_trial_secretary(). Show secretary and trial secretary are the same RBAC role.';

GRANT EXECUTE ON FUNCTION is_show_secretary() TO authenticated;

-- =============================================================================
SELECT 'Migration 024: is_show_secretary() function added' as status;
