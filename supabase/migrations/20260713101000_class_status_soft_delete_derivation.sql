-- Class status derivation must ignore soft-deleted entries. The prior
-- auto-derivation counted entries.deleted_at rows and did not fire when that
-- column changed, so deleting an entry could leave classes.status stale.

CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state(p_class_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    RETURN;
  END IF;

  IF v_expected_count = 0 THEN
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id;

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND deleted_at IS NULL;
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

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND deleted_at IS NULL;
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
      AND deleted_at IS NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.refresh_class_scoring_state(uuid) IS
  'Derives classes.status from non-deleted entry scoring state using the '
  'expected/accounted-for completeness definition. Skips the status write '
  '(still refreshes scored_count) when status_source = ''manual''. Clears '
  'reopened_after_closeout_at on legitimate completion. Reads shows.is_nationals '
  'for the placement ranking.';

CREATE OR REPLACE FUNCTION public.handle_entry_scoring_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        AND COALESCE(NEW.entry_status, '') NOT IN ('scratched', 'withdrawn', 'cancelled')
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

DROP TRIGGER IF EXISTS entries_refresh_class_scoring_state ON public.entries;

CREATE TRIGGER entries_refresh_class_scoring_state
  AFTER INSERT OR DELETE OR UPDATE OF
    class_id,
    entry_status,
    check_in_status,
    deleted_at,
    is_scored,
    result_status,
    search_time_seconds,
    total_faults,
    points_earned
  ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_entry_scoring_state_change();

ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.classes WHERE status_source <> 'manual'
  LOOP
    PERFORM public.refresh_class_scoring_state(r.id);
  END LOOP;
END $$;

ALTER TABLE public.classes ENABLE TRIGGER trg_notify_class_status_push;

NOTIFY pgrst, 'reload schema';
