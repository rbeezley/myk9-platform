-- =============================================================================
-- Migration 036: Add soft_delete_show RPC function
-- =============================================================================
-- Problem: The shows UPDATE RLS policy has no explicit WITH CHECK clause,
-- so setting deleted_at = now() fails the implicit check (same issue as dogs
-- in migration 028).
--
-- Solution: SECURITY DEFINER RPC that bypasses RLS for the soft delete UPDATE,
-- with its own permission checks (club admin or platform admin).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.soft_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_rows_affected INT;
BEGIN
  -- Get club_id from the show
  SELECT club_id INTO v_club_id FROM shows WHERE id = p_show_id AND deleted_at IS NULL;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = '42501';
  END IF;

  -- Soft delete if user is club_admin, trial_secretary, or platform_admin
  UPDATE shows
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE
    id = p_show_id
    AND deleted_at IS NULL
    AND (
      (SELECT is_club_admin(v_club_id))
      OR (SELECT is_trial_secretary(v_club_id))
      OR (SELECT is_platform_admin())
    );

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Show not found or permission denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Grant execute to authenticated users (RPC handles its own permission checks)
GRANT EXECUTE ON FUNCTION public.soft_delete_show(UUID) TO authenticated;
