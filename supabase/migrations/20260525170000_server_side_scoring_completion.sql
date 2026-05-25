-- Move myK9Q scoring side effects into the database.
--
-- A queued entries UPDATE is now enough to:
--   1. refresh class scoring status / finalized state
--   2. recalculate final placements when the class is complete
--
-- This removes the need for a second client-side submitScore() write whose
-- only remaining purpose was completion + placement orchestration.

CREATE OR REPLACE FUNCTION public.recalculate_class_placements(
  p_class_ids uuid[],
  p_is_nationals boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class_id uuid;
BEGIN
  FOREACH v_class_id IN ARRAY p_class_ids
  LOOP
    -- Clear stale placements first so changed / reset scores cannot leave
    -- old placement values behind.
    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = v_class_id;

    IF p_is_nationals THEN
      UPDATE public.entries e
      SET final_placement = ranked.placement
      FROM (
        SELECT
          e2.id,
          ROW_NUMBER() OVER (
            ORDER BY
              e2.points_earned DESC NULLS LAST,
              e2.search_time_seconds ASC NULLS LAST
          ) AS placement
        FROM public.entries e2
        WHERE e2.class_id = v_class_id
          AND e2.is_scored = true
          AND e2.result_status = 'qualified'
      ) ranked
      WHERE e.id = ranked.id;
    ELSE
      UPDATE public.entries e
      SET final_placement = ranked.placement
      FROM (
        SELECT
          e2.id,
          ROW_NUMBER() OVER (
            ORDER BY
              e2.total_faults ASC NULLS LAST,
              e2.search_time_seconds ASC NULLS LAST
          ) AS placement
        FROM public.entries e2
        WHERE e2.class_id = v_class_id
          AND e2.is_scored = true
          AND e2.result_status = 'qualified'
      ) ranked
      WHERE e.id = ranked.id;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.recalculate_class_placements(uuid[], boolean) IS
  'Recalculates final placements for scored qualified entries in each supplied class.';

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
    SELECT COALESCE(s.type, '') ILIKE '%national%'
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
  'Refreshes class status/finalization and placement side effects after entry scoring changes.';

CREATE OR REPLACE FUNCTION public.handle_entry_scoring_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.class_id IS DISTINCT FROM NEW.class_id THEN
      PERFORM public.refresh_class_scoring_state(OLD.class_id);
    END IF;

    PERFORM public.refresh_class_scoring_state(NEW.class_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entries_refresh_class_scoring_state ON public.entries;

CREATE TRIGGER entries_refresh_class_scoring_state
  AFTER UPDATE OF
    class_id,
    is_scored,
    result_status,
    search_time_seconds,
    total_faults,
    points_earned
  ON public.entries
  FOR EACH ROW
  WHEN (
    OLD.class_id IS DISTINCT FROM NEW.class_id OR
    OLD.is_scored IS DISTINCT FROM NEW.is_scored OR
    OLD.result_status IS DISTINCT FROM NEW.result_status OR
    OLD.search_time_seconds IS DISTINCT FROM NEW.search_time_seconds OR
    OLD.total_faults IS DISTINCT FROM NEW.total_faults OR
    OLD.points_earned IS DISTINCT FROM NEW.points_earned
  )
  EXECUTE FUNCTION public.handle_entry_scoring_state_change();

NOTIFY pgrst, 'reload schema';
