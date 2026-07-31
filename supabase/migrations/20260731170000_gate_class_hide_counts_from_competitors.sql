-- =============================================================================
-- Migration 20260731170000: withhold judge-set hide counts from competitors
--
-- SA-2026-07-29-01 / MYK9-127, part B of two. Part A (…160000) added
-- get_show_class_hide_counts. This half is the RESTRICTIVE one and must not be
-- applied before the client stops selecting the column — a deployed client doing
-- `select('*')` on classes starts failing 42501 the moment this lands.
--
-- PROBLEM. `authenticated` holds a table-wide SELECT on public.classes and
-- `classes_select` is a PUBLIC-role policy admitting any visible show, so any
-- account reads the scent-work hide configuration before running the class.
-- Verified on the applied database with a freshly created, role-less account:
--
--   name           | level  | num_hides | hides_known
--   Buried Master  | Master |         3 | f
--
-- `hides_known = false` means the judge deliberately did not disclose the count.
-- A Master competitor reading 3 there has a decisive pre-run advantage. Supabase
-- anonymous sign-in also resolves to the `authenticated` role, so a ringside
-- passcode session inherits the same read.
--
-- SCOPE: `num_hides` only, deliberately narrower than the original finding,
-- which named all three of num_hides / hides_known / has_blank.
--
--   * `hides_known` is NOT secret. public.sport_class_rules is anon-readable and
--     publishes the rulebook per element+level. Where hides_known = true the
--     class's num_hides always equals that table's hide_count_fixed (verified
--     across every such class on the applied database), so the count is data the
--     competitor is entitled to and can derive anyway. Withholding it would
--     protect nothing while breaking the at-show "Hides: Known/Unknown" row,
--     which legitimately tells a competitor whether a count is disclosed.
--   * `has_blank` on classes has no read or write path anywhere in the app; it
--     is only ever read from sport_class_rules. Gating a dead column adds a
--     failure mode with no benefit. Left as-is.
--
--   The genuine secret is num_hides on a judge-set class — where the rule gives
--   a band (Buried Master: 1-4) and the judge picks within it.
--
-- Revoking SELECT also blocks `WHERE num_hides = ...`, since Postgres requires
-- SELECT on every column referenced in a predicate — closing the obvious probe
-- channel. INSERT/UPDATE/DELETE are untouched, so a secretary can still SET the
-- hide count; only reading it back off the class row is gated.
-- =============================================================================

-- anon decision, stated explicitly per the grant-decision contract: unchanged from
-- 20260730140000, restated positively as the 52-column allowlist. Idempotent.
--
-- Stated as a GRANT rather than a REVOKE on purpose. Two revoke shapes were
-- rejected:
--   * `REVOKE ALL ON public.classes FROM anon` — revoking a privilege on a table
--     revokes it on every column, so this would destroy all 52 grants and turn
--     every public show page into a 42501.
--   * `REVOKE SELECT (num_hides) ... FROM anon` — correct in Postgres, but
--     anonEntriesGrantContract replays migrations to fold anon's effective grants
--     and reads a column-scoped revoke as clearing the whole table. A statement
--     whose meaning depends on whether the reader is Postgres or the contract
--     parser is the wrong statement to leave in the corpus.
GRANT SELECT (
  id, trial_id, name, description, level, element, section, competition_type,
  entry_fee, max_entries, allow_waitlist, max_dogs_per_handler,
  breed_restrictions, jump_heights, age_min, age_max, height_min, height_max,
  handler_age_min, handler_age_max, start_time, estimated_duration,
  actual_start_time, actual_end_time, status, time_limit_seconds, num_areas,
  max_faults, qualifying_threshold, is_scoring_finalized, results_released_at,
  dogs_ahead_notification_count, total_entries_count, checked_in_count,
  scored_count, created_at, updated_at, deleted_at, deleted_by, class_number,
  timer_mode, distraction_count, is_results_reviewed, judge_name,
  time_limit_area2_seconds, time_limit_area3_seconds, display_order,
  results_released_by, version, status_source, reopened_after_closeout_at,
  revised_expected_start
) ON public.classes TO anon;

REVOKE SELECT ON public.classes FROM authenticated;

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
  is_results_reviewed, judge_name, time_limit_area2_seconds,
  time_limit_area3_seconds, display_order, results_released_by, version,
  status_source, reopened_after_closeout_at, revised_expected_start
) ON public.classes TO authenticated;

COMMENT ON COLUMN public.classes.num_hides IS
  'Judge-set hide count. NOT readable by authenticated — competitors must not see it before running. Officials read it via get_show_class_hide_counts(show_id). Where hides_known = true this equals sport_class_rules.hide_count_fixed, which is public; the secret is the judge-set (banded) case. See MYK9-127.';
