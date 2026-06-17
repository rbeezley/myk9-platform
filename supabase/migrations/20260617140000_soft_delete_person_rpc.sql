-- Soft-delete a person via a SECURITY DEFINER RPC.
--
-- Why: a direct `UPDATE people SET deleted_at = NOW()` is rejected with "new row
-- violates row-level security policy for table people". PostgreSQL enforces a
-- table's SELECT policy as an implicit WITH CHECK on an UPDATE's new row (so you
-- can't update a row into a state you can't see), and `people_select` requires
-- `deleted_at IS NULL` — so the instant the new row carries a deleted_at, it fails
-- that check. dogs/shows/classes avoid this because their soft-delete already goes
-- through SECURITY DEFINER RPCs (soft_delete_dog/show/class); people was the only
-- entity still soft-deleting via a direct client UPDATE, so it was the only one
-- broken. This brings people in line.
--
-- SECURITY DEFINER runs as the owner (postgres, a superuser) which bypasses RLS
-- (including FORCE RLS), exactly like the sibling soft_delete_* functions. The
-- owns-dogs guard trigger (prevent_person_soft_delete_with_dogs, migration
-- 20260617130000) still fires on the UPDATE inside this function and raises MK001
-- if the person owns live dogs — the guard is preserved, not bypassed.

CREATE OR REPLACE FUNCTION public.soft_delete_person(p_person_id uuid)
RETURNS SETOF public.people
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  -- Mirror people_update_privileged: site admin, or a manager of a show this
  -- person is entered in.
  IF NOT (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show_person(p_person_id))
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.people
  SET deleted_at = NOW(), deleted_by = auth.uid(), updated_at = NOW()
  WHERE id = p_person_id AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Person not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY SELECT * FROM public.people WHERE id = p_person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_person(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_person(uuid) TO authenticated;
