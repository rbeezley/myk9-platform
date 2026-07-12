-- Fix: the INSERT reopen guard in handle_entry_scoring_state_change() must key
-- on CLOSEOUT, not on the manual marker.
--
-- OpenSpec change: class-status-auto-derivation (code-review finding 3).
--
-- The 20260712180000 body used:
--   IF v_class_status = 'completed' OR v_status_source = 'manual'
-- That wrongly reopens a manually-STARTED (in_progress, status_source='manual')
-- class on any routine expected-entry INSERT (late registration, or a move-up
-- whose target is that class): it cleared the manual marker, stamped
-- reopened_after_closeout_at, and raised a false "reopened after closeout"
-- attention flag even though the class was never closed out.
--
-- Correct guard keys on closeout only:
--   IF v_class_status = 'completed'
-- A completed class (derived OR manually completed) still reopens on a late
-- entry (Q6). A manually-STARTED in_progress class does NOT reopen: the entries
-- trigger still fires refresh_class_scoring_state, which sees
-- status_source='manual' and early-returns, leaving it in_progress/manual.
--
-- Only handle_entry_scoring_state_change() changes. refresh_class_scoring_state,
-- the trigger definition, and the additive columns from 20260712180000 are
-- unaffected. Body is verbatim from 20260712180000 except the guard line.

CREATE OR REPLACE FUNCTION public.handle_entry_scoring_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_expected boolean;
  v_class_status text;
  v_status_source text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_class_scoring_state(OLD.class_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.class_id IS NOT NULL THEN
      v_is_expected := (
        COALESCE(NEW.entry_status, '') NOT IN ('scratched', 'withdrawn', 'cancelled')
        AND NEW.check_in_status IS DISTINCT FROM 'pulled'
      );

      IF v_is_expected THEN
        SELECT status, status_source
        INTO v_class_status, v_status_source
        FROM public.classes
        WHERE id = NEW.class_id;

        -- Late entry into a CLOSED-OUT class: reopen it and clear any manual
        -- override. Keys on closeout only (v_class_status = 'completed'). A
        -- manually-STARTED (in_progress/manual) class is NOT reopened here.
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

  -- TG_OP = 'UPDATE': preserve the original OLD/NEW class_id handling.
  IF OLD.class_id IS DISTINCT FROM NEW.class_id THEN
    PERFORM public.refresh_class_scoring_state(OLD.class_id);
  END IF;

  PERFORM public.refresh_class_scoring_state(NEW.class_id);

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
