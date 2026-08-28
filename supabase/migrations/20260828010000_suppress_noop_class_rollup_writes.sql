-- MYK9-248: stop ordinary check-ins rewriting the class row.
--
-- `check_in_status` reaches refresh_class_scoring_state through exactly one
-- predicate — `IS DISTINCT FROM 'pulled'` — so the six non-pulled values in the
-- CHECK constraint (no-status, checked-in, conflict, at-gate, come-to-gate,
-- in-ring, completed) are interchangeable to every count it computes. The
-- ordinary progression a dog walks through therefore cannot change status or
-- scored_count, yet the trigger fires and the function rewrites the class row
-- each time.
--
-- The rewrite is value-identical but not free. `classes` carries three
-- unconditional update triggers — a realtime broadcast with no WHEN clause, a
-- replication version increment, and an updated_at bump — so every no-op write
-- publishes a delta that each replicating device pulls, fans out a broadcast to
-- every subscriber on the show topic, and takes a row-exclusive lock held to
-- commit that the judge scoring that class queues behind. At roughly six
-- transitions per dog across a 500-entry show that is on the order of 3,000
-- unnecessary class-row writes and 3,000 unnecessary broadcasts.
--
-- Two layers, because either alone leaves half the problem:
--
--   1. The trigger's WHEN clause skips the rollup entirely for a
--      `check_in_status` change that cannot alter the outcome, so the aggregate
--      scan is not paid either.
--   2. Each `UPDATE public.classes` is guarded by an IS DISTINCT FROM test, so a
--      write that would change nothing never takes the lock, never bumps the
--      version and never broadcasts. This helps every caller, not just check-in
--      — a scratch, a soft delete or a class move that lands on identical
--      values is equally suppressed.
--
-- Behaviour deliberately preserved, each verified against
-- class_status_auto_derivation_test.sql (3.1-3.7):
--   * a manual class keeps its human-set status and placements; only tombstoned
--     rows are stripped
--   * the emptied-class branch stays unfiltered by deleted_at, bounded by
--     `final_placement IS NOT NULL` (20260727235900)
--   * completion still recalculates placements
--   * a transition into or out of 'pulled' still re-derives

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Narrow the trigger.
-- ---------------------------------------------------------------------------
-- Column list is unchanged; only the WHEN clause is added. search_time_seconds,
-- total_faults and points_earned stay in the list because completion calls
-- recalculate_class_placements, which ranks on them.
DROP TRIGGER IF EXISTS entries_refresh_class_scoring_state ON public.entries;

CREATE TRIGGER entries_refresh_class_scoring_state
AFTER INSERT OR DELETE OR UPDATE OF
  class_id, entry_status, check_in_status, deleted_at, is_scored, result_status,
  search_time_seconds, total_faults, points_earned
ON public.entries
FOR EACH ROW
WHEN (
  -- INSERT and DELETE always re-derive: the expected set itself changed.
  TG_OP <> 'UPDATE'
  -- Any of these can move a row between the counted sets.
  OR OLD.class_id IS DISTINCT FROM NEW.class_id
  OR OLD.entry_status IS DISTINCT FROM NEW.entry_status
  OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
  OR OLD.is_scored IS DISTINCT FROM NEW.is_scored
  OR OLD.result_status IS DISTINCT FROM NEW.result_status
  -- Placement inputs, read by recalculate_class_placements on completion.
  OR OLD.search_time_seconds IS DISTINCT FROM NEW.search_time_seconds
  OR OLD.total_faults IS DISTINCT FROM NEW.total_faults
  OR OLD.points_earned IS DISTINCT FROM NEW.points_earned
  -- check_in_status matters ONLY at the 'pulled' boundary, in either direction.
  -- Transitions among the other six values cannot change any count.
  OR (
    OLD.check_in_status IS DISTINCT FROM NEW.check_in_status
    AND ('pulled' IN (OLD.check_in_status, NEW.check_in_status))
  )
)
EXECUTE FUNCTION public.handle_entry_scoring_state_change();

-- ---------------------------------------------------------------------------
-- 2. Suppress no-op class writes at the source.
-- ---------------------------------------------------------------------------
-- Body copied from the LIVE definition, not from a migration file: several
-- migrations have replaced this function and the newest filename is not the
-- newest definition.
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
      WHERE COALESCE(entry_status, '') NOT IN ('scratched', 'withdrawn', 'cancelled')
        AND check_in_status IS DISTINCT FROM 'pulled'
    )::integer,
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN ('scratched', 'withdrawn', 'cancelled')
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
-- CREATE OR REPLACE preserves the existing ACL, so this is a no-op against the
-- applied database; it is here so the migration carries its own disposition for
-- a migrations-only ACL rebuild.
REVOKE ALL ON FUNCTION public.refresh_class_scoring_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_class_scoring_state(uuid) TO service_role;

COMMENT ON FUNCTION public.refresh_class_scoring_state(uuid) IS
  'Derives classes.status from non-deleted entry scoring state using the '
  'expected/accounted-for completeness definition. Skips the status write '
  '(still refreshes scored_count) when status_source = ''manual'', but still '
  'strips placements from soft-deleted rows there. Clears '
  'reopened_after_closeout_at on legitimate completion. Reads shows.is_nationals '
  'for the placement ranking. The derived terminal branches clear placements '
  'class-wide including soft-deleted rows, so emptying a completed class cannot '
  'leave a tombstone holding a stale placement; the final_placement IS NOT NULL '
  'guard keeps those clears from rewriting a whole class of no-ops. Every '
  'UPDATE public.classes is guarded by an IS DISTINCT FROM test so a write that '
  'would change nothing never takes the class row lock, bumps the replication '
  'version or fans out a realtime broadcast (MYK9-248).';

COMMIT;

NOTIFY pgrst, 'reload schema';
