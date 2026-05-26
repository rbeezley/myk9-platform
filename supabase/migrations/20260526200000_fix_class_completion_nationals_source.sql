-- Fix: refresh_class_scoring_state references shows.type, which no longer exists.
--
-- Background — migration 040_rename_show_type_to_organization renamed
-- `shows.type` → `shows.organization`. The prior body of
-- refresh_class_scoring_state (introduced by
-- 20260525170000_server_side_scoring_completion) tried to read
-- `s.type ILIKE '%national%'` to drive Nationals vs Regular placement
-- selection. After the rename:
--
--   1. The column no longer exists. When the LAST entry in a class is
--      scored (`v_scored_count = v_total_count`), the trigger's
--      `SELECT COALESCE(s.type, '') ILIKE '%national%'` raises
--      `column s.type does not exist`. The triggering `UPDATE entries`
--      statement aborts. Class completion + placement finalization never
--      runs, and the client mutation surfaces as a generic DB error.
--
--   2. Even if we substitute the renamed column, `organization` stores
--      sanctioning body codes ('AKC', 'UKC', 'ASCA', …). It never
--      contained the substring 'national', so the old check was already
--      effectively a hard-coded `false` in practice — the bug was
--      latent until the column rename turned it from silent-misfeature
--      into hard error.
--
-- Fix: default `v_is_nationals` to `false` and remove the bad column
-- reference entirely. This preserves the original observable behavior
-- (regular placement algorithm) for every show in the database today.
-- A real Nationals/Regular signal needs to be wired separately (likely
-- a per-trial flag or a sport_templates join); doing so is tracked as
-- a Phase 1 follow-up so the critical column-rename bug ships
-- independently.

CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state(p_class_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count integer;
  v_scored_count integer;
  -- TODO(unify/phase-1): replace the hard-coded `false` below with a
  -- real Nationals/Regular source once a discriminator column lands
  -- (candidate: `trials.registry_id` extension, or a new
  -- `shows.is_nationals` boolean). The original code attempted to read
  -- `shows.type ILIKE '%national%'` but (a) the column was renamed to
  -- `organization` in migration 040 and (b) `organization` stores
  -- sanctioning bodies, not nationals-vs-regular — the predicate never
  -- matched, so this default preserves the historical behavior.
  v_is_nationals constant boolean := false;
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
    UPDATE public.classes
    SET
      status = 'completed',
      scored_count = v_scored_count,
      is_scoring_finalized = true
    WHERE id = p_class_id;

    PERFORM public.recalculate_class_placements(ARRAY[p_class_id], v_is_nationals);
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
  'Refreshes class status/finalization and placement side effects after entry scoring changes. '
  'v_is_nationals is hard-coded to false until a real Nationals discriminator lands — see Phase 1 TODO.';

NOTIFY pgrst, 'reload schema';
