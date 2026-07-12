-- Class status auto-derivation: expected/accounted-for completeness, manual
-- override marker, and late-entry reopen. Extends the SINGLE existing scoring
-- authority (refresh_class_scoring_state + handle_entry_scoring_state_change +
-- entries_refresh_class_scoring_state trigger). No second competing trigger.
--
-- OpenSpec change: class-status-auto-derivation. Builds on the LIVE function
-- body from 20260615160000 (is_nationals discriminator), not the original
-- 20260525170000.
--
-- Confirmed decisions (design.md D1/D2):
--   * expected  = entry_status NOT IN ('scratched','withdrawn','cancelled')
--                 AND check_in_status IS DISTINCT FROM 'pulled'
--   * accounted = is_scored = true OR result_status IN ('absent','excused')
--   * complete  = expected > 0 AND accounted = expected
--   * backfill  = YES, class-status push webhook suppressed during recompute.
--
-- CHECK values verified against live migrations:
--   entries.entry_status  (174): includes 'scratched','withdrawn' (no 'cancelled'
--                                 in the set — NOT IN is harmless/defensive).
--   entries.check_in_status (092): includes 'pulled'.
--   entries.result_status (042): includes 'absent','excused'.
--   classes.status (138): 'upcoming','setup','in_progress','completed','cancelled'.

-- 1. Additive columns. classes already has table-level grants to the app roles;
--    Postgres table-level privileges automatically cover columns added later, so
--    no new GRANT is required for these additive columns. RLS on classes is
--    unchanged. Function stays SECURITY DEFINER and bypasses RLS for the
--    derivation path.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS status_source text NOT NULL DEFAULT 'derived'
    CHECK (status_source IN ('derived', 'manual'));

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS reopened_after_closeout_at timestamptz NULL;

COMMENT ON COLUMN public.classes.status_source IS
  'Who owns classes.status: ''derived'' (server auto-derivation writes it) or '
  '''manual'' (a secretary Mark Complete/Mark Started override that the '
  'derivation must not overwrite).';

COMMENT ON COLUMN public.classes.reopened_after_closeout_at IS
  'Stamped when a late expected entry reopens a completed/manually-closed class. '
  'Read by the show-map attention layer as a class-level attention reason. '
  'Cleared when the class next legitimately reaches ''completed''.';

-- 2. Redefine the derivation function. Body starts from the live 20260615160000
--    version, changing ONLY: (a) expected/accounted-for counting, (b) a
--    status_source='manual' early-return that still refreshes scored_count, and
--    (c) clearing reopened_after_closeout_at on legitimate completion. The
--    is_nationals join, placement recalc, SECURITY DEFINER and search_path are
--    preserved.
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

  -- expected  = will-score entries (not scratched/withdrawn/cancelled, not pulled)
  -- accounted = is_scored OR non-scored terminal outcome (absent/excused)
  -- scored_count keeps its original meaning (# of is_scored rows) for display.
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
  WHERE class_id = p_class_id;

  -- Manual override: never touch status, but keep scored_count live for display.
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
    -- No expected entries (empty, or all scratched/withdrawn/pulled): stay upcoming.
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id;

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id;
  ELSIF v_accounted_count = v_expected_count THEN
    -- Every expected entry accounted-for: complete + finalize + recalc placements.
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
    -- Some but not all expected entries accounted-for: in progress.
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
    -- Expected entries exist but none accounted-for yet: upcoming.
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id;

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.refresh_class_scoring_state(uuid) IS
  'Derives classes.status from entry scoring state using the expected/'
  'accounted-for completeness definition. Skips the status write (still '
  'refreshes scored_count) when status_source = ''manual''. Clears '
  'reopened_after_closeout_at on legitimate completion. Reads shows.is_nationals '
  'for the placement ranking.';

-- 3. Redefine the trigger handler to cover INSERT and DELETE as well as UPDATE.
--    On INSERT of an *expected* entry into a completed or manually-closed class:
--    clear the override, stamp reopened_after_closeout_at, then let refresh set
--    status (which resolves to in_progress since a fresh unscored expected entry
--    is now outstanding).
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

        -- Late entry into a closed class: reopen it and clear any manual override.
        IF v_class_status = 'completed' OR v_status_source = 'manual' THEN
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

-- 4. Recreate the trigger so it fires on INSERT and DELETE in addition to the
--    scoring-column UPDATE set. entry_status and check_in_status are added to
--    the watch list: the completeness math and the INSERT reopen path read them,
--    and scratching (entry_status), pulling (check_in_status), or withdrawing a
--    dog is a standalone UPDATE that touches none of the six scoring columns —
--    without them the trigger would not fire and classes.status would stay
--    stale, reproducing the exact bug this change fixes. No recursion risk: the
--    functions write only classes.* and entries.final_placement, none of which
--    are in this watch list.
--    INSERT/DELETE rows have no usable OLD/NEW pair for the UPDATE-only WHEN
--    guard, so the WHEN guard is dropped and the function guards by TG_OP
--    instead. INTENTIONAL behavior change: dropping the WHEN guard means a
--    same-value UPDATE to a watched column now re-fires a full (idempotent)
--    recompute where the old guard suppressed it — these no-op re-fires are
--    expected, not a bug. This remains the SINGLE scoring-side writer of
--    classes.status.
DROP TRIGGER IF EXISTS entries_refresh_class_scoring_state ON public.entries;

CREATE TRIGGER entries_refresh_class_scoring_state
  AFTER INSERT OR DELETE OR UPDATE OF
    class_id,
    entry_status,
    check_in_status,
    is_scored,
    result_status,
    search_time_seconds,
    total_faults,
    points_earned
  ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_entry_scoring_state_change();

-- 5. One-time backfill: recompute derived status for every non-manual class so
--    the corrected completeness definition reaches classes currently stuck
--    in_progress behind a scratch/no-show. The class-status push webhook is
--    suppressed for the duration by disabling its trigger inside this
--    transaction (the push trigger has no session-GUC hook to check, so
--    disable/enable is the clean match). The scoring-push trigger fires on
--    scoring_completed_at, which the backfill never writes, so it is unaffected.
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
