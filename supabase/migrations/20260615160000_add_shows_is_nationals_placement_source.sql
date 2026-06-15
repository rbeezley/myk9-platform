-- Wire a real Nationals/Regular discriminator into placement finalization.
--
-- Background — migration 20260525170000 drove Nationals-vs-Regular placement
-- selection off `shows.type ILIKE '%national%'`. Migration 040 had already
-- renamed `shows.type` → `shows.organization` (which stores sanctioning-body
-- codes: 'AKC', 'UKC', 'ASCA', …), so that predicate never matched and, after
-- the rename, hard-errored. Migration 20260526200000 stopped the error by
-- hard-coding `v_is_nationals := false` and left a TODO to land a real
-- discriminator column.
--
-- This migration completes that TODO. It adds `shows.is_nationals` and points
-- `refresh_class_scoring_state` at it via the existing class→trial→show join.
-- Default is `false`, so every existing show keeps the Regular placement
-- algorithm (no behavior change) until a show is explicitly flagged Nationals.
--
-- Why it matters: `recalculate_class_placements` ranks Nationals by
-- `points_earned DESC` and Regular by `total_faults ASC` — opposite primary
-- sort keys. A Nationals event scored under the Regular branch produces
-- inverted placements, not just mis-ordered ties.

-- 1. Discriminator column. The function below is SECURITY DEFINER and reads
--    shows.is_nationals as the function owner, bypassing RLS — no grant is
--    needed for the placement path. For client reads/writes (PostgREST), the
--    existing table-level grants on public.shows cover new columns
--    automatically and existing shows RLS governs who can update it. No new
--    grant or policy required.
ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS is_nationals boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shows.is_nationals IS
  'When true, classes under this show finalize placements with the Nationals '
  'ranking (points_earned DESC) instead of Regular (total_faults ASC). '
  'Drives recalculate_class_placements via refresh_class_scoring_state.';

-- 2. Read the discriminator from the new column instead of the hard-coded
--    false. Body is otherwise identical to 20260526200000.
CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state(p_class_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count integer;
  v_scored_count integer;
  v_is_nationals boolean;
BEGIN
  IF p_class_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE is_scored = true)::integer
  INTO v_total_count, v_scored_count
  FROM public.entries
  WHERE class_id = p_class_id;

  IF v_total_count = 0 THEN
    UPDATE public.classes
    SET
      scored_count = 0,
      is_scoring_finalized = false
    WHERE id = p_class_id;
    RETURN;
  END IF;

  IF v_scored_count = v_total_count THEN
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
      is_scoring_finalized = true
    WHERE id = p_class_id;

    PERFORM public.recalculate_class_placements(ARRAY[p_class_id], COALESCE(v_is_nationals, false));
  ELSIF v_scored_count > 0 THEN
    UPDATE public.classes
    SET
      status = 'in_progress',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id;

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id;
  ELSE
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = 0,
      is_scoring_finalized = false
    WHERE id = p_class_id;

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.refresh_class_scoring_state(uuid) IS
  'Refreshes class status/finalization and placement side effects after entry '
  'scoring changes. Reads shows.is_nationals to pick the Nationals vs Regular '
  'placement ranking.';

NOTIFY pgrst, 'reload schema';
