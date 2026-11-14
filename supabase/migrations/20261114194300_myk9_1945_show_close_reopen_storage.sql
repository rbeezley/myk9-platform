-- =============================================================================
-- Storage for closing and reopening a show (MYK9-1945 phase 3, migration only)
-- =============================================================================
-- "Finish the show" completes a show, its trials and its classes. To reopen it the
-- app has to know what was open at close and what each trial and class was before the
-- close overwrote it. This migration only adds that storage; no UI or app write path
-- uses it yet.
--
--   shows.closed_open_lines  jsonb array of the unticked "Finish the show" lines at
--                            close, e.g. [{"key":"unreleased","count":3}]; NULL = never
--                            closed with a record
--   shows.closed_at          when the close step ran
--   shows.reopened_at        when the show was last reopened
--   shows.reopen_reason      why it was reopened
--   trials.status_before_close, classes.status_before_close
--                            the status the row had before the close step completed
--                            it; set by the close step, cleared by reopen. NULL = the
--                            close did not change this row (or the show is open).
--
-- GRANTS (decided per table, from what is applied today):
--   * classes is read through a column allowlist. The latest authenticated list
--     (20261030174300) is restated with status_before_close added. The anon list is
--     restated UNCHANGED and without it: anon holds no table-level privilege on
--     classes, so the new column stays unreadable to it.
--   * shows and trials carry table-level grants only (authenticated=arw,
--     anon=r, service_role=all; no column ACLs; see 20261104014300). The new columns
--     inherit them. Splitting shows/trials into a column allowlist would turn every
--     select('*') on them into a permission error, which is a separate decision, so
--     none is made here. Writes: the existing shows_update / trials_update / classes
--     update RLS admits show managers only, and the replicated update path (full-row
--     UPDATE through the mutation manager) reaches the new columns with no new policy.
-- =============================================================================

BEGIN;

ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS closed_open_lines jsonb,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopen_reason text;

ALTER TABLE public.trials ADD COLUMN IF NOT EXISTS status_before_close text;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS status_before_close text;

ALTER TABLE public.shows DROP CONSTRAINT IF EXISTS shows_closed_open_lines_array_check;
ALTER TABLE public.shows
  ADD CONSTRAINT shows_closed_open_lines_array_check
    CHECK (closed_open_lines IS NULL OR jsonb_typeof(closed_open_lines) = 'array');

COMMENT ON COLUMN public.shows.closed_open_lines IS
  'MYK9-1945: the unticked "Finish the show" lines at close, a jsonb array of {key, count}. NULL when the show was never closed with a record.';
COMMENT ON COLUMN public.shows.closed_at IS
  'MYK9-1945: when the close step completed the show.';
COMMENT ON COLUMN public.shows.reopened_at IS
  'MYK9-1945: when the show was last reopened after a close.';
COMMENT ON COLUMN public.shows.reopen_reason IS
  'MYK9-1945: the reason given when the show was reopened.';
COMMENT ON COLUMN public.trials.status_before_close IS
  'MYK9-1945: the trial status before the close step completed it; set by close, cleared by reopen.';
COMMENT ON COLUMN public.classes.status_before_close IS
  'MYK9-1945: the class status before the close step completed it; set by close, cleared by reopen.';

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
  results_verified_by, ring_phase, ring_phase_time,
  status_before_close
) ON public.classes TO authenticated;

-- anon's decision, stated: the 20261008014300 allowlist, restated unchanged and WITHOUT
-- ring_phase / ring_phase_time. anon holds no table-level privilege on classes, so the
-- new columns stay unreadable to it (the phase is staff-facing).
GRANT SELECT (
  id, trial_id, name, description, level, element, section, competition_type,
  entry_fee, max_entries, allow_waitlist, max_dogs_per_handler,
  breed_restrictions, jump_heights, age_min, age_max, height_min, height_max,
  handler_age_min, handler_age_max, start_time, estimated_duration,
  actual_start_time, actual_end_time, status, time_limit_seconds, num_areas,
  max_faults, qualifying_threshold, is_scoring_finalized, results_released_at,
  dogs_ahead_notification_count, total_entries_count, checked_in_count,
  scored_count, created_at, updated_at, deleted_at, deleted_by, class_number,
  timer_mode, distraction_count, is_results_reviewed,
  time_limit_area2_seconds, time_limit_area3_seconds, display_order,
  results_released_by, version, status_source, reopened_after_closeout_at,
  revised_expected_start
) ON public.classes TO anon;

COMMIT;
