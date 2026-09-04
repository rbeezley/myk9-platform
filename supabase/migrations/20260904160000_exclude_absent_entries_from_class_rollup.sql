-- MYK9-356: keep class completion and TV running-order populations aligned
-- with the client accounting rule. An entry_status of `absent` is terminal and
-- must not remain in the expected-run denominator. `result_status = 'absent'`
-- remains an accounted-for outcome for rows whose lifecycle is still active.
--
-- This is a follow-up migration rather than an edit to
-- 20260902174500_class_rollup_excludes_moved_and_not_accepted.sql because the
-- earlier migration may already be applied in a shared database.

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
      is_scoring_finalized = false
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'upcoming'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false);

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

REVOKE ALL ON FUNCTION public.refresh_class_scoring_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_class_scoring_state(uuid) TO service_role;

COMMENT ON FUNCTION public.refresh_class_scoring_state(uuid) IS
  'Derives class completion from non-deleted entries. Expected entries exclude '
  'scratched, withdrawn, moved, not_accepted, absent, and pulled rows; '
  'accounted entries are scored or have result_status absent/excused (MYK9-356).';

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
        AND COALESCE(NEW.entry_status, '') NOT IN (
          'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
        )
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

REVOKE ALL ON FUNCTION public.handle_entry_scoring_state_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_entry_scoring_state_change() TO service_role;

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
   AND lower(coalesce(e.entry_status, '')) NOT IN (
     'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
   )
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
    AND lower(coalesce(e.entry_status, '')) NOT IN (
      'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
    )
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

REVOKE ALL ON FUNCTION public.tv_class_entry_counts(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_class_entry_counts(uuid, uuid[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.tv_board_entries(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_board_entries(uuid, uuid[]) TO anon, authenticated;

-- Re-derive only classes whose expected population may have changed.
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
          AND e.entry_status IN ('moved', 'not_accepted', 'absent')
      )
  LOOP
    PERFORM public.refresh_class_scoring_state(r.id);
  END LOOP;
END $$;

ALTER TABLE public.classes ENABLE TRIGGER trg_notify_class_status_push;

COMMIT;

NOTIFY pgrst, 'reload schema';
