-- MYK9-1863: the server refuses score and check-in writes for a cancelled class.
--
-- #3778 / MYK9-1847 stopped ringside OFFERING scoring and check-in on a cancelled
-- class, but a stale phone, a queued offline mutation or a direct PostgREST write
-- could still record a result or check a dog in. This trigger is the server's own
-- refusal, on every path that updates an entry (ringside_update_entry, paper
-- scoring, a manager's direct write), modelled on
-- entries_block_score_when_awaiting_registration (MYK9-1162).
--
-- Cancellation is classes.status = 'cancelled'; each section of an A/B pair is its
-- own class row, so a cancelled section never blocks its partner.
--
-- Still allowed in a cancelled class, because each takes something away rather
-- than recording that the class ran:
--   * a score RESET (every changed score column cleared to null, false, zero or
--     'pending'), so a result recorded before the cancel can be taken off;
--   * a check-in reset to 'no-status' (a NULL check-in counts as a write), a Pull
--     ('pulled'), and taking a dog out of the ring (is_in_ring false);
--   * every non-score, non-check-in write (withdrawals, notes, moves, payments).
-- The class keeps its status, so a retry can never land: 23514 dead-letters a
-- queued mutation on its first failure (isRetryableError), like the held-entry
-- refusal. Un-cancelling the class re-opens writes.

CREATE OR REPLACE FUNCTION private.entries_refuse_cancelled_class_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- The result columns of entries_block_score_when_awaiting_registration
  -- (20261014214300); keep the two lists in sync.
  v_score_cols constant text[] := ARRAY[
    'is_scored', 'result_status',
    'search_time_seconds',
    'area1_time_seconds', 'area2_time_seconds', 'area3_time_seconds', 'area4_time_seconds',
    'total_correct_finds', 'total_incorrect_finds', 'total_faults', 'no_finish_count',
    'area1_correct', 'area1_incorrect', 'area1_faults',
    'area2_correct', 'area2_incorrect', 'area2_faults',
    'area3_correct', 'area3_incorrect', 'area3_faults',
    'total_score', 'points_earned', 'points_possible',
    'bonus_points', 'penalty_points',
    'time_over_limit', 'time_limit_exceeded_seconds',
    'disqualification_reason',
    'scoring_started_at', 'scoring_completed_at'
  ];
  v_new jsonb;
  v_old jsonb;
  v_score_write boolean;
BEGIN
  -- Cheapest gate first: one primary-key probe. Nearly every entry write is in a
  -- running class and leaves here without building the row's jsonb.
  IF NOT EXISTS (
    SELECT 1 FROM public.classes c
     WHERE c.id = NEW.class_id AND c.status = 'cancelled'
  ) THEN
    RETURN NEW;
  END IF;

  IF (NEW.check_in_status IS DISTINCT FROM OLD.check_in_status
      AND NEW.check_in_status IS DISTINCT FROM 'no-status'
      AND NEW.check_in_status IS DISTINCT FROM 'pulled')
     OR (NEW.is_in_ring IS TRUE AND OLD.is_in_ring IS NOT TRUE) THEN
    RAISE EXCEPTION 'This class is cancelled. Scores and check-ins are closed.'
      USING ERRCODE = '23514', HINT = 'class_cancelled';
  END IF;

  -- A score write is any score column that changes to a value that records
  -- something. Clearing a column (null, false, zero, 'pending') records nothing,
  -- so a reset passes whole, and a fault-only correction on an unscored entry
  -- does not pass as one.
  v_new := to_jsonb(NEW);
  v_old := to_jsonb(OLD);
  SELECT bool_or(
           (v_new -> k) IS DISTINCT FROM (v_old -> k)
           AND (v_new -> k) IS NOT NULL
           AND (v_new -> k) NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '"pending"'::jsonb))
    INTO v_score_write
    FROM unnest(v_score_cols) AS k;

  IF v_score_write IS TRUE THEN
    RAISE EXCEPTION 'This class is cancelled. Scores and check-ins are closed.'
      USING ERRCODE = '23514', HINT = 'class_cancelled';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.entries_refuse_cancelled_class_writes() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_02_entries_refuse_cancelled_class_writes ON public.entries;
CREATE TRIGGER trg_02_entries_refuse_cancelled_class_writes
  BEFORE UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_refuse_cancelled_class_writes();
