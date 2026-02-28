-- =============================================================================
-- Migration 037: Extend soft_delete_show to cascade to trials, classes, entries
-- =============================================================================
-- Replaces the function from migration 036 with a version that soft-deletes
-- all child records in a single transaction:
--   show → trials → classes → entries
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
  v_now TIMESTAMPTZ := NOW();
  v_user_id UUID := auth.uid();
BEGIN
  -- Get club_id from the show
  SELECT club_id INTO v_club_id FROM shows WHERE id = p_show_id AND deleted_at IS NULL;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = '42501';
  END IF;

  -- Permission check: club_admin, trial_secretary, or platform_admin
  IF NOT (
    (SELECT is_club_admin(v_club_id))
    OR (SELECT is_trial_secretary(v_club_id))
    OR (SELECT is_platform_admin())
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  -- Cascade soft delete in reverse FK order: entries → classes → trials → show

  -- 1. Soft delete entries (via class_id → trial_id → show_id chain)
  UPDATE entries
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE class_id IN (
    SELECT c.id FROM classes c
    JOIN trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  )
  AND deleted_at IS NULL;

  -- 2. Soft delete classes
  UPDATE classes
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE trial_id IN (
    SELECT id FROM trials WHERE show_id = p_show_id
  )
  AND deleted_at IS NULL;

  -- 3. Soft delete trials
  UPDATE trials
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE show_id = p_show_id
  AND deleted_at IS NULL;

  -- 4. Soft delete the show itself
  UPDATE shows
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE id = p_show_id
  AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Show not found or already deleted' USING ERRCODE = '42501';
  END IF;
END;
$$;
