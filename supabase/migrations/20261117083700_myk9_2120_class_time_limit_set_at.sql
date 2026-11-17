-- =============================================================================
-- When a class's time limit was set (MYK9-2120)
-- =============================================================================
-- Show Desk's Requirements row shows the saved limit (MYK9-2118); this adds "set 2:14 PM".
-- classes.updated_at moves on any edit, so it cannot say when the LIMIT changed.
--
--   classes.time_limit_set_at  timestamptz, NULL = never set (or set before this column)
--
-- Stamped by a BEFORE trigger, so every writer is covered with no client change: Ringside's
-- Set Max Time and the secretary's Edit class (ringside_update_class and the direct class
-- update), the show-creation wizard, and any later path. It watches the three limit columns
-- (time_limit_seconds, time_limit_area2_seconds, time_limit_area3_seconds) and stamps now()
-- only when one actually changes (IS DISTINCT FROM): Edit class re-sends the whole row, and
-- an unrelated edit must not move the time. The trigger also pins the column to its old value
-- on any UPDATE that leaves the limits alone, so a client cannot forge or clobber it.
-- An INSERT stamps when it carries a limit.
--
-- Grants: classes is read through a column allowlist, so the latest authenticated list
-- (20261114205300, with scores_on_paper) is restated with the new column added; the contract
-- test reads the LATEST such grant. anon is unchanged: it is not given the column, as with
-- ring_phase (MYK9-1513) and scores_on_paper (staff-facing). No UPDATE is granted on it;
-- only the trigger writes it (a trigger assignment needs no column privilege).

BEGIN;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS time_limit_set_at timestamptz;

COMMENT ON COLUMN public.classes.time_limit_set_at IS
  'MYK9-2120: when any of time_limit_seconds / time_limit_area2_seconds / time_limit_area3_seconds last changed, stamped by trg_classes_stamp_time_limit_set_at. NULL = never set, or set before this column existed.';

CREATE OR REPLACE FUNCTION private.classes_stamp_time_limit_set_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.time_limit_seconds IS NOT NULL
       OR NEW.time_limit_area2_seconds IS NOT NULL
       OR NEW.time_limit_area3_seconds IS NOT NULL THEN
      NEW.time_limit_set_at := now();
    ELSE
      NEW.time_limit_set_at := NULL;
    END IF;
  ELSIF NEW.time_limit_seconds IS DISTINCT FROM OLD.time_limit_seconds
     OR NEW.time_limit_area2_seconds IS DISTINCT FROM OLD.time_limit_area2_seconds
     OR NEW.time_limit_area3_seconds IS DISTINCT FROM OLD.time_limit_area3_seconds THEN
    NEW.time_limit_set_at := now();
  ELSE
    NEW.time_limit_set_at := OLD.time_limit_set_at;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.classes_stamp_time_limit_set_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_classes_stamp_time_limit_set_at ON public.classes;
CREATE TRIGGER trg_classes_stamp_time_limit_set_at
  BEFORE INSERT OR UPDATE ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION private.classes_stamp_time_limit_set_at();

GRANT SELECT (
  id, trial_id, name, description, level, element, section, competition_type,
  entry_fee, max_entries, allow_waitlist, max_dogs_per_handler,
  breed_restrictions, jump_heights, age_min, age_max, height_min, height_max,
  handler_age_min, handler_age_max, start_time, estimated_duration,
  actual_start_time, actual_end_time, status, time_limit_seconds, num_areas,
  has_blank, max_faults, qualifying_threshold, is_scoring_finalized,
  results_released_at, dogs_ahead_notification_count, total_entries_count,
  checked_in_count, scored_count, created_at, updated_at, deleted_at,
  deleted_by, class_number, timer_mode, hides_known, distraction_count,
  is_results_reviewed, time_limit_area2_seconds,
  time_limit_area3_seconds, display_order, results_released_by, version,
  status_source, reopened_after_closeout_at, revised_expected_start,
  judge_signed_off_at, judge_signed_off_by, results_verified_at,
  results_verified_by, ring_phase, ring_phase_time, status_before_close,
  scores_on_paper, time_limit_set_at
) ON public.classes TO authenticated;

COMMIT;
