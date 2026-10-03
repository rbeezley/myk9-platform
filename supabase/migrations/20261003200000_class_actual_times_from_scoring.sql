-- Ringside scoring stamps a class's actual start and finish (owner, 2026-10-03).
--
-- refresh_class_scoring_state already moves a class it derives (status_source
-- not 'manual') to in_progress when the first dog is accounted for and to
-- completed when every dog is. Only the secretary's manual status change ever
-- stamped classes.actual_start_time / actual_end_time, so a class run entirely
-- through ringside scoring never had either, and the show home could only say
-- "Start not recorded".
--
-- Rules, all inside the derived (non-manual) branch:
--   * Start: filled only when empty, from the earliest ring_entry_time or
--     scoring_completed_at among the class's live entries, else now() (the
--     transaction that accounted for the first dog).
--   * Finish: filled only when empty on completion, from the latest
--     scoring_completed_at, else now().
--   * Back to in_progress: the finish is cleared (the class is not finished).
--   * Back to upcoming: both are cleared, matching the manual reset, so
--     downstream readiness never reads stale timing as "ran".
-- A manual class keeps whatever the secretary stamped: this function returns
-- before touching it, as before.
--
-- Accepted edge (migration-auditor, 2026-10-03): a manually COMPLETED class
-- with no scored dogs that then receives a new entry flips to derived
-- (handle_entry_scoring_state_change) and lands in the upcoming branch. Its
-- status already reset to upcoming before this change; its timing now resets
-- with it, as the manual reset to not-started does.
--
-- Everything else is the 20260904160000 body, unchanged.

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
        AND (is_scored = true OR result_status IN ('absent', 'excused'))
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
  'accounted entries are scored or have result_status absent/excused (MYK9-356). '
  'A derived class also gets actual_start_time / actual_end_time from its '
  'entries'' ring-entry and scoring times; a manual class keeps its own.';

-- Backfill derived classes that ran before this change, from the same
-- evidence. Status does not move, so no status push fires and no trigger needs
-- disabling (a disabled trigger left behind by a failed statement would be
-- worse than none).
UPDATE public.classes c
SET
  actual_start_time = COALESCE(c.actual_start_time, timing.first_activity),
  actual_end_time = CASE
    WHEN c.status = 'completed' THEN COALESCE(c.actual_end_time, timing.last_scored)
    ELSE c.actual_end_time
  END
FROM (
  SELECT
    e.class_id,
    MIN(LEAST(e.ring_entry_time, e.scoring_completed_at)) AS first_activity,
    MAX(e.scoring_completed_at) FILTER (WHERE e.is_scored = true) AS last_scored
  FROM public.entries e
  WHERE e.deleted_at IS NULL
  GROUP BY e.class_id
) timing
WHERE timing.class_id = c.id
  AND c.status_source IS DISTINCT FROM 'manual'
  AND c.status IN ('in_progress', 'completed')
  AND (
    (c.actual_start_time IS NULL AND timing.first_activity IS NOT NULL)
    OR (c.status = 'completed' AND c.actual_end_time IS NULL AND timing.last_scored IS NOT NULL)
  );
