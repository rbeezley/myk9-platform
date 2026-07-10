-- Allow a signed-in user to soft-delete their OWN person row (self-service
-- account deletion from the Account page), in addition to the existing
-- admin/show-manager paths.
--
-- Why: AccountPage's DeleteSection calls deleteUser(person.id) ->
-- soft_delete_person, but the RPC's authorization only accepted
-- is_site_admin() or can_manage_show_person(), so a plain exhibitor deleting
-- their own account got 42501. Extending the existing RPC (not adding a
-- parallel one) keeps a single delete path so the owns-dogs guard trigger
-- (prevent_person_soft_delete_with_dogs, MK001) and deleted_by stamping stay
-- shared across all callers.
--
-- The self clause requires deleted_at IS NULL so an already-tombstoned row
-- cannot be used to re-authorize, and matches on people.auth_user_id =
-- auth.uid() (NULL auth.uid() -> no match, so anon is still denied).

CREATE OR REPLACE FUNCTION public.soft_delete_person(p_person_id uuid)
RETURNS SETOF public.people
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  -- Site admin, a manager of a show this person is entered in, or the person
  -- themself (self-service account deletion).
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
