-- CRUD standard (MYK9-922): "not found" and "permission denied" get different
-- SQLSTATEs on every soft-delete RPC.
--
-- WHY
--
--   soft_delete_show/trial/class/entry raised 42501 for BOTH "the row is gone"
--   and "you may not delete it", and soft_delete_dog folded the two into one
--   message ("Dog not found or permission denied"). The client had to guess
--   from message text and guessed wrong both ways: a refusal read as "already
--   deleted" purged a live dog from the device, and a record another device had
--   already deleted read as forbidden and blocked a whole bulk delete.
--
-- THE CONTRACT (this migration, and delete_preview in 20261001233700)
--
--   * The target row does not exist, or is already soft-deleted:
--       SQLSTATE P0002 (no_data_found), message "<Object> not found or already
--       deleted".
--   * The row exists and is live, but the caller may not delete it:
--       SQLSTATE 42501, message "Permission denied" (never "not found").
--   * Every other code is unchanged: MK010 (paid/scored guard), MK011 (club has
--     shows), MK002 (dog has paid/scored entries), the p_override gate.
--
--   Existence is checked on its own, BEFORE the permission gate, with the same
--   "live row" predicate each function already used. Who may delete an existing
--   live row is exactly what it was: each gate below is copied unchanged. The
--   only callers who now learn something new are signed-in callers asking about
--   a row that does not exist or is deleted (owner decision on MYK9-922: every
--   caller is authenticated and already holds the item in its cache).
--
--   restore_* already raise P0002 for "not found or not deleted" and 42501 for
--   permission (20261001214300), so they are not replaced here; the behavioral
--   test asserts their codes alongside these. force_delete_dog (site-admin only)
--   already raises P0002 for a missing or deleted dog and is not changed.
--
-- SOURCES (LESSONS replace-function-latest): each body is copied from the latest
-- migration that defines it, checked against pg_get_functiondef on the live
-- database before editing:
--   soft_delete_show/class/trial/entry/club  20261001214300
--   soft_delete_dog                          20260926174500 (search_path stays 'public')
--   soft_delete_person                       20260804150000
--
-- CREATE OR REPLACE keeps each function's owner and ACL; the behavioral test
-- asserts both, plus SECURITY DEFINER and search_path.

BEGIN;

-- ---------------------------------------------------------------------------
-- soft_delete_show
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_show(p_show_id uuid, p_override boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_club_id UUID;
  v_show_exists BOOLEAN := FALSE;
  v_rows_affected INT;
  v_blocked INT;
  v_now TIMESTAMPTZ := NOW();
  v_user_id UUID := auth.uid();
BEGIN
  SELECT s.club_id, TRUE
  INTO v_club_id, v_show_exists
  FROM public.shows s
  WHERE s.id = p_show_id
    AND s.deleted_at IS NULL;

  IF NOT COALESCE(v_show_exists, FALSE) THEN
    RAISE EXCEPTION 'Show not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (v_club_id IS NOT NULL AND (SELECT public.is_club_admin(v_club_id)))
    OR (v_club_id IS NOT NULL AND (SELECT public.is_trial_secretary(v_club_id)))
    OR (SELECT public.is_site_admin())
    OR (SELECT public.is_platform_admin())
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_override_allowed(p_override);

  -- Entries FIRST, and the guard is the RETURNING of this very statement: it
  -- judges exactly the rows being tombstoned, including one a concurrent
  -- transaction committed just before the statement's snapshot or updated while
  -- it ran (EvalPlanQual re-reads the updated row). A raise rolls everything back.
  WITH tombstoned AS (
    UPDATE public.entries e
    SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
    WHERE e.deleted_at IS NULL
      AND (
        e.show_id = p_show_id
        OR e.class_id IN (
          SELECT c.id FROM public.classes c
          JOIN public.trials t ON c.trial_id = t.id
          WHERE t.show_id = p_show_id
        )
      )
    RETURNING private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status) AS blocking
  )
  SELECT count(*) FILTER (WHERE blocking) INTO v_blocked FROM tombstoned;
  PERFORM private.raise_if_blocked('show', v_blocked, p_override);

  UPDATE public.classes
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE trial_id IN (
    SELECT id FROM public.trials WHERE show_id = p_show_id
  )
  AND deleted_at IS NULL;

  UPDATE public.trials
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE show_id = p_show_id
  AND deleted_at IS NULL;

  UPDATE public.shows
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE id = p_show_id
  AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  -- A concurrent delete between the existence check and here.
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Show not found or already deleted' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- soft_delete_class
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_class(p_class_id uuid, p_override boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_trial_id UUID;
  v_blocked INT;
  v_now TIMESTAMPTZ := NOW();
  v_user_id UUID := auth.uid();
BEGIN
  -- Resolve the parent trial. Returning NULL distinguishes "row gone" from
  -- "row not visible" once we run with SECURITY DEFINER (which bypasses
  -- the caller's RLS).
  SELECT c.trial_id INTO v_trial_id
  FROM public.classes c
  WHERE c.id = p_class_id AND c.deleted_at IS NULL;

  IF v_trial_id IS NULL THEN
    RAISE EXCEPTION 'Class not found or already deleted'
      USING ERRCODE = 'P0002';
  END IF;

  -- Permission check matches `classes_delete` RLS (migration 038):
  -- platform admin, or someone who can manage this trial.
  IF NOT (
    (SELECT public.is_platform_admin())
    OR (SELECT public.can_manage_trial(v_trial_id))
  ) THEN
    RAISE EXCEPTION 'Permission denied'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_override_allowed(p_override);

  -- Entries first; the guard is this statement's RETURNING (see soft_delete_show).
  WITH tombstoned AS (
    UPDATE public.entries e
    SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
    WHERE e.class_id = p_class_id
      AND e.deleted_at IS NULL
    RETURNING private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status) AS blocking
  )
  SELECT count(*) FILTER (WHERE blocking) INTO v_blocked FROM tombstoned;
  PERFORM private.raise_if_blocked('class', v_blocked, p_override);

  UPDATE public.classes
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE id = p_class_id
    AND deleted_at IS NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- soft_delete_trial
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_trial(p_trial_id uuid, p_override boolean DEFAULT false)
 RETURNS TABLE(id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_show_id uuid;
  v_name text;
  v_blocked integer;
  v_now timestamptz := now();
  v_user_id uuid := auth.uid();
BEGIN
  SELECT t.show_id, t.name INTO v_show_id, v_name
  FROM public.trials t
  WHERE t.id = p_trial_id AND t.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trial not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  -- Matches trials_update RLS.
  IF NOT (SELECT public.can_manage_show(v_show_id)) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_override_allowed(p_override);

  -- One stamp across the cascade, entries first; the guard is this statement's
  -- RETURNING (see soft_delete_show).
  WITH tombstoned AS (
    UPDATE public.entries e
    SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
    WHERE e.deleted_at IS NULL
      AND (
        e.trial_id = p_trial_id
        OR e.class_id IN (SELECT c.id FROM public.classes c WHERE c.trial_id = p_trial_id)
      )
    RETURNING private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status) AS blocking
  )
  SELECT count(*) FILTER (WHERE blocking) INTO v_blocked FROM tombstoned;
  PERFORM private.raise_if_blocked('trial', v_blocked, p_override);

  UPDATE public.classes c
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE c.trial_id = p_trial_id AND c.deleted_at IS NULL;

  UPDATE public.trials t
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE t.id = p_trial_id AND t.deleted_at IS NULL;

  RETURN QUERY SELECT p_trial_id, v_name;
END;
$function$;

-- ---------------------------------------------------------------------------
-- soft_delete_entry
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_entry(p_entry_id uuid, p_override boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_show_id uuid;
  v_found boolean;
  v_version integer;
  v_blocking boolean;
  v_now timestamptz := now();
BEGIN
  -- show_id is populated on every live row today; the fallback through the
  -- class chain keeps an entry that ever lacks it from being undeletable.
  SELECT COALESCE(e.show_id, t.show_id), TRUE INTO v_show_id, v_found
  FROM public.entries e
  LEFT JOIN public.classes c ON c.id = e.class_id
  LEFT JOIN public.trials t ON t.id = COALESCE(e.trial_id, c.trial_id)
  WHERE e.id = p_entry_id AND e.deleted_at IS NULL;

  IF NOT COALESCE(v_found, FALSE) THEN
    RAISE EXCEPTION 'Entry not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  -- Matches entries_update RLS.
  IF NOT (SELECT public.can_manage_show(v_show_id)) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_override_allowed(p_override);

  -- The guard is this statement's RETURNING (see soft_delete_show): the row is
  -- judged as the UPDATE actually read it, after any concurrent payment or score.
  WITH tombstoned AS (
    UPDATE public.entries e
    SET deleted_at = v_now, deleted_by = (SELECT auth.uid()), updated_at = v_now
    WHERE e.id = p_entry_id AND e.deleted_at IS NULL
    RETURNING e.version AS version, private.is_blocking_entry(e.payment_status, e.is_scored, e.scoring_completed_at, e.result_status) AS blocking
  )
  SELECT t.version, t.blocking INTO v_version, v_blocking FROM tombstoned t;

  -- A concurrent delete between the existence check and here.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  PERFORM private.raise_if_blocked('entry', CASE WHEN v_blocking THEN 1 ELSE 0 END, p_override);

  RETURN v_version;
END;
$function$;

-- ---------------------------------------------------------------------------
-- soft_delete_club: existence now comes before the site-admin gate, so a
-- missing club reads as P0002 for every caller. The gate is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_club(p_club_id uuid)
 RETURNS TABLE(id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_name text;
  v_found boolean;
  v_now timestamptz := now();
BEGIN
  SELECT c.name, TRUE INTO v_name, v_found
  FROM public.clubs c
  WHERE c.id = p_club_id AND c.deleted_at IS NULL;

  IF NOT COALESCE(v_found, FALSE) THEN
    RAISE EXCEPTION 'Club not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.shows s
    WHERE s.club_id = p_club_id AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This club still has shows. Delete or move its shows first.'
      USING ERRCODE = 'MK011';
  END IF;

  UPDATE public.clubs c
  SET deleted_at = v_now, deleted_by = (SELECT auth.uid()), updated_at = v_now
  WHERE c.id = p_club_id AND c.deleted_at IS NULL;

  RETURN QUERY SELECT p_club_id, v_name;
END;
$function$;

-- ---------------------------------------------------------------------------
-- soft_delete_dog: the UPDATE keeps its permission predicate untouched; when it
-- matches nothing, a second read of the LIVE row alone tells "gone" (P0002)
-- from "not yours" (42501). search_path stays 'public' as on live.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_dog(p_dog_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_person_id UUID;
  v_rows_affected INT;
  v_waitlist_class_ids UUID[];
BEGIN
  SELECT get_my_person_id() INTO v_person_id;

  UPDATE dogs
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE
    id = p_dog_id
    AND deleted_at IS NULL
    AND (
      owner_id = v_person_id
      OR co_owner_id = v_person_id
      OR (SELECT is_platform_admin())
    );

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM dogs d WHERE d.id = p_dog_id AND d.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Dog not found or already deleted' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  -- Refuse over money or results, BEFORE any cascade runs. Placed after the
  -- permission gate so an unauthorised caller still gets 42501 and learns
  -- nothing about the dog's entries. The RAISE aborts the function's
  -- transaction, so the UPDATE above is rolled back with it.
  --
  -- MYK9-822: the predicate itself now lives in
  -- private.count_dog_blocking_entries, shared with the count RPC the client
  -- pre-check calls, so the two cannot drift apart again.
  IF (SELECT private.count_dog_blocking_entries(p_dog_id)) > 0 THEN
    RAISE EXCEPTION
      'This dog has paid or scored entries. Scratch or refund them before deleting.'
      USING ERRCODE = 'MK002';
  END IF;

  -- Cascade: soft-delete the dog's live entries so a deleted dog leaves no live
  -- entries behind in rosters/scoring.
  UPDATE entries
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE
    dog_id = p_dog_id
    AND deleted_at IS NULL;

  -- Cascade: clear any pre-checkout cart items for the dog (no soft-delete
  -- column; NO ACTION FK would otherwise orphan them).
  DELETE FROM entry_cart_items WHERE dog_id = p_dog_id;

  -- DELIBERATELY NOT TOUCHING armbands. See 20260830190000's header: releasing
  -- the row bought almost nothing and required three reclaim sites to undo it.
  -- A deleted dog keeps its number. Do not re-add this without re-reading that.

  -- Cascade: drop the dog off every waitlist it is queued on, so it cannot be
  -- promoted into a live entry after deletion, THEN close the hole that leaves.
  SELECT array_agg(DISTINCT class_id)
  INTO v_waitlist_class_ids
  FROM waitlist_entries
  WHERE dog_id = p_dog_id;

  DELETE FROM waitlist_entries WHERE dog_id = p_dog_id;

  PERFORM public.resequence_class_waitlist(v_waitlist_class_ids);
END;
$function$;

-- ---------------------------------------------------------------------------
-- soft_delete_person: existence now comes before the gate, so a missing or
-- deleted person reads as P0002 for every caller. The gate is unchanged.
-- ---------------------------------------------------------------------------
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
  IF NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_person_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

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

  -- A concurrent delete between the existence check and here.
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

-- Grants restated exactly as they stand on live (CREATE OR REPLACE already
-- keeps them): signed-in callers and service_role, never anon or PUBLIC.
REVOKE ALL ON FUNCTION public.soft_delete_show(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_class(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_trial(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_entry(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_club(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_dog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_person(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.soft_delete_show(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_class(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_trial(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_entry(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_club(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_dog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_person(uuid) TO authenticated, service_role;

COMMIT;
