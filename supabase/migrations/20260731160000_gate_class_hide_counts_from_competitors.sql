-- =============================================================================
-- Migration 20260731160000: withhold judge-set hide counts from competitors
--
-- SA-2026-07-29-01 / MYK9-127. Second half of MYK9-116, whose first half
-- (20260730140000) closed only the `anon` leg.
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
--     competitor is entitled to know and can derive anyway. Withholding it would
--     protect nothing while breaking the at-show "Hides: Known/Unknown" row,
--     which legitimately tells a competitor whether a count is disclosed.
--   * `has_blank` on classes has no read or write path anywhere in the app; it
--     is only ever read from sport_class_rules. Gating a dead column adds a
--     failure mode with no benefit. Left as-is.
--
--   The genuine secret is num_hides on a judge-set class — where the rule gives
--   a band (Buried Master: 1-4) and the judge picks within it.
--
-- FIX.
--   1. Revoke SELECT on classes from `authenticated` and re-grant the 54
--      non-secret columns. INSERT/UPDATE/DELETE are untouched, so a secretary
--      can still SET num_hides; only reading it back is gated. Note this also
--      blocks `WHERE num_hides = ...`, since Postgres requires SELECT on every
--      column referenced in a predicate — closing the obvious probe channel.
--   2. get_show_class_hide_counts(show_id) returns the counts to officials.
--
-- WHY A FUNCTION AND NOT A VIEW. The natural view shape needs a per-row
-- authorization call, which is the O(N) policy anti-pattern this repo has had to
-- unwind before. Ringside syncs per show, so a show-scoped function does the
-- authorization ONCE and then filters rows with plain joins.
--
-- WHY NOT is_show_official(). It resolves only site_admin / secretary /
-- chairman / steward from user_roles. It never consults judge_assignments and
-- has no notion of a passcode session, so gating on it would deny the assigned
-- judge — the person the hide count exists for — and every account-less ringside
-- user. The authorization tiers below are copied from ringside_update_entry
-- (20260712101000), which already resolves exactly this question; keeping one
-- answer rather than two is the point.
--
-- EXHIBITOR PASSCODES DO NOT QUALIFY. A show passcode can carry ringside_role
-- 'exhibitor'; only judge/admin/steward are accepted, and the claim's generation
-- must be current so a regenerated passcode stops working.
--
-- Returns zero rows rather than raising for an unauthorized caller: the client
-- treats "no counts" and "not entitled" identically, and not raising avoids
-- disclosing whether a show id exists.
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

CREATE OR REPLACE FUNCTION public.get_show_class_hide_counts(p_show_id uuid)
RETURNS TABLE (class_id uuid, num_hides integer)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_club_id               uuid;
  v_caller_person_id      uuid;
  v_is_manager            boolean;
  v_is_steward            boolean;
  v_claim_kind            text;
  v_claim_show_id         text;
  v_claim_role            text;
  v_has_passcode_official boolean;
BEGIN
  IF p_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = p_show_id;
  IF v_club_id IS NULL THEN
    RETURN;  -- unknown show: empty, not an error, so existence is not disclosed
  END IF;

  -- NULL for a passcode/anonymous session, which has no person row.
  SELECT p.id INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  v_is_manager :=
    public.is_site_admin()
    OR public.is_trial_secretary(v_club_id)
    OR public.is_club_admin(v_club_id);

  v_is_steward := EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.auth_user_id = (SELECT auth.uid())
       AND r.name = 'steward'
       AND ur.is_active
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
       AND (ur.show_id = p_show_id
            OR (ur.show_id IS NULL AND ur.club_id = v_club_id))
  );

  v_claim_kind    := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role    := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';

  v_has_passcode_official :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = p_show_id::text
    AND v_claim_role IN ('judge', 'admin', 'steward')
    AND public.ringside_claim_generation_current() IS NOT DISTINCT FROM true;

  RETURN QUERY
  SELECT c.id, c.num_hides
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
   WHERE t.show_id = p_show_id
     AND c.deleted_at IS NULL
     AND (
       v_is_manager
       OR v_is_steward
       OR v_has_passcode_official
       -- An account-holding judge sees only the classes assigned to them.
       OR (
         v_caller_person_id IS NOT NULL
         AND EXISTS (
           SELECT 1
             FROM public.judge_assignments ja
            WHERE ja.person_id = v_caller_person_id
              AND ja.class_id = c.id
              AND ja.status IN ('confirmed', 'invited')
         )
       )
     );
END;
$$;

-- Officials reach this while signed in, including via a passcode session, which
-- resolves to the authenticated role. anon never qualifies, so it never needs
-- EXECUTE; stated explicitly per the migration grant-decision contract.
REVOKE ALL ON FUNCTION public.get_show_class_hide_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_show_class_hide_counts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_show_class_hide_counts(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_show_class_hide_counts(uuid) IS
  'Show-scoped judge-set hide counts for officials only (manager/secretary/site-admin, show steward, assigned judge, or a current ringside judge/admin/steward passcode claim). Authorization runs once per call, not per row. Returns zero rows for anyone else. MYK9-127.';
