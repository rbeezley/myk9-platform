-- Restore (un-delete) RPCs for the entity types whose *_select RLS hides
-- soft-deleted rows from every role: dogs, shows, classes, people.
--
-- Why an RPC and not a direct UPDATE:
--   A client `UPDATE <t> SET deleted_at = NULL WHERE id = X RETURNING ...` matches
--   ZERO rows for these tables. PostgreSQL applies the table's SELECT policy during
--   the UPDATE's row-location step (because the WHERE/RETURNING read columns), and
--   those SELECT policies hard-code `deleted_at IS NULL` as a top-level conjunct
--   with no admin bypass -- so the tombstone is invisible and cannot be located to
--   update. (clubs/entries/trials have no such SELECT block, so their restore via
--   direct UPDATE keeps working and gets no RPC here.)
--
-- SECURITY DEFINER bypasses RLS, mirroring the get_deleted_* read RPCs
-- (migration 20260616140000) and the soft_delete_* cascade functions.
--
-- Cascade-restore: each restore un-deletes exactly the rows the matching
-- soft_delete_* cascade tombstoned, identified by an identical deleted_at
-- timestamp. soft_delete_show/class stamp every cascaded row with a single
-- transaction-frozen NOW(), and soft_delete_dog's two NOW() calls resolve to the
-- same transaction timestamp -- so a cascade always shares one byte-identical
-- deleted_at. Matching on it restores the cascade without touching rows that were
-- deleted independently (their deleted_at differs).
--
-- All four are admin-gated (is_platform_admin); restore is only reachable from the
-- admin Data Lifecycle page.

-- ---------------------------------------------------------------------------
-- restore_dog: clear the dog, then its cascade-deleted entries.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_dog(p_dog_id uuid)
RETURNS SETOF public.dogs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz;
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT deleted_at INTO v_deleted_at FROM public.dogs WHERE id = p_dog_id;
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Dog not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.dogs
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE id = p_dog_id;

  UPDATE public.entries
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE dog_id = p_dog_id AND deleted_at = v_deleted_at;

  RETURN QUERY SELECT * FROM public.dogs WHERE id = p_dog_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- restore_show: clear the show, then its cascade-deleted trials, classes, entries.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_show(p_show_id uuid)
RETURNS SETOF public.shows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz;
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT deleted_at INTO v_deleted_at FROM public.shows WHERE id = p_show_id;
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Show not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.shows
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE id = p_show_id;

  UPDATE public.trials
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE show_id = p_show_id AND deleted_at = v_deleted_at;

  UPDATE public.classes
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE trial_id IN (SELECT id FROM public.trials WHERE show_id = p_show_id)
    AND deleted_at = v_deleted_at;

  UPDATE public.entries
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE class_id IN (
    SELECT c.id FROM public.classes c
    JOIN public.trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  )
  AND deleted_at = v_deleted_at;

  RETURN QUERY SELECT * FROM public.shows WHERE id = p_show_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- restore_class: clear the class, then its cascade-deleted entries.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_class(p_class_id uuid)
RETURNS SETOF public.classes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz;
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT deleted_at INTO v_deleted_at FROM public.classes WHERE id = p_class_id;
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Class not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.classes
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE id = p_class_id;

  UPDATE public.entries
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE class_id = p_class_id AND deleted_at = v_deleted_at;

  RETURN QUERY SELECT * FROM public.classes WHERE id = p_class_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- restore_person: clear the person. Person soft-delete (deleteUser) does not
-- cascade, so there is nothing to cascade-restore.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_person(p_person_id uuid)
RETURNS SETOF public.people
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz;
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT deleted_at INTO v_deleted_at FROM public.people WHERE id = p_person_id;
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Person not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.people
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE id = p_person_id;

  RETURN QUERY SELECT * FROM public.people WHERE id = p_person_id;
END;
$$;

-- Restrict to authenticated callers; the admin gate lives inside each function.
REVOKE ALL ON FUNCTION public.restore_dog(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_show(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_class(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_person(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.restore_dog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_show(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_person(uuid) TO authenticated;
