-- CRUD standard, Phase 1 (server foundation): one soft-delete and one restore
-- RPC for each of the seven core objects, a money/scored guard on the four that
-- hold entries, a block on direct writes to deleted_at/deleted_by, and an Undo
-- window for the deleter. docs/plan-crud-standard.md.
--
-- WHAT THIS CHANGES
--
--  1. NEW  soft_delete_trial / soft_delete_entry / soft_delete_club and
--          restore_trial / restore_entry / restore_club. Until now a trial was
--          hard-deleted through the replication queue, an entry was soft-deleted
--          by a direct UPDATE (Entry Management) or hard-deleted (class page),
--          and a club was soft-deleted/restored by a direct UPDATE that
--          clubs_update let a club admin make.
--
--  2. GUARD  private.count_delete_blocking_entries(scope, id) is the ONE
--          predicate for "this delete would strand money or results", scoped by
--          show | trial | class | entry. It is the same predicate as
--          private.count_dog_blocking_entries (MK002), generalised. The
--          show/trial/class/entry delete RPCs refuse with MK010 when it is
--          non-zero. A site admin may pass p_override => true; anyone else
--          passing true is refused (42501) even when nothing blocks, so a
--          client cannot probe by flipping the flag.
--          The override issues no refund: a paid entry's Stripe charge stays
--          captured, exactly as with force_delete_dog.
--
--  3. SIGNATURES  soft_delete_show(uuid) and soft_delete_class(uuid) gain a
--          trailing `p_override boolean DEFAULT false`. CREATE OR REPLACE with
--          a different argument list creates an OVERLOAD instead of replacing,
--          and PostgREST cannot disambiguate a call that names only p_show_id,
--          so the one-argument versions are dropped first and the ACL
--          re-asserted. Existing callers (`rpc('soft_delete_show', {p_show_id})`)
--          keep working through the default.
--          Both now run with an empty search_path and fully qualified names
--          (they ran with 'public'); behaviour and error messages are otherwise
--          unchanged. 'Show not found' and 'Permission denied' are matched by
--          message in services/database/shows/deleteOutcome.ts: do not reword.
--
--  4. UNDO WINDOW  every restore_* (the six above plus the existing
--          restore_show / restore_class / restore_dog / restore_person) admits
--          a site admin OR the person whose auth uid is the row's deleted_by,
--          within 10 minutes of deleted_at (private.can_undo_soft_delete). All
--          seven deleted_by columns reference auth.users(id), so the compare is
--          against auth.uid(), never against people.id.
--          restore_trial/class/entry/show also refuse (MK013) to bring a row
--          back under a parent that is itself still deleted: the row would
--          "succeed" and stay invisible.
--
--  5. DIRECT-WRITE BLOCK  a BEFORE UPDATE trigger on clubs, shows, trials,
--          classes, entries, dogs and people refuses any change to deleted_at or
--          deleted_by made by the `anon` or `authenticated` role. Without it
--          the update policies (shows_update, entries_update, clubs_update ...)
--          let a manager stamp deleted_at directly and skip every guard above.
--
--          WHY current_user AND NOT A TRANSACTION-LOCAL FLAG. The writers that
--          are allowed are the SECURITY DEFINER RPCs, which run as their owner
--          (postgres), so current_user already tells the trigger "this came
--          through an RPC". A set_config('myk9.soft_delete_rpc') flag would add
--          nothing and would be one more thing for every writer to remember, and
--          ~20 existing behavioral SQL tests plus seed-demo.sql write deleted_at
--          as postgres/service_role fixtures that a flag-only trigger would
--          break. The trigger function is deliberately SECURITY INVOKER:
--          SECURITY DEFINER would make current_user the owner on every call and
--          the check would never fire. Same reasoning as
--          private.entries_direct_write_gate (current_user = 'authenticated').
--
-- WRITER INVENTORY (every DB-side writer of deleted_at/deleted_by, found by
-- scanning pg_proc.prosrc on 2026-10-01; all are SECURITY DEFINER owned by
-- postgres, so none needs changing): soft_delete_show/_class/_dog/_person,
-- restore_show/_class/_dog/_person, force_delete_dog, the show-managed person
-- delete, and the move-up reversal. No cron job and no edge
-- function writes either column. The client writers are routed to the RPCs
-- above in the same PR; the replication queue's hard .delete() calls (trial,
-- class-page entry, club) are not deleted_at writes and are Phase 2.
--
-- Function bodies replaced below were copied from the LIVE definitions
-- (pg_get_functiondef, 2026-10-01), which match the latest migration defining
-- each: restore_show/restore_class/restore_person
-- 20260617120000_restore_entity_rpcs.sql, restore_dog
-- 20260924104100_myk9_607_608_dog_delete_audit_and_restore.sql, soft_delete_show
-- 20260515113000_fix_soft_delete_show_null_club.sql, soft_delete_class
-- 172_soft_delete_class_cascade.sql.
--
-- Error codes (existing: MK001-MK006, MK490, MK571, MK685, MK781):
--   MK010  delete refused: live entries are paid or scored
--   MK011  club delete refused: the club still has live shows
--   MK013  restore refused: the parent is still deleted

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Private helpers
-- ---------------------------------------------------------------------------

-- The ONE money/scored predicate (same arms as count_dog_blocking_entries),
-- scoped to everything a delete at that level would cascade to. Counts by both
-- the entry's own show/trial/class columns and the class chain the cascade
-- actually walks, so a row the cascade would hide is never missed.
CREATE OR REPLACE FUNCTION private.count_delete_blocking_entries(p_scope text, p_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_scope NOT IN ('show', 'trial', 'class', 'entry') THEN
    RAISE EXCEPTION 'count_delete_blocking_entries: unknown scope %', p_scope
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.entries e
  WHERE e.deleted_at IS NULL
    AND (
      e.payment_status = 'paid'
      OR e.is_scored IS TRUE
      OR e.scoring_completed_at IS NOT NULL
      OR (e.result_status IS NOT NULL AND e.result_status <> 'pending')
    )
    AND CASE p_scope
      WHEN 'entry' THEN e.id = p_id
      WHEN 'class' THEN e.class_id = p_id
      WHEN 'trial' THEN (
        e.trial_id = p_id
        OR e.class_id IN (SELECT c.id FROM public.classes c WHERE c.trial_id = p_id)
      )
      ELSE (
        e.show_id = p_id
        OR e.class_id IN (
          SELECT c.id
          FROM public.classes c
          JOIN public.trials t ON t.id = c.trial_id
          WHERE t.show_id = p_id
        )
      )
    END;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION private.count_delete_blocking_entries(text, uuid) IS
  'CRUD standard Phase 1: the ONE predicate for "deleting this show/trial/class/'
  'entry would strand a paid or scored entry". Same arms as '
  'private.count_dog_blocking_entries. Internal: reachable only through the '
  'SECURITY DEFINER delete RPCs.';

-- The guard every show/trial/class/entry delete RPC calls, after its own
-- permission check and before any cascade write.
CREATE OR REPLACE FUNCTION private.enforce_delete_money_guard(
  p_scope text,
  p_id uuid,
  p_override boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Refused even when nothing blocks: a client must not learn whether a row is
  -- blocked by flipping the flag.
  IF p_override IS TRUE AND NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Only a site admin may override the paid or scored guard'
      USING ERRCODE = '42501';
  END IF;

  IF p_override IS TRUE THEN
    RETURN;
  END IF;

  v_count := private.count_delete_blocking_entries(p_scope, p_id);

  IF v_count > 0 THEN
    RAISE EXCEPTION '%',
      CASE p_scope
        WHEN 'show' THEN 'This show has paid or scored entries. Cancel the show instead of deleting it.'
        WHEN 'entry' THEN 'This entry has been paid for or scored. Use Withdraw or Pull instead of deleting it.'
        ELSE format('This %s has paid or scored entries. Withdraw or Pull those entries first.', p_scope)
      END
      USING ERRCODE = 'MK010',
            DETAIL = format('scope=%s blocking_entries=%s', p_scope, v_count);
  END IF;
END;
$$;

COMMENT ON FUNCTION private.enforce_delete_money_guard(text, uuid, boolean) IS
  'CRUD standard Phase 1: MK010 refusal for the show/trial/class/entry delete '
  'RPCs; a site admin passes p_override => true to proceed, anyone else passing '
  'true is refused with 42501.';

-- Undo: the deleter, within 10 minutes. deleted_by references auth.users, so it
-- is compared with auth.uid() (people.id is NOT an auth uid).
CREATE OR REPLACE FUNCTION private.can_undo_soft_delete(
  p_deleted_by uuid,
  p_deleted_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_deleted_by IS NOT NULL
     AND p_deleted_at IS NOT NULL
     AND p_deleted_by = (SELECT auth.uid())
     AND p_deleted_at > now() - interval '10 minutes';
$$;

COMMENT ON FUNCTION private.can_undo_soft_delete(uuid, timestamptz) IS
  'CRUD standard Phase 1: true for the caller who deleted the row, within the '
  '10-minute Undo window. Every restore_* RPC also admits a site admin.';

-- The direct-write block. SECURITY INVOKER on purpose (see header).
CREATE OR REPLACE FUNCTION private.block_direct_soft_delete_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'deleted_at and deleted_by can only be changed by the soft-delete and restore functions'
      USING ERRCODE = '42501',
            HINT = 'Call soft_delete_<object> or restore_<object> instead of updating the row.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.block_direct_soft_delete_write() IS
  'CRUD standard Phase 1: refuses direct deleted_at/deleted_by changes from the '
  'anon and authenticated roles. The soft_delete_*/restore_* RPCs are SECURITY '
  'DEFINER (current_user = their owner) so they pass; postgres and service_role '
  'fixtures and seeds pass too.';

REVOKE ALL ON FUNCTION private.count_delete_blocking_entries(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.enforce_delete_money_guard(text, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.can_undo_soft_delete(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.block_direct_soft_delete_write()
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. soft_delete_show / soft_delete_class: add p_override + guard
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.soft_delete_show(uuid);
DROP FUNCTION IF EXISTS public.soft_delete_class(uuid);

CREATE FUNCTION public.soft_delete_show(p_show_id uuid, p_override boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_club_id UUID;
  v_show_exists BOOLEAN := FALSE;
  v_rows_affected INT;
  v_now TIMESTAMPTZ := NOW();
  v_user_id UUID := auth.uid();
BEGIN
  SELECT s.club_id, TRUE
  INTO v_club_id, v_show_exists
  FROM public.shows s
  WHERE s.id = p_show_id
    AND s.deleted_at IS NULL;

  IF NOT COALESCE(v_show_exists, FALSE) THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    (v_club_id IS NOT NULL AND (SELECT public.is_club_admin(v_club_id)))
    OR (v_club_id IS NOT NULL AND (SELECT public.is_trial_secretary(v_club_id)))
    OR (SELECT public.is_site_admin())
    OR (SELECT public.is_platform_admin())
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM private.enforce_delete_money_guard('show', p_show_id, p_override);

  UPDATE public.entries
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE class_id IN (
    SELECT c.id FROM public.classes c
    JOIN public.trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  )
  AND deleted_at IS NULL;

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

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Show not found or already deleted' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE FUNCTION public.soft_delete_class(p_class_id uuid, p_override boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_trial_id UUID;
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
      USING ERRCODE = '42501';
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

  PERFORM private.enforce_delete_money_guard('class', p_class_id, p_override);

  -- Cascade soft delete in reverse FK order: entries -> class.
  UPDATE public.entries
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE class_id = p_class_id
    AND deleted_at IS NULL;

  UPDATE public.classes
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE id = p_class_id
    AND deleted_at IS NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. New delete RPCs: trial, entry, club
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.soft_delete_trial(p_trial_id uuid, p_override boolean DEFAULT false)
 RETURNS TABLE (id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_show_id uuid;
  v_name text;
  v_now timestamptz := now();
  v_user_id uuid := auth.uid();
BEGIN
  SELECT t.show_id, t.name INTO v_show_id, v_name
  FROM public.trials t
  WHERE t.id = p_trial_id AND t.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trial not found or already deleted' USING ERRCODE = '42501';
  END IF;

  -- Matches trials_update RLS.
  IF NOT (SELECT public.can_manage_show(v_show_id)) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM private.enforce_delete_money_guard('trial', p_trial_id, p_override);

  -- One stamp across the cascade: entries -> classes -> trial.
  UPDATE public.entries e
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE e.deleted_at IS NULL
    AND (
      e.trial_id = p_trial_id
      OR e.class_id IN (SELECT c.id FROM public.classes c WHERE c.trial_id = p_trial_id)
    );

  UPDATE public.classes c
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE c.trial_id = p_trial_id AND c.deleted_at IS NULL;

  UPDATE public.trials t
  SET deleted_at = v_now, deleted_by = v_user_id, updated_at = v_now
  WHERE t.id = p_trial_id AND t.deleted_at IS NULL;

  RETURN QUERY SELECT p_trial_id, v_name;
END;
$function$;

-- Returns the entry's new `version`: the client hands it to
-- replicatedEntriesTable.acknowledgeServerDeletion so a racing download cannot
-- resurrect the row. (Returning the row itself would bypass the column-level
-- SELECT allowlist on entries.)
CREATE FUNCTION public.soft_delete_entry(p_entry_id uuid, p_override boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_show_id uuid;
  v_found boolean;
  v_version integer;
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
    RAISE EXCEPTION 'Entry not found or already deleted' USING ERRCODE = '42501';
  END IF;

  -- Matches entries_update RLS.
  IF NOT (SELECT public.can_manage_show(v_show_id)) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM private.enforce_delete_money_guard('entry', p_entry_id, p_override);

  UPDATE public.entries e
  SET deleted_at = v_now, deleted_by = (SELECT auth.uid()), updated_at = v_now
  WHERE e.id = p_entry_id AND e.deleted_at IS NULL
  RETURNING e.version INTO v_version;

  RETURN v_version;
END;
$function$;

-- Club delete is site-admin only (the owner default) and refused while the club
-- has any live show: a show's club_id would otherwise point at a hidden club.
CREATE FUNCTION public.soft_delete_club(p_club_id uuid)
 RETURNS TABLE (id uuid, name text)
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
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT c.name, TRUE INTO v_name, v_found
  FROM public.clubs c
  WHERE c.id = p_club_id AND c.deleted_at IS NULL;

  IF NOT COALESCE(v_found, FALSE) THEN
    RAISE EXCEPTION 'Club not found or already deleted' USING ERRCODE = 'P0002';
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
-- 4. New restore RPCs: trial, entry, club
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.restore_trial(p_trial_id uuid)
 RETURNS TABLE (id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_deleted_at timestamptz;
  v_deleted_by uuid;
  v_show_id uuid;
  v_name text;
BEGIN
  SELECT t.deleted_at, t.deleted_by, t.show_id, t.name
  INTO v_deleted_at, v_deleted_by, v_show_id, v_name
  FROM public.trials t WHERE t.id = p_trial_id;

  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Trial not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (SELECT public.is_platform_admin())
    OR private.can_undo_soft_delete(v_deleted_by, v_deleted_at)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.shows s WHERE s.id = v_show_id AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Restore the show first' USING ERRCODE = 'MK013';
  END IF;

  UPDATE public.trials t
  SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE t.id = p_trial_id;

  UPDATE public.classes c
  SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE c.trial_id = p_trial_id AND c.deleted_at = v_deleted_at;

  UPDATE public.entries e
  SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE e.deleted_at = v_deleted_at
    AND (
      e.trial_id = p_trial_id
      OR e.class_id IN (SELECT c.id FROM public.classes c WHERE c.trial_id = p_trial_id)
    );

  RETURN QUERY SELECT p_trial_id, v_name;
END;
$function$;

CREATE FUNCTION public.restore_entry(p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deleted_at timestamptz;
  v_deleted_by uuid;
  v_class_id uuid;
  v_dog_id uuid;
BEGIN
  SELECT e.deleted_at, e.deleted_by, e.class_id, e.dog_id
  INTO v_deleted_at, v_deleted_by, v_class_id, v_dog_id
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

  IF v_class_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = v_class_id AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Restore the class first' USING ERRCODE = 'MK013';
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

CREATE FUNCTION public.restore_club(p_club_id uuid)
 RETURNS TABLE (id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_deleted_at timestamptz;
  v_deleted_by uuid;
  v_name text;
BEGIN
  SELECT c.deleted_at, c.deleted_by, c.name
  INTO v_deleted_at, v_deleted_by, v_name
  FROM public.clubs c WHERE c.id = p_club_id;

  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Club not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  -- Club delete is site-admin only, so the deleter is a site admin; the Undo
  -- window still applies to them through the shared predicate.
  IF NOT (
    (SELECT public.is_platform_admin())
    OR private.can_undo_soft_delete(v_deleted_by, v_deleted_at)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.clubs c
  SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE c.id = p_club_id;

  RETURN QUERY SELECT p_club_id, v_name;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Existing restore RPCs: add the Undo window (and the parent check where a
--    parent exists). Bodies copied from the live definitions; only the
--    permission gate and the MK013 parent checks are new.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_show(p_show_id uuid)
 RETURNS SETOF shows
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deleted_at timestamptz;
  v_deleted_by uuid;
  v_club_id uuid;
BEGIN
  SELECT s.deleted_at, s.deleted_by, s.club_id
  INTO v_deleted_at, v_deleted_by, v_club_id
  FROM public.shows s WHERE s.id = p_show_id;

  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Show not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (SELECT public.is_platform_admin())
    OR private.can_undo_soft_delete(v_deleted_by, v_deleted_at)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF v_club_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = v_club_id AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Restore the club first' USING ERRCODE = 'MK013';
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
$function$;

CREATE OR REPLACE FUNCTION public.restore_class(p_class_id uuid)
 RETURNS SETOF classes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deleted_at timestamptz;
  v_deleted_by uuid;
  v_trial_id uuid;
BEGIN
  SELECT c.deleted_at, c.deleted_by, c.trial_id
  INTO v_deleted_at, v_deleted_by, v_trial_id
  FROM public.classes c WHERE c.id = p_class_id;

  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Class not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (SELECT public.is_platform_admin())
    OR private.can_undo_soft_delete(v_deleted_by, v_deleted_at)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF v_trial_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.trials t WHERE t.id = v_trial_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Restore the trial first' USING ERRCODE = 'MK013';
  END IF;

  UPDATE public.classes
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE id = p_class_id;

  UPDATE public.entries
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE class_id = p_class_id AND deleted_at = v_deleted_at;

  RETURN QUERY SELECT * FROM public.classes WHERE id = p_class_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_person(p_person_id uuid)
 RETURNS SETOF people
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deleted_at timestamptz;
  v_deleted_by uuid;
BEGIN
  SELECT p.deleted_at, p.deleted_by
  INTO v_deleted_at, v_deleted_by
  FROM public.people p WHERE p.id = p_person_id;

  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Person not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (SELECT public.is_platform_admin())
    OR private.can_undo_soft_delete(v_deleted_by, v_deleted_at)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.people
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE id = p_person_id;

  RETURN QUERY SELECT * FROM public.people WHERE id = p_person_id;
END;
$function$;

-- restore_dog: the live body (20260924104100) verbatim except the first two
-- statements, which read deleted_by and use the Undo-window gate.
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

  UPDATE public.entries
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE dog_id = p_dog_id AND deleted_at = v_deleted_at;
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
-- 6. Grants. CREATE OR REPLACE kept the ACL of the restore_* functions that
--    already existed; the dropped-and-recreated and the new functions start
--    from the schema's default privileges, so state the ACL explicitly.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.soft_delete_show(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_class(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_trial(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_entry(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_club(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_trial(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_entry(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_club(uuid) FROM PUBLIC, anon;
-- The four restore RPCs replaced above keep their ACL; stated again because the
-- grant-decision contract (migrationGrantDecisionContract) wants every public
-- function a migration (re)defines to carry its own anon and authenticated decision.
REVOKE ALL ON FUNCTION public.restore_show(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_class(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_dog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_person(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.soft_delete_show(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_class(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_trial(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_entry(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_club(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_trial(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_entry(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_club(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_show(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_class(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_dog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_person(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. The direct-write block, on all seven tables.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_00_block_direct_soft_delete
  BEFORE UPDATE OF deleted_at, deleted_by ON public.clubs
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by)
  EXECUTE FUNCTION private.block_direct_soft_delete_write();

CREATE TRIGGER trg_00_block_direct_soft_delete
  BEFORE UPDATE OF deleted_at, deleted_by ON public.shows
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by)
  EXECUTE FUNCTION private.block_direct_soft_delete_write();

CREATE TRIGGER trg_00_block_direct_soft_delete
  BEFORE UPDATE OF deleted_at, deleted_by ON public.trials
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by)
  EXECUTE FUNCTION private.block_direct_soft_delete_write();

CREATE TRIGGER trg_00_block_direct_soft_delete
  BEFORE UPDATE OF deleted_at, deleted_by ON public.classes
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by)
  EXECUTE FUNCTION private.block_direct_soft_delete_write();

CREATE TRIGGER trg_00_block_direct_soft_delete
  BEFORE UPDATE OF deleted_at, deleted_by ON public.entries
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by)
  EXECUTE FUNCTION private.block_direct_soft_delete_write();

CREATE TRIGGER trg_00_block_direct_soft_delete
  BEFORE UPDATE OF deleted_at, deleted_by ON public.dogs
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by)
  EXECUTE FUNCTION private.block_direct_soft_delete_write();

CREATE TRIGGER trg_00_block_direct_soft_delete
  BEFORE UPDATE OF deleted_at, deleted_by ON public.people
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by)
  EXECUTE FUNCTION private.block_direct_soft_delete_write();

COMMIT;
