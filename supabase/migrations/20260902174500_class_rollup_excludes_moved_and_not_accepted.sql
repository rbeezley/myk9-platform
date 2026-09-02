-- MYK9-330: a move-up or a not-accepted entry must not be an expected run.
--
-- `refresh_class_scoring_state` derives class completion from
--
--   expected  = entry_status NOT IN ('scratched','withdrawn','cancelled')
--               AND check_in_status IS DISTINCT FROM 'pulled'
--   accounted = is_scored OR result_status IN ('absent','excused')
--   complete  = expected > 0 AND accounted = expected
--
-- That exclusion list predates two terminal statuses the CHECK constraint has
-- carried since migration 174, and neither is in it:
--
--   'moved'        the SOURCE row of a move-up. `showMapActionMutations`
--                  creates the destination entry in the target class and then
--                  marks the original 'moved' -- it is deliberately NOT
--                  soft-deleted, so the exhibitor can still see where the run
--                  came from. The row therefore stays in the original class,
--                  is_scored stays false forever (the run happens on the
--                  destination row), and it is counted as an expected run that
--                  will never be accounted for.
--   'not_accepted' an entry the secretary declined. Same shape: live row,
--                  never scored, counted as expected.
--
-- Consequence, and the reason this is P1: `accounted = expected` can never hold
-- for such a class, so it never reaches 'completed' and
-- `recalculate_class_placements` -- which only the completion branch calls --
-- never runs. One move-up in a class silently costs every dog in it its
-- placement.
--
-- 'cancelled' is DROPPED in the same pass. `entries_entry_status_check` has
-- never permitted it (verified against the live constraint, and `select count(*)
-- from entries where entry_status = 'cancelled'` returns 0), so it was a dead
-- branch that made the list look longer than the rule it encodes.
--
-- Three server-side copies of the same predicate are corrected together,
-- because a surface reporting outstanding work under a slightly different rule
-- is how a page ends up disagreeing with the server about whether a class is
-- finished (MYK9-118):
--
--   1. refresh_class_scoring_state       -- the rollup itself
--   2. handle_entry_scoring_state_change -- the INSERT reopen guard, which must
--      agree on what "an expected entry arrived" means or a 'moved' row
--      inserted into a completed class would reopen it
--   3. tv_class_entry_counts / tv_board_entries -- the TV board's running
--      order and its x-of-y counter
--
-- The client mirror in `apps/myk9show/src/features/_shared/entryAccounting.ts`
-- is updated in the same change.
--
-- Bodies copied from the LIVE definitions (verified identical to
-- 20260828010000, 20260713101000 and 20260803160000 respectively); only the
-- status lists change.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The rollup.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state(p_class_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  v_expected_count integer;
  v_accounted_count integer;
  v_scored_count integer;
  v_status_source text;
  v_is_nationals boolean;
BEGIN
  IF p_class_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN ('scratched', 'withdrawn', 'moved', 'not_accepted')
        AND check_in_status IS DISTINCT FROM 'pulled'
    )::integer,
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN ('scratched', 'withdrawn', 'moved', 'not_accepted')
        AND check_in_status IS DISTINCT FROM 'pulled'
        AND (is_scored = true OR result_status IN ('absent', 'excused'))
    )::integer,
    COUNT(*) FILTER (WHERE is_scored = true)::integer
  INTO v_expected_count, v_accounted_count, v_scored_count
  FROM public.entries
  WHERE class_id = p_class_id
    AND deleted_at IS NULL;

  SELECT status_source
  INTO v_status_source
  FROM public.classes
  WHERE id = p_class_id;

  IF v_status_source = 'manual' THEN
    -- Guarded: a row the WHERE excludes is never locked and never rewritten.
    UPDATE public.classes
    SET scored_count = v_scored_count
    WHERE id = p_class_id
      AND scored_count IS DISTINCT FROM v_scored_count;

    -- TOMBSTONE-SCOPED on purpose. A manual class keeps its human-set status
    -- and its human-set placements; only rows that no longer exist are
    -- stripped. The class-wide clear the derived branches use would destroy
    -- pinned results here.
    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND deleted_at IS NOT NULL
      AND final_placement IS NOT NULL;

    RETURN;
  END IF;

  IF v_expected_count = 0 THEN
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'upcoming'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false);

    -- Deliberately NOT filtered by deleted_at: this branch is where an
    -- emptied class lands, and the tombstone that emptied it is the only row
    -- left holding a placement. `final_placement IS NOT NULL` is the guard
    -- that keeps the write bounded (20260727235900).
    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  ELSIF v_accounted_count = v_expected_count THEN
    SELECT s.is_nationals
    INTO v_is_nationals
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    JOIN public.shows s ON s.id = t.show_id
    WHERE c.id = p_class_id;

    UPDATE public.classes
    SET
      status = 'completed',
      scored_count = v_scored_count,
      is_scoring_finalized = true,
      reopened_after_closeout_at = NULL
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'completed'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM true
           OR reopened_after_closeout_at IS NOT NULL);

    -- Unconditional: placements depend on entry values this function does not
    -- read, so a class whose own columns are unchanged can still need ranking.
    PERFORM public.recalculate_class_placements(ARRAY[p_class_id], COALESCE(v_is_nationals, false));
  ELSIF v_accounted_count > 0 THEN
    UPDATE public.classes
    SET
      status = 'in_progress',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'in_progress'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false);

    -- Same reasoning: a partially-scored class is not ranked, so no row in it
    -- may hold a placement -- including one that was tombstoned while the
    -- class was still complete.
    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  ELSE
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'upcoming'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false);

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  END IF;
END;
$$;

-- Restate the execute decision from 20260703120000_revoke_scoring_fns_from_public.sql.
REVOKE ALL ON FUNCTION public.refresh_class_scoring_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_class_scoring_state(uuid) TO service_role;

COMMENT ON FUNCTION public.refresh_class_scoring_state(uuid) IS
  'Derives classes.status from non-deleted entry scoring state using the '
  'expected/accounted-for completeness definition. Entries that will never run '
  'are excluded from the expected set: scratched, withdrawn, moved (the source '
  'row of a move-up, whose run happens on the destination entry) and '
  'not_accepted (MYK9-330), plus check_in_status = ''pulled''. Skips the '
  'status write (still refreshes scored_count) when status_source = ''manual'', '
  'but still strips placements from soft-deleted rows there. Clears '
  'reopened_after_closeout_at on legitimate completion. Reads shows.is_nationals '
  'for the placement ranking. The derived terminal branches clear placements '
  'class-wide including soft-deleted rows, so emptying a completed class cannot '
  'leave a tombstone holding a stale placement; the final_placement IS NOT NULL '
  'guard keeps those clears from rewriting a whole class of no-ops. Every '
  'UPDATE public.classes is guarded by an IS DISTINCT FROM test so a write that '
  'would change nothing never takes the class row lock, bumps the replication '
  'version or fans out a realtime broadcast (MYK9-248).';

-- ---------------------------------------------------------------------------
-- 2. The INSERT reopen guard must agree on "expected".
-- ---------------------------------------------------------------------------
-- Otherwise inserting a 'moved' or 'not_accepted' row into a completed class
-- reopens it and strips its placements, which is the same P1 by another route.
-- search_path is tightened from 'public' to '' at the same time (SA-027). Every
-- reference in this body is already schema-qualified, so the narrowing is
-- behaviour-preserving; the classPlacementContract pins the empty form.
CREATE OR REPLACE FUNCTION public.handle_entry_scoring_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_expected boolean;
  v_class_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_class_scoring_state(OLD.class_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.class_id IS NOT NULL THEN
      v_is_expected := (
        NEW.deleted_at IS NULL
        AND COALESCE(NEW.entry_status, '') NOT IN ('scratched', 'withdrawn', 'moved', 'not_accepted')
        AND NEW.check_in_status IS DISTINCT FROM 'pulled'
      );

      IF v_is_expected THEN
        SELECT status
        INTO v_class_status
        FROM public.classes
        WHERE id = NEW.class_id;

        IF v_class_status = 'completed' THEN
          UPDATE public.classes
          SET
            status_source = 'derived',
            reopened_after_closeout_at = now()
          WHERE id = NEW.class_id;
        END IF;
      END IF;

      PERFORM public.refresh_class_scoring_state(NEW.class_id);
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.class_id IS DISTINCT FROM NEW.class_id THEN
    PERFORM public.refresh_class_scoring_state(OLD.class_id);
  END IF;

  PERFORM public.refresh_class_scoring_state(NEW.class_id);

  RETURN NEW;
END;
$$;

-- Codify the EXECUTE disposition this trigger function already holds live
-- ({postgres=X, service_role=X}): no migration has ever stated it, so a
-- migrations-only ACL rebuild had no decision to replay. A trigger function is
-- never called directly by a client, and Postgres does not check EXECUTE when
-- firing a trigger, so removing anon/authenticated costs nothing.
REVOKE ALL ON FUNCTION public.handle_entry_scoring_state_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_entry_scoring_state_change() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The TV board reads the same population.
-- ---------------------------------------------------------------------------
-- A 'moved' source row left in the running order is a dog the gate steward will
-- call that is not going to appear, and it inflates the x-of-y counter for the
-- whole class.
CREATE OR REPLACE FUNCTION public.tv_class_entry_counts(
  p_show_id uuid,
  p_class_ids uuid[]
)
RETURNS TABLE (class_id uuid, entry_count bigint, scored_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    requested.class_id,
    count(e.id)::bigint,
    count(e.id) FILTER (WHERE e.is_scored IS true)::bigint
  FROM unnest(p_class_ids) AS requested(class_id)
  LEFT JOIN public.entries AS e
    ON e.class_id = requested.class_id
   AND e.show_id = p_show_id
   AND e.deleted_at IS NULL
   AND lower(coalesce(e.entry_status, '')) NOT IN ('scratched', 'withdrawn', 'moved', 'not_accepted')
   AND lower(coalesce(e.check_in_status, '')) IS DISTINCT FROM 'pulled'
  WHERE EXISTS (
    SELECT 1
    FROM public.shows AS s
    WHERE s.id = p_show_id
      AND s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      AND s.deleted_at IS NULL
  )
  GROUP BY requested.class_id;
$$;

CREATE OR REPLACE FUNCTION public.tv_board_entries(
  p_show_id uuid,
  p_class_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  class_id uuid,
  armband text,
  handler text,
  run_order integer,
  is_in_ring boolean,
  is_scored boolean,
  dog_name text,
  dog_call_name text,
  dog_image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    e.id,
    e.class_id,
    e.armband,
    e.handler,
    e.run_order,
    COALESCE(e.is_in_ring, false),
    COALESCE(e.is_scored, false),
    d.name,
    d.call_name,
    d.image_url
  FROM public.entries AS e
  LEFT JOIN public.dogs AS d
    ON d.id = e.dog_id
   AND d.deleted_at IS NULL
  WHERE e.show_id = p_show_id
    AND e.class_id = ANY (p_class_ids)
    AND e.deleted_at IS NULL
    AND lower(coalesce(e.entry_status, '')) NOT IN ('scratched', 'withdrawn', 'moved', 'not_accepted')
    AND lower(coalesce(e.check_in_status, '')) IS DISTINCT FROM 'pulled'
    AND (e.is_scored IS DISTINCT FROM true OR e.is_in_ring IS true)
    AND EXISTS (
      SELECT 1
      FROM public.shows AS s
      WHERE s.id = p_show_id
        AND s.status IN ('published', 'upcoming', 'in_progress', 'completed')
        AND s.deleted_at IS NULL
    )
  ORDER BY e.run_order ASC NULLS LAST;
$$;

-- Restate the execute decisions these functions already carry
-- (20260803160000). CREATE OR REPLACE preserves the ACL, so these are no-ops
-- against the applied database; they are here so the migration carries its own
-- disposition for a migrations-only ACL rebuild.
REVOKE ALL ON FUNCTION public.tv_class_entry_counts(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_class_entry_counts(uuid, uuid[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_board_entries(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_board_entries(uuid, uuid[]) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Backfill the classes the old rule left stuck.
-- ---------------------------------------------------------------------------
-- Scoped to classes that actually hold a moved / not_accepted entry: those are
-- the only ones whose derivation can change, and every recompute that DOES
-- change something publishes a replication delta and a realtime broadcast, so
-- a whole-table sweep would be a large fan-out for a set that is almost
-- entirely no-ops. `refresh_class_scoring_state` self-guards manual classes.
--
-- The class-status push webhook is suppressed for the duration: this is a
-- correction of stale state, not a live scoring event, and exhibitors should
-- not be paged for it. Disable/enable is the clean match because the push
-- trigger has no session-GUC hook to check (20260712180000 does the same).
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT c.id
    FROM public.classes c
    WHERE c.status_source IS DISTINCT FROM 'manual'
      AND EXISTS (
        SELECT 1
        FROM public.entries e
        WHERE e.class_id = c.id
          AND e.deleted_at IS NULL
          AND e.entry_status IN ('moved', 'not_accepted')
      )
  LOOP
    PERFORM public.refresh_class_scoring_state(r.id);
  END LOOP;
END $$;

ALTER TABLE public.classes ENABLE TRIGGER trg_notify_class_status_push;

COMMIT;

NOTIFY pgrst, 'reload schema';
