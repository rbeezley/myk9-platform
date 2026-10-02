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
--     trial_id/show_id), or NULL. Before reading, it takes the SHARED parent
--     gate (below) on each ancestor, top-down: show, trial, class.
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
--  3. THE RACE  An insert that commits while a delete's cascade runs is not
--     tombstoned by it. The parent gate serializes the two: a transaction-scoped
--     advisory lock per parent, key (923, hashtext('<kind>:<id>')), taken
--     through private.entry_parent_gate():
--       * the entries triggers take it SHARED on show, trial and class;
--       * soft_delete_show / _trial / _class take it EXCLUSIVE on their own row
--         as their first statement (the only change in their bodies).
--     An insert that holds the gate first finishes before the delete's
--     existence check and cascade take their snapshots, so the cascade
--     tombstones it and judges it with the MK010 money guard. An insert that
--     arrives after the delete holds the gate waits for the commit, then reads
--     deleted_at in a new snapshot and refuses.
--     WHY ADVISORY AND NOT A ROW LOCK on the show/trial/class: FOR UPDATE on
--     the parent row would also wait on, and block, every foreign-key check
--     against it (armbands, waitlist and payment rows, not only entries) and
--     auto_assign_armband_on_accept's FOR UPDATE of the show. The gate is taken
--     only by entry inserts, parent changes, restores and the three deletes,
--     never by an ordinary entry update, so status, scoring and check-in
--     writes do not touch it.
--     LOCK ORDER: gate before entry rows. The delete takes the gate before its
--     cascade locks entries. move_up_entry (section 5) is the one RPC that
--     locks an entry row (its source, FOR UPDATE) and then inserts; it now
--     takes the target's gates first. A client class change (a direct UPDATE
--     of class_id) necessarily holds the row before its trigger takes the
--     gate; against a concurrent delete of the same parent it can end in a
--     40P01, which the replication queue retries (isRetryableError).

--  4. restore_entry  now refuses (MK013) under a deleted trial or show as well
--     as a deleted class, naming the topmost one ("Restore the show first"),
--     through the same predicate. The dog check is unchanged.
--
--  5. move_up_entry  takes the target class's parent gates before it locks the
--     source entry, so it follows gate-before-entry order (see 3).
--
--  6. restore_dog  no longer brings back an entry whose class, trial or show is
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
--   move_up_entry                       20260918193300_myk9_639_move_up_supersession.sql
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
-- SECURITY INVOKER (both): their only callers are the SECURITY DEFINER trigger
-- function and RPCs below, which run as postgres (RLS would otherwise hide a deleted
-- parent from a secretary and make it read as "no parent", i.e. live).
CREATE OR REPLACE FUNCTION private.entry_parent_gate(
  p_kind text,
  p_id uuid,
  p_exclusive boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;
  -- Two-int4 advisory keys live in a different key space from the one-bigint
  -- pg_advisory_xact_lock(hashtext(show_id)) that auto_assign_armband_on_accept
  -- takes, so the two never contend.
  IF p_exclusive THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(923, pg_catalog.hashtext(p_kind || ':' || p_id::text));
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(923, pg_catalog.hashtext(p_kind || ':' || p_id::text));
  END IF;
END;
$$;

COMMENT ON FUNCTION private.entry_parent_gate(text, uuid, boolean) IS
  'MYK9-923: the transaction-scoped parent gate. Entry inserts, parent changes '
  'and restores take it SHARED on show, trial and class; soft_delete_show/_trial/'
  '_class take it EXCLUSIVE on their own row before the cascade.';

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
  v_trial_ids uuid[];
  v_show_ids uuid[];
  v_id uuid;
BEGIN
  -- Resolve the ancestry: the class's own trial, the entry's trial, and every
  -- one of those trials' shows, plus the entry's show.
  IF p_class_id IS NOT NULL THEN
    SELECT c.trial_id INTO v_class_trial_id FROM public.classes c WHERE c.id = p_class_id;
  END IF;

  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_trial_ids
  FROM unnest(ARRAY[p_trial_id, v_class_trial_id]) AS x
  WHERE x IS NOT NULL;

  SELECT array_agg(DISTINCT ids.x ORDER BY ids.x) INTO v_show_ids
  FROM (
    SELECT t.show_id AS x FROM public.trials t WHERE t.id = ANY (COALESCE(v_trial_ids, '{}'::uuid[]))
    UNION ALL
    SELECT p_show_id
  ) ids
  WHERE ids.x IS NOT NULL;

  -- Shared gates, top-down and in id order within a level.
  FOREACH v_id IN ARRAY COALESCE(v_show_ids, '{}'::uuid[]) LOOP
    PERFORM private.entry_parent_gate('show', v_id, false);
  END LOOP;
  FOREACH v_id IN ARRAY COALESCE(v_trial_ids, '{}'::uuid[]) LOOP
    PERFORM private.entry_parent_gate('trial', v_id, false);
  END LOOP;
  PERFORM private.entry_parent_gate('class', p_class_id, false);

  -- Each query below takes a new snapshot (VOLATILE, READ COMMITTED), so a
  -- delete that held a gate this function waited on is seen as committed.
  IF EXISTS (SELECT 1 FROM public.shows s
             WHERE s.id = ANY (COALESCE(v_show_ids, '{}'::uuid[])) AND s.deleted_at IS NOT NULL) THEN
    RETURN 'show';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trials t
             WHERE t.id = ANY (COALESCE(v_trial_ids, '{}'::uuid[])) AND t.deleted_at IS NOT NULL) THEN
    RETURN 'trial';
  END IF;
  IF p_class_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class_id AND c.deleted_at IS NOT NULL) THEN
    RETURN 'class';
  END IF;

  -- A parent that does not exist is not "deleted": the foreign key refuses it.
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.entry_deleted_parent(uuid, uuid, uuid) IS
  'MYK9-923: the topmost soft-deleted ancestor (show, trial or class) of an entry '
  'with these ids, or NULL. Takes the shared parent gate on each ancestor first, '
  'top-down, so a concurrent soft_delete_* (exclusive gate) is serialized against it.';

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

REVOKE ALL ON FUNCTION private.entry_parent_gate(text, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
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
-- 2. soft_delete_show / _class / _trial: the exclusive parent gate first.
--    Bodies copied from 20261001235300; only the gate PERFORM is new.
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
  -- MYK9-923: the exclusive parent gate, before the existence check and the
  -- cascade take their snapshots. Entry inserts under this show hold it shared.
  PERFORM private.entry_parent_gate('show', p_show_id, true);

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
  -- MYK9-923: the exclusive parent gate, before the existence check and the
  -- cascade take their snapshots. Entry inserts under this class hold it shared.
  PERFORM private.entry_parent_gate('class', p_class_id, true);

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
  -- MYK9-923: the exclusive parent gate, before the existence check and the
  -- cascade take their snapshots. Entry inserts under this trial hold it shared.
  PERFORM private.entry_parent_gate('trial', p_trial_id, true);

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
-- 5. move_up_entry: take the target's parent gates before locking the source.
--    Body copied from 20260918193300 (identical to live); only the gate
--    PERFORM is new.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_up_entry(
  p_entry_id uuid,
  p_target_class_id uuid,
  p_new_entry_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_source         public.entries%ROWTYPE;
  v_target_show_id uuid;
  v_target_trial_id uuid;
  v_note           text;
BEGIN
  -- MYK9-923: gate before entry rows. The destination INSERT below takes the
  -- target's parent gates (entries trigger); take them now, before locking the
  -- source, so a concurrent soft_delete_* (gate first, then the entries it
  -- cascades) cannot hold the gate while waiting on our source row. The
  -- verdict is not used here: the target checks below and the trigger refuse
  -- a deleted parent with their own messages.
  PERFORM private.entry_deleted_parent(
    p_target_class_id,
    (SELECT c.trial_id FROM public.classes c WHERE c.id = p_target_class_id),
    NULL
  );

  SELECT * INTO v_source
  FROM public.entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  -- Restated authorization (see the header): identical to entries_update.
  IF NOT public.can_manage_show(v_source.show_id) THEN
    RAISE EXCEPTION 'You do not have permission to move entries in this show.'
      USING ERRCODE = '42501';
  END IF;

  -- A dog who has been pulled, withdrawn, scratched, marked absent, already
  -- moved, or soft-deleted is not movable. Refusing here is what lets the
  -- move-back restore an unambiguous source, and what stops a pulled dog being
  -- carried into a class the readiness counters then drop them from.
  IF v_source.deleted_at IS NOT NULL
     OR COALESCE(v_source.entry_status, '') IN
        ('moved', 'withdrawn', 'scratched', 'absent', 'not_accepted')
     OR v_source.check_in_status = 'pulled' THEN
    RAISE EXCEPTION 'This entry is not in a state that can be moved.'
      USING ERRCODE = '22023';
  END IF;

  -- A run that has STARTED cannot be moved out of the class it started in --
  -- the same rule `reverse_move_up_entry` applies to the destination, and for
  -- the same reason. Marking the source `moved` excludes it from the class
  -- rollup, the catalog and every registry report, so moving a scored entry
  -- would VACATE a result from the class it was earned in. `completed`,
  -- `in-ring` and `competing` all passed the movability guard above, which
  -- refuses only the approval-dimension states.
  --
  -- `checked-in` and `at-gate` are deliberately still movable: the dog is
  -- present and has not run, which is exactly when a secretary moves them.
  IF COALESCE(v_source.is_scored, false)
     OR COALESCE(v_source.is_in_ring, false)
     OR COALESCE(v_source.entry_status, '') IN ('in-ring', 'competing', 'completed')
     OR v_source.check_in_status IN ('in-ring', 'completed')
     OR v_source.scoring_started_at IS NOT NULL
     OR v_source.scoring_completed_at IS NOT NULL
     OR v_source.ring_entry_time IS NOT NULL
     OR COALESCE(v_source.result_status, 'pending') <> 'pending'
     OR v_source.final_placement IS NOT NULL
     OR COALESCE(v_source.points_earned, 0) <> 0
     OR COALESCE(v_source.search_time_seconds, 0) <> 0
     OR COALESCE(v_source.area1_time_seconds, 0) <> 0
     OR COALESCE(v_source.area2_time_seconds, 0) <> 0
     OR COALESCE(v_source.area3_time_seconds, 0) <> 0
     OR COALESCE(v_source.area4_time_seconds, 0) <> 0
     OR COALESCE(v_source.total_faults, 0) <> 0
     OR COALESCE(v_source.total_correct_finds, 0) <> 0
     OR COALESCE(v_source.total_incorrect_finds, 0) <> 0
     OR COALESCE(v_source.no_finish_count, 0) <> 0
     OR COALESCE(v_source.total_score, 0) <> 0
     OR COALESCE(v_source.points_possible, 0) <> 0 THEN
    RAISE EXCEPTION 'This run has already started, so the entry can no longer be moved.'
      USING ERRCODE = '22023';
  END IF;

  SELECT t.show_id, c.trial_id
  INTO v_target_show_id, v_target_trial_id
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_target_class_id
    AND c.deleted_at IS NULL
    AND t.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That class no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_show_id IS DISTINCT FROM v_source.show_id THEN
    RAISE EXCEPTION 'An entry can only move within its own show.'
      USING ERRCODE = '22023';
  END IF;

  IF p_target_class_id = v_source.class_id THEN
    RAISE EXCEPTION 'That entry is already in this class.' USING ERRCODE = '22023';
  END IF;

  -- The element/level ladder stays in the client (`utils/moveUpEligibility.ts`):
  -- it is registry-aware and the registry lives on the trial, not on a CHECK.
  -- What this function owns is what a stale or hostile client cannot be trusted
  -- with -- who may write, that the row is movable, and that both halves land.

  -- A dog already entered in the target class would otherwise die on
  -- `entries_dog_class_unique_idx` with raw constraint text in the secretary's
  -- toast. Say it in words instead, in the same 22023 the client already
  -- renders verbatim.
  IF EXISTS (
    SELECT 1
    FROM public.entries e
    WHERE e.dog_id = v_source.dog_id
      AND e.class_id = p_target_class_id
      AND e.deleted_at IS NULL
      -- Byte-identical to entries_dog_class_unique_idx's predicate above. A
      -- COALESCE here would be STRICTER than the index: a NULL entry_status is
      -- excluded from the index entirely, so the INSERT would have succeeded
      -- while this refused it in words.
      AND e.entry_status <> ALL (ARRAY['withdrawn'::text, 'scratched'::text])
  ) THEN
    RAISE EXCEPTION 'This dog is already entered in that class.' USING ERRCODE = '22023';
  END IF;

  v_note := 'Moved up from class ' || v_source.class_id::text
            || COALESCE(': ' || NULLIF(btrim(p_reason), ''), '');

  INSERT INTO public.entries (
    id, dog_id, show_id, class_id, trial_id,
    handler_id, handler, armband, jump_height,
    entry_status, check_in_status,
    payment_status, entry_fee,
    is_day_of_show, entry_source, registration_id,
    special_requests, moved_from_entry_id
  )
  VALUES (
    p_new_entry_id, v_source.dog_id, v_source.show_id, p_target_class_id, v_target_trial_id,
    v_source.handler_id, v_source.handler, v_source.armband, v_source.jump_height,
    -- The dog's APPROVAL state travels; a move-up is not an acceptance. Writing
    -- 'confirmed' unconditionally promoted a `pending-payment` or `submitted`
    -- entry the secretary had never accepted, and a round trip then restored it
    -- as 'confirmed' -- because the reverse restores from the destination.
    --
    -- The four REQUEST statuses are the exception, and they have to be: a
    -- request is a request to move THIS entry, and it is fulfilled the moment
    -- this function runs. `approveMoveUpRequestReplicated` requires the source
    -- to be 'move-up-requested' before it calls here, so inheriting that status
    -- put the destination straight back into `getPendingMoveUpRequests`'s
    -- queue -- the secretary approves, the row reappears in front of them, and
    -- approving again walks the dog another rung up the ladder. Same shape for
    -- 'scratch-requested': an exhibitor's request against the OLD class must not
    -- become a pending request against a class they never entered.
    --
    -- Kept in lockstep with MOVE_UP_REQUEST_STATUSES in
    -- features/show-map/moveUpRequestStatuses.ts, which the contract test pins.
    CASE
      WHEN COALESCE(v_source.entry_status, '') IN (
        'move-up-requested', 'move_up_requested', 'scratch-requested', 'scratch_requested'
      ) THEN 'confirmed'
      ELSE v_source.entry_status
    END,
    -- MYK9-640: a check-in travels, and ONLY as a check-in. 'pulled' cannot
    -- reach here (refused above); 'in-ring', 'at-gate' and 'completed' describe
    -- a run in the class being left, not the one being entered.
    CASE WHEN v_source.check_in_status = 'checked-in' THEN 'checked-in' ELSE 'no-status' END,
    -- Money-neutral. See the header.
    'pending', 0,
    -- Provenance, NOT money: who collected the entry and under which
    -- enrollment. `entry_source` is the only field that proves UKC collected a
    -- fee ('ukc_online'), and `is_day_of_show` is the day-of/pre-entry split --
    -- both are per-BUCKET lines on the registry report, so losing them bills
    -- the club for a run a registry already collected, and strands the
    -- destination off the exhibitor's order card.
    v_source.is_day_of_show, v_source.entry_source, v_source.registration_id,
    v_note, p_entry_id
  );

  -- Deliberately does NOT touch the source's `special_requests`: the FK above is
  -- the lineage, and that column is where a secretary writes "reactive dog,
  -- needs the ramp".
  UPDATE public.entries
  SET entry_status = 'moved'
  WHERE id = p_entry_id;

  RETURN p_new_entry_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. ACLs, restated as live has them (owner postgres; authenticated and
--    service_role execute; never anon). CREATE OR REPLACE kept them already.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.soft_delete_show(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_class(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_trial(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_entry(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_dog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_show(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_class(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_trial(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_entry(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_dog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
