-- Fix soft_delete_show for admin-created draft shows with no club_id.
--
-- The CRUD discovery proof creates draft shows as a site admin without a club.
-- The previous RPC treated NULL club_id as "not found", even though site admins
-- are allowed to manage platform-level draft shows.

CREATE OR REPLACE FUNCTION public.soft_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_show_exists BOOLEAN := FALSE;
  v_rows_affected INT;
  v_now TIMESTAMPTZ := NOW();
  v_user_id UUID := auth.uid();
BEGIN
  SELECT club_id, TRUE
  INTO v_club_id, v_show_exists
  FROM shows
  WHERE id = p_show_id
    AND deleted_at IS NULL;

  IF NOT COALESCE(v_show_exists, FALSE) THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    (v_club_id IS NOT NULL AND (SELECT is_club_admin(v_club_id)))
    OR (v_club_id IS NOT NULL AND (SELECT is_trial_secretary(v_club_id)))
    OR (SELECT is_site_admin())
    OR (SELECT is_platform_admin())
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE entries
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE class_id IN (
    SELECT c.id FROM classes c
    JOIN trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  )
  AND deleted_at IS NULL;

  UPDATE classes
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE trial_id IN (
    SELECT id FROM trials WHERE show_id = p_show_id
  )
  AND deleted_at IS NULL;

  UPDATE trials
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE show_id = p_show_id
  AND deleted_at IS NULL;

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

GRANT EXECUTE ON FUNCTION public.soft_delete_show(UUID) TO authenticated;

COMMENT ON FUNCTION public.soft_delete_show(UUID) IS
  'Soft-deletes a show and children after checking club-scoped manager or site-admin permission; supports admin drafts without club_id.';
