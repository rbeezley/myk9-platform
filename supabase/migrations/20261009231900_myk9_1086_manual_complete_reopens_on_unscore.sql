-- MYK9-1086: resetting a score in a class marked Complete by hand left the class
-- Complete, so the cockpit kept reading "Complete" and "Scoring complete: Done"
-- with a dog unscored. Copied from the latest definition of
-- handle_entry_scoring_state_change (20260904160000); only the score-reset
-- reopen is new. Scoring more dogs into a manually closed class still leaves
-- it closed (class_status_auto_derivation_test 3.2).

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

  -- MYK9-1086: a score reset in a completed class reopens it, exactly like a
  -- late expected entry above. Without this a class the secretary marked
  -- Complete by hand (status_source = 'manual') stayed Complete with a dog
  -- unscored, because the derivation skips manual classes. Only the
  -- scored -> unscored edge reopens: scoring more dogs into a manually closed
  -- class still leaves it closed (class_status_auto_derivation_test 3.2).
  IF NEW.class_id IS NOT NULL
     AND NEW.class_id IS NOT DISTINCT FROM OLD.class_id
     AND NEW.deleted_at IS NULL
     -- Same expected-entry filter as the late-entry branch: clearing a stale
     -- score on a scratched or pulled dog is not a dog owed a run.
     AND COALESCE(NEW.entry_status, '') NOT IN (
       'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
     )
     AND NEW.check_in_status IS DISTINCT FROM 'pulled'
     AND NEW.result_status IS DISTINCT FROM 'absent'
     AND NEW.result_status IS DISTINCT FROM 'excused'
     AND OLD.is_scored = true
     AND NEW.is_scored IS DISTINCT FROM true THEN
    UPDATE public.classes
    SET
      status_source = 'derived',
      reopened_after_closeout_at = now()
    WHERE id = NEW.class_id
      AND status = 'completed';
  END IF;

  PERFORM public.refresh_class_scoring_state(NEW.class_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_entry_scoring_state_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_entry_scoring_state_change() TO service_role;
