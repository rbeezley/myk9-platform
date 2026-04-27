-- =============================================================================
-- Migration 165: soft_delete_class RPC with entries cascade
-- =============================================================================
-- Replaces the application-layer cascade in `classQueries.ts:deleteClass`
-- (added 2026-04-27) with a single SECURITY DEFINER function so the class
-- and its entries are wiped atomically. The app-layer version was a real
-- improvement over the prior orphan state, but it could still leave entries
-- soft-deleted while the class itself survived if the client crashed mid-call
-- or RLS asymmetry let one update through but not the other.
--
-- Mirrors the pattern of `soft_delete_show` (migration 037). Permission check
-- mirrors the `classes_update` / `classes_delete` policies (migration 038):
-- caller must satisfy `can_manage_trial(trial_id)` for the class's parent
-- trial, or be a platform admin.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.soft_delete_class(p_class_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_user_id UUID := auth.uid();
BEGIN
  -- Resolve the parent trial. Returning NULL distinguishes "row gone" from
  -- "row not visible" once we run with SECURITY DEFINER (which bypasses
  -- the caller's RLS).
  SELECT trial_id INTO v_trial_id
  FROM classes
  WHERE id = p_class_id AND deleted_at IS NULL;

  IF v_trial_id IS NULL THEN
    RAISE EXCEPTION 'Class not found or already deleted'
      USING ERRCODE = '42501';
  END IF;

  -- Permission check matches `classes_delete` RLS (migration 038):
  -- platform admin, or someone who can manage this trial.
  IF NOT (
    (SELECT is_platform_admin())
    OR (SELECT can_manage_trial(v_trial_id))
  ) THEN
    RAISE EXCEPTION 'Permission denied'
      USING ERRCODE = '42501';
  END IF;

  -- Cascade soft delete in reverse FK order: entries → class.

  -- 1. Soft delete entries pointing at this class.
  UPDATE entries
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE class_id = p_class_id
    AND deleted_at IS NULL;

  -- 2. Soft delete the class itself.
  UPDATE classes
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE id = p_class_id
    AND deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.soft_delete_class(UUID) IS
  'Soft-deletes a class and all of its entries in a single transaction. '
  'Authorization mirrors `classes_delete` RLS (migration 038): platform '
  'admin or `can_manage_trial(trial_id)` for the class''s parent trial. '
  'Replaces the two-step app-layer cascade in classQueries.deleteClass.';

GRANT EXECUTE ON FUNCTION public.soft_delete_class(UUID) TO authenticated;
