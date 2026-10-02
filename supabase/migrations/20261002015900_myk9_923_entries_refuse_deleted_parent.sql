-- MYK9-923: an entry can no longer be created, re-parented or restored under a
-- soft-deleted class, trial or show.
--
-- WHY
--
--   entries_insert (RLS) checks only can_manage_show(show_id), and no entry
--   writer checked the parent's deleted_at: submit_show_entries,
--   create_online_paid_entry, the walk-up/desk insert (a direct INSERT through
--   the replication queue), a class change (a direct UPDATE of class_id) and
--   restore_dog all wrote happily under a deleted parent. Such an entry is
--   invisible in most lists, still counts wherever a read does not join through
--   the parent, and a later restore of the parent can double-count it. The
--   soft-delete cascade tombstones the entries it sees at statement start, so an
--   insert that commits during or after the delete is never touched.
--
-- WHAT THIS CHANGES
--
--  1. ONE PREDICATE  private.entry_deleted_parent(class, trial, show) returns
--     'show', 'trial' or 'class' for the topmost deleted ancestor (the class's
--     own trial and that trial's show are checked as well as the entry's own
--     trial_id/show_id), or NULL. It locks each ancestor FOR KEY SHARE, top-down
--     (show, trial, class), and reads deleted_at from the locked row version.
--
--  2. TRIGGERS ON entries  (the guard is in the table, so every writer is
--     covered, including the replication queue's direct INSERT/UPDATE and the
--     SECURITY DEFINER RPCs):
--       entries_00_refuse_deleted_parent         BEFORE INSERT, live rows only
--       trg_01_entries_refuse_deleted_parent     BEFORE UPDATE OF class_id,
--         trial_id, show_id, deleted_at, when the row is live afterwards AND it
--         was deleted before (a restore) or changed parent (a transfer).
--     A refusal is SQLSTATE MK014 ("This class has been deleted, so it can no
--     longer take entries."), or MK013 ("Restore the class first") when the
--     write is a restore, matching the restore_* RPCs. An ordinary update of an
--     existing row (scoring, check-in) does not fire it.
--     The INSERT trigger runs before the payment/registration triggers
--     (alphabetical BEFORE order) so the refusal names the real problem; the
--     UPDATE trigger sorts after trg_00_block_direct_soft_delete, so a client's
--     direct un-delete still reads as the 42501 that trigger raises.
--     An INSERT whose id already exists is passed through: it cannot create a
--     row, and the replication queue treats the resulting 23505 on a replayed
--     insert as "my earlier attempt committed".
--
--  3. THE RACE  soft_delete_show / _trial / _class now take FOR UPDATE on the
--     row they delete before the cascade (the existence SELECT gains FOR
--     UPDATE; nothing else in the bodies changes). FOR UPDATE conflicts with
--     the trigger's FOR KEY SHARE, so:
--       * an entry insert that locked the parent first finishes before the
--         delete's cascade statement starts, and the cascade (which takes a new
--         snapshot) tombstones it and judges it with the MK010 money guard;
--       * an insert that arrives after the delete locked the parent waits for
--         the delete to commit, then reads the committed deleted_at and refuses.
--     FOR KEY SHARE (not FOR SHARE) is deliberate: it does not conflict with an
--     ordinary UPDATE of the class/trial/show (status, counts), so two
--     concurrent inserts into one class, whose AFTER triggers both update that
--     class, cannot deadlock on it. It is the same lock the entries foreign keys
--     already take, only earlier.
--
--  4. restore_entry  now refuses (MK013) under a deleted trial or show as well
--     as a deleted class, naming the topmost one ("Restore the show first"),
--     through the same predicate. The dog check is unchanged.
--
--  5. restore_dog  no longer brings back an entry whose class, trial or show is
--     deleted (it would now be refused, rolling back the whole dog restore).
--     Such an entry stays tombstoned, exactly as restore_show/_trial/_class
--     leave behind an entry whose dog is still deleted.
--
-- LIVE SURVEY (read-only, 2026-10-02): 0 of 43 live entries sit under a deleted
-- class, trial or show (by the entry's own ids and through class -> trial ->
-- show), so the new triggers reject no existing row and no cleanup is needed.
--
-- SOURCES (LESSONS replace-function-latest), each checked identical to
-- pg_get_functiondef on live before editing:
--   soft_delete_show / _class / _trial  20261001235300_crud_standard_delete_not_found_code.sql
--   restore_entry / restore_dog         20261001214300_crud_standard_soft_delete_restore_rpcs.sql
-- CREATE OR REPLACE keeps each function's owner (postgres), SECURITY DEFINER,
-- empty search_path and ACL; the behavioral test asserts all four.
--
-- Error codes (existing: MK001-MK006, MK010, MK011, MK013, MK490, MK571, MK685,
-- MK781):
--   MK014  entry refused: its class, trial or show is deleted
--
-- Behavioral coverage: supabase/tests/myk9_923_entries_refuse_deleted_parent_test.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The predicate
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: its only callers are the SECURITY DEFINER trigger function
-- and RPCs below, which run as postgres (RLS would otherwise hide a deleted
-- parent from a secretary and make it read as "no parent", i.e. live).
CREATE OR REPLACE FUNCTION private.entry_deleted_parent(
  p_class_id uuid,
  p_trial_id uuid,
  p_show_id uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_class_trial_id uuid;
  v_class_deleted boolean := false;
  v_trial_ids uuid[];
  v_show_ids uuid[];
  v_trial_deleted boolean;
  v_show_deleted boolean;
BEGIN
  -- Resolve the ancestry (the class's trial, every trial's show) without
  -- locking, then lock top-down: show, trial, class.
  IF p_class_id IS NOT NULL THEN
    SELECT c.trial_id INTO v_class_trial_id FROM public.classes c WHERE c.id = p_class_id;
  END IF;

  v_trial_ids := array_remove(ARRAY[p_trial_id, v_class_trial_id], NULL);

  SELECT array_agg(DISTINCT t.show_id) FILTER (WHERE t.show_id IS NOT NULL)
  INTO v_show_ids
  FROM public.trials t
  WHERE t.id = ANY (v_trial_ids);

  v_show_ids := array_remove(COALESCE(v_show_ids, '{}'::uuid[]) || p_show_id, NULL);

  -- Lock and read, top-down. The locking SELECT returns the newest committed
  -- version of a row a concurrent soft delete held FOR UPDATE.
  SELECT COALESCE(bool_or(locked.deleted_at IS NOT NULL), false) INTO v_show_deleted
  FROM (
    SELECT s.deleted_at FROM public.shows s
    WHERE s.id = ANY (v_show_ids)
    ORDER BY s.id
    FOR KEY SHARE
  ) locked;
  IF v_show_deleted THEN
    RETURN 'show';
  END IF;

  SELECT COALESCE(bool_or(locked.deleted_at IS NOT NULL), false) INTO v_trial_deleted
  FROM (
    SELECT t.deleted_at FROM public.trials t
    WHERE t.id = ANY (v_trial_ids)
    ORDER BY t.id
    FOR KEY SHARE
  ) locked;
  IF v_trial_deleted THEN
    RETURN 'trial';
  END IF;

  IF p_class_id IS NOT NULL THEN
    SELECT c.deleted_at IS NOT NULL INTO v_class_deleted
    FROM public.classes c
    WHERE c.id = p_class_id
    FOR KEY SHARE;
    IF COALESCE(v_class_deleted, false) THEN
      RETURN 'class';
    END IF;
  END IF;

  -- A parent that does not exist is not "deleted": the foreign key refuses it.
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.entry_deleted_parent(uuid, uuid, uuid) IS
  'MYK9-923: the topmost soft-deleted ancestor (show, trial or class) of an entry '
  'with these ids, or NULL. Locks each ancestor FOR KEY SHARE, top-down, so a '
  'concurrent soft_delete_* (which takes FOR UPDATE first) is serialized against it.';

-- The table guard. SECURITY DEFINER so the predicate sees deleted parents the
-- caller's RLS would hide.
CREATE OR REPLACE FUNCTION private.entries_refuse_deleted_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- A replayed insert of a row that already exists cannot create anything; let
  -- the primary key answer it (the replication queue reads that 23505 as
  -- "the earlier attempt committed").
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.entries e WHERE e.id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_parent := private.entry_deleted_parent(NEW.class_id, NEW.trial_id, NEW.show_id);
  IF v_parent IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Restore the % first', v_parent
      USING ERRCODE = 'MK013',
            DETAIL = format('entry_id=%s deleted_parent=%s', NEW.id, v_parent);
  END IF;

  RAISE EXCEPTION 'This % has been deleted, so it can no longer take entries.', v_parent
    USING ERRCODE = 'MK014',
          DETAIL = format('entry_id=%s deleted_parent=%s', NEW.id, v_parent);
END;
$$;

COMMENT ON FUNCTION private.entries_refuse_deleted_parent() IS
  'MYK9-923: refuses (MK014) a live entry inserted or moved under a deleted class, '
  'trial or show, and (MK013) one restored under one. Fires on every writer.';

REVOKE ALL ON FUNCTION private.entry_deleted_parent(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.entries_refuse_deleted_parent()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS entries_00_refuse_deleted_parent ON public.entries;
CREATE TRIGGER entries_00_refuse_deleted_parent
  BEFORE INSERT ON public.entries
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION private.entries_refuse_deleted_parent();

DROP TRIGGER IF EXISTS trg_01_entries_refuse_deleted_parent ON public.entries;
CREATE TRIGGER trg_01_entries_refuse_deleted_parent
  BEFORE UPDATE OF class_id, trial_id, show_id, deleted_at ON public.entries
  FOR EACH ROW
  WHEN (
    NEW.deleted_at IS NULL
    AND (
      OLD.deleted_at IS NOT NULL
      OR OLD.class_id IS DISTINCT FROM NEW.class_id
      OR OLD.trial_id IS DISTINCT FROM NEW.trial_id
      OR OLD.show_id IS DISTINCT FROM NEW.show_id
    )
  )
  EXECUTE FUNCTION private.entries_refuse_deleted_parent();

-- ---------------------------------------------------------------------------
-- 2. soft_delete_show / _class / _trial: lock the row before the cascade.
--    Bodies copied from 20261001235300; only the FOR UPDATE lines are new.
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
    AND s.deleted_at IS NULL
  -- MYK9-923: lock the show before the cascade; an entry insert holds it FOR KEY SHARE.
  FOR UPDATE;

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
  WHERE c.id = p_class_id AND c.deleted_at IS NULL
  -- MYK9-923: lock the class before the cascade; an entry insert holds it FOR KEY SHARE.
  FOR UPDATE;

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
  WHERE t.id = p_trial_id AND t.deleted_at IS NULL
  -- MYK9-923: lock the trial before the cascade; an entry insert holds it FOR KEY SHARE.
  FOR UPDATE;

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
-- 3. restore_entry: refuse under a deleted class, trial or show (MK013).
--    Body copied from 20261001214300; the parent check is the only change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_entry(p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deleted_at timestamptz;
  v_deleted_by uuid;
  v_class_id uuid;
  v_trial_id uuid;
  v_show_id uuid;
  v_dog_id uuid;
  v_parent text;
BEGIN
  SELECT e.deleted_at, e.deleted_by, e.class_id, e.trial_id, e.show_id, e.dog_id
  INTO v_deleted_at, v_deleted_by, v_class_id, v_trial_id, v_show_id, v_dog_id
  FROM public.entries e WHERE e.id = p_entry_id;

  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Entry not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (SELECT public.is_platform_admin())
    OR private.can_undo_soft_delete(v_deleted_by, v_deleted_at)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  -- MYK9-923: the class, its trial and the show, through the one predicate the
  -- entries trigger uses; the topmost deleted one is named.
  v_parent := private.entry_deleted_parent(v_class_id, v_trial_id, v_show_id);
  IF v_parent IS NOT NULL THEN
    RAISE EXCEPTION 'Restore the % first', v_parent USING ERRCODE = 'MK013';
  END IF;

  IF v_dog_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.dogs d WHERE d.id = v_dog_id AND d.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Restore the dog first' USING ERRCODE = 'MK013';
  END IF;

  UPDATE public.entries e
  SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE e.id = p_entry_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. restore_dog: leave an entry under a deleted parent tombstoned.
--    Body copied from 20261001214300; the entries UPDATE gains one predicate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_dog(p_dog_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deleted_at timestamptz;
  v_deleted_by uuid;
  v_placements jsonb;
  v_audit_id uuid;
  v_entries_restored integer;
  v_reapplied integer := 0;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  SELECT d.deleted_at, d.deleted_by INTO v_deleted_at, v_deleted_by
  FROM public.dogs d WHERE d.id = p_dog_id;
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Dog not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (SELECT public.is_platform_admin())
    OR private.can_undo_soft_delete(v_deleted_by, v_deleted_at)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.dogs
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE id = p_dog_id;

  -- MYK9-923: an entry whose class, trial or show is still deleted stays
  -- tombstoned (the entries trigger would refuse it and roll back the restore).
  UPDATE public.entries
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE dog_id = p_dog_id AND deleted_at = v_deleted_at
    AND private.entry_deleted_parent(class_id, trial_id, show_id) IS NULL;
  GET DIAGNOSTICS v_entries_restored = ROW_COUNT;

  -- MYK9-596 item 2. Keyed on the SAME deleted_at as the entry restore above,
  -- through the one shared match rule (MYK9-607 item 2). An ordinary
  -- soft_delete_dog writes no such row, so v_placements is NULL and everything
  -- below is a no-op. (This read relies on the definer owner's BYPASSRLS — see
  -- the dependency note over the INSERT in force_delete_dog.)
  SELECT a.id, a.metadata -> 'placements'
  INTO v_audit_id, v_placements
  FROM public.dog_force_delete_audit(p_dog_id, v_deleted_at) a;

  -- Close the row: this deletion is undone, so the row must never again be
  -- read as describing a later deletion that happens to share its deleted_at
  -- (MYK9-607). Additive — nothing the override recorded is changed.
  IF v_audit_id IS NOT NULL THEN
    UPDATE public.activity_log
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'restored_at', to_jsonb(clock_timestamp()),
      'restored_by', to_jsonb((SELECT auth.uid()))
    )
    WHERE id = v_audit_id;
  END IF;

  IF v_placements IS NOT NULL AND jsonb_typeof(v_placements) = 'array' THEN
    -- One statement, so the conflict check reads the class as it stood before
    -- any re-apply, and no temp table is needed under definer rights.
    WITH candidates AS (
      -- Only an entry that came back with this restore, still in the class the
      -- snapshot names, in a class that is STILL manual. If a human flipped the
      -- class back to derived while the dog was deleted, the trigger owns the
      -- ordering and re-applying a stale rank would fight it.
      SELECT
        e.id AS entry_id,
        c.id AS class_id,
        c.name AS class_name,
        (snapshot.value ->> 'final_placement')::integer AS final_placement,
        -- MYK9-607 item 1: a placement another LIVE entry in the class holds
        -- now was given to it by a human after the delete. That is newer than
        -- the snapshot, so it wins and the restored entry is left unplaced.
        EXISTS (
          SELECT 1
          FROM public.entries other
          WHERE other.class_id = c.id
            AND other.id <> e.id
            AND other.deleted_at IS NULL
            AND other.final_placement = (snapshot.value ->> 'final_placement')::integer
        ) AS taken
      FROM jsonb_array_elements(v_placements) AS snapshot(value)
      JOIN public.entries e
        ON e.id = (snapshot.value ->> 'entry_id')::uuid
      JOIN public.classes c
        ON c.id = (snapshot.value ->> 'class_id')::uuid
      WHERE e.dog_id = p_dog_id
        AND e.deleted_at IS NULL
        AND e.class_id = c.id
        AND c.status_source = 'manual'
    ),
    reapplied AS (
      UPDATE public.entries e
      SET final_placement = cand.final_placement
      FROM candidates cand
      WHERE e.id = cand.entry_id
        AND NOT cand.taken
        AND e.final_placement IS DISTINCT FROM cand.final_placement
      RETURNING e.id
    )
    SELECT
      (SELECT count(*)::integer FROM reapplied),
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'entry_id', cand.entry_id,
              'class_id', cand.class_id,
              'class_name', cand.class_name,
              'final_placement', cand.final_placement
            )
            ORDER BY cand.class_name, cand.entry_id
          )
          FROM candidates cand
          WHERE cand.taken
        ),
        '[]'::jsonb
      )
    INTO v_reapplied, v_skipped;
  END IF;

  RETURN jsonb_build_object(
    'dog_id', p_dog_id,
    'entries_restored', v_entries_restored,
    'placements_reapplied', v_reapplied,
    'placements_skipped', v_skipped
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. ACLs, restated as live has them (owner postgres; authenticated and
--    service_role execute; never anon). CREATE OR REPLACE kept them already.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.soft_delete_show(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_class(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_trial(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_entry(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_dog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_show(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_class(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_trial(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_entry(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_dog(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
