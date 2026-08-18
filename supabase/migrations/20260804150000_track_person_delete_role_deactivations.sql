-- Track which inactive role grants were disabled by a person's removal.
--
-- Restore remains intentionally role-neutral: an admin must deliberately
-- re-grant access after restoring a person. The timestamp is historical
-- provenance for removed-person records, not a signal to reactivate access.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Keep the existing removal authorization and security boundary, while
-- stamping only the active grants this removal actually disables.
CREATE OR REPLACE FUNCTION public.soft_delete_person(p_person_id uuid)
RETURNS SETOF public.people
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz := NOW();
  v_rows int;
BEGIN
  IF NOT (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show_person(p_person_id))
    OR EXISTS (
      SELECT 1 FROM public.people
      WHERE id = p_person_id
        AND auth_user_id = (SELECT auth.uid())
        AND deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.people
  SET deleted_at = v_deleted_at, deleted_by = auth.uid(), updated_at = NOW()
  WHERE id = p_person_id AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Person not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.user_roles
  SET is_active = false, deactivated_at = v_deleted_at
  WHERE user_id = p_person_id AND is_active;

  RETURN QUERY SELECT * FROM public.people WHERE id = p_person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_person(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_person(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_person(uuid) TO authenticated;
