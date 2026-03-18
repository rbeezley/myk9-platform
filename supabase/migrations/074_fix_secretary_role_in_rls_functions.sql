-- =============================================================================
-- Migration 074: Fix is_trial_secretary() to use renamed 'secretary' role
--
-- Migration 066 renamed the 'trial_secretary' role to 'secretary' but did not
-- update the is_trial_secretary() helper function used by RLS policies on
-- trials and classes tables. This caused all secretary INSERT/UPDATE/DELETE
-- operations on trials and classes to be silently blocked by RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION is_trial_secretary(check_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name IN ('secretary', 'trial_secretary')
      AND ur.is_active = true
      AND (check_club_id IS NULL OR ur.club_id = check_club_id OR ur.club_id IS NULL)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;
