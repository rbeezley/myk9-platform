-- MYK9-1230: a class whose status was set by hand (status_source = 'manual')
-- never received placements, because refresh_class_scoring_state returned from
-- its manual branch before recalculate_class_placements could run. Check Scores
-- reads entries.final_placement, so it showed an empty Place column while the
-- Fix view (which ranks on the client) showed placements.
--
-- Found live on 2026-10-16: Vehicle Novice A (b7f1d753-...) was completed by
-- hand at 21:24 UTC on 10-12, its last dog was scored at 21:49, and all six
-- dogs were accounted for with every final_placement NULL.
--
-- Change: copied verbatim from the latest definition
-- (20261011003700_myk9_1011_disqualified_result.sql) with one addition in the
-- manual branch: when expected > 0 and accounted = expected, rank the class
-- with the same is_nationals lookup the derived branch uses. The manual branch
-- still never writes status, finalization or times. While the class is not
-- fully accounted for it leaves live placements as they are
-- (supabase/tests/placement_soft_delete_ranking_test.sql 5.3); once it is, the
-- ranking is the same as a derived class's, so a dog edited to a non-qualifying
-- result loses its placement there too.
-- recalculate_class_placements writes only rows whose placement changes
-- (MYK9-1045), so a refresh over an already-placed class writes nothing.

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
  v_first_activity timestamptz;
  v_last_scored timestamptz;
BEGIN
  IF p_class_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN (
        'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
      )
        AND check_in_status IS DISTINCT FROM 'pulled'
    )::integer,
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN (
        'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
      )
        AND check_in_status IS DISTINCT FROM 'pulled'
        AND (is_scored = true OR result_status IN ('absent', 'excused', 'disqualified'))
    )::integer,
    COUNT(*) FILTER (WHERE is_scored = true)::integer
  INTO v_expected_count, v_accounted_count, v_scored_count
  FROM public.entries
  WHERE class_id = p_class_id
    AND deleted_at IS NULL;

  -- When the class actually ran. LEAST ignores NULLs, so either recorded
  -- moment of a dog counts toward the start.
  SELECT
    MIN(LEAST(ring_entry_time, scoring_completed_at)),
    MAX(scoring_completed_at) FILTER (WHERE is_scored = true)
  INTO v_first_activity, v_last_scored
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
    WHERE id = p_class_id
      AND scored_count IS DISTINCT FROM v_scored_count;

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND deleted_at IS NOT NULL
      AND final_placement IS NOT NULL;

    -- MYK9-1230: a class completed by hand still owes its placements once every
    -- expected dog is accounted for. Status stays the human's. Nothing here
    -- runs while the class is partly scored, so it keeps the placements it has.
    IF v_expected_count > 0 AND v_accounted_count = v_expected_count THEN
      SELECT s.is_nationals
      INTO v_is_nationals
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
      JOIN public.shows s ON s.id = t.show_id
      WHERE c.id = p_class_id;

      PERFORM public.recalculate_class_placements(ARRAY[p_class_id], COALESCE(v_is_nationals, false));
    END IF;

    RETURN;
  END IF;

  IF v_expected_count = 0 THEN
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false,
      actual_start_time = NULL,
      actual_end_time = NULL
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'upcoming'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false
           OR actual_start_time IS NOT NULL
           OR actual_end_time IS NOT NULL);

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
      reopened_after_closeout_at = NULL,
      actual_start_time = COALESCE(actual_start_time, v_first_activity, now()),
      -- Never before the start: a start from now() can postdate a backdated
      -- score that arrives later by offline sync.
      actual_end_time = GREATEST(
        COALESCE(actual_end_time, v_last_scored, now()),
        COALESCE(actual_start_time, v_first_activity, now())
      )
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'completed'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM true
           OR reopened_after_closeout_at IS NOT NULL
           OR actual_start_time IS NULL
           OR actual_end_time IS NULL);

    PERFORM public.recalculate_class_placements(ARRAY[p_class_id], COALESCE(v_is_nationals, false));
  ELSIF v_accounted_count > 0 THEN
    UPDATE public.classes
    SET
      status = 'in_progress',
      scored_count = v_scored_count,
      is_scoring_finalized = false,
      actual_start_time = COALESCE(actual_start_time, v_first_activity, now()),
      actual_end_time = NULL
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'in_progress'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false
           OR actual_start_time IS NULL
           OR actual_end_time IS NOT NULL);

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  ELSE
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false,
      actual_start_time = NULL,
      actual_end_time = NULL
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'upcoming'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false
           OR actual_start_time IS NOT NULL
           OR actual_end_time IS NOT NULL);

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_class_scoring_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_class_scoring_state(uuid) TO service_role;

COMMENT ON FUNCTION public.refresh_class_scoring_state(uuid) IS
  'Derives class completion from non-deleted entries. Expected entries exclude '
  'scratched, withdrawn, moved, not_accepted, absent, and pulled rows; '
  'accounted entries are scored or have result_status absent/excused/disqualified (MYK9-356, MYK9-1011). '
  'A derived class also gets actual_start_time / actual_end_time from its '
  'entries'' ring-entry and scoring times; a manual class keeps its own status '
  'and times, but is still placed once every expected entry is accounted for (MYK9-1230).';

-- ---------------------------------------------------------------------------
-- Backfill: place every manual class that is already fully accounted for.
-- ---------------------------------------------------------------------------
-- The class-status push webhook is suppressed for the duration: this corrects
-- stale state rather than reporting a live scoring event (same pattern as
-- 20260902174500). The manual branch never writes status, so nothing would be
-- pushed anyway; the guard keeps that true if the function changes later.
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.id
    FROM public.classes c
    WHERE c.status_source = 'manual'
      AND c.deleted_at IS NULL
  LOOP
    PERFORM public.refresh_class_scoring_state(r.id);
  END LOOP;
END;
$$;

ALTER TABLE public.classes ENABLE TRIGGER trg_notify_class_status_push;
