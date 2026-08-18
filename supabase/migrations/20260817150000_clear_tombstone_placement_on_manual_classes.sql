-- Complete the "a soft-deleted entry never holds a final_placement" invariant
-- across the manual-status early return.
--
-- 20260817140000_clear_placement_on_soft_deleted_entries.sql fixed the three
-- DERIVED terminal branches. It left one path uncovered, found in review of
-- that migration: refresh_class_scoring_state returns early when
-- classes.status_source = 'manual', after refreshing scored_count only. A
-- placed entry soft-deleted in a manually-pinned class therefore keeps its
-- final_placement, and view_entry_with_results, view_myk9q_entries and
-- view_stats_summary do not filter deleted_at -- the same exposure, reached by
-- a different door.
--
-- The clear here is TOMBSTONE-SCOPED, not the class-wide clear the derived
-- branches use, and the difference is load-bearing. `manual` means a human
-- pinned this class's status; its placements are equally deliberate. A
-- class-wide `WHERE class_id = p_class_id AND final_placement IS NOT NULL`
-- would wipe every placement in that class on ANY triggering entry write --
-- turning a stale-tombstone display bug into silent destruction of published
-- results. Restricting to `deleted_at IS NOT NULL` removes exactly the rows
-- that must not be placed and touches nothing a secretary set.
--
-- The early RETURN stays: the manual branch must not write classes.status, and
-- must not call recalculate_class_placements, which would re-rank a class whose
-- ordering a human may have overridden.
--
-- Ringside cost is unchanged. The clear carries BOTH `deleted_at IS NOT NULL`
-- and the `final_placement IS NOT NULL` guard from 20260727235900, so a
-- check-in on a manual class with no tombstones matches zero rows -- the same
-- bounded shape the derived branches have. Manual classes are also not on the
-- show-desk hot path: as of 2026-08-17 every class in the applied database is
-- status_source = 'derived'.
--
-- Everything else in this body is byte-identical to 20260817140000, including
-- the SA-027 `SET search_path = ''` conversion.

BEGIN;

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
    UPDATE public.classes
    SET scored_count = v_scored_count
    WHERE id = p_class_id;

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
    WHERE id = p_class_id;

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
    WHERE id = p_class_id;

    PERFORM public.recalculate_class_placements(ARRAY[p_class_id], COALESCE(v_is_nationals, false));
  ELSIF v_accounted_count > 0 THEN
    UPDATE public.classes
    SET
      status = 'in_progress',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id;

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
    WHERE id = p_class_id;

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  END IF;
END;
$$;

-- Restate the execute decision from 20260703120000_revoke_scoring_fns_from_public.sql.
-- CREATE OR REPLACE preserves the existing ACL, so this is a no-op against the
-- applied database (live is postgres=X, service_role=X); it is here so the
-- migration carries its own disposition for a migrations-only ACL rebuild.
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
  'guard keeps those clears from rewriting a whole class of no-ops.';

COMMIT;

NOTIFY pgrst, 'reload schema';
