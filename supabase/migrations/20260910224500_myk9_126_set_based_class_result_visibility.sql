-- MYK9-126: resolve class result visibility once per CLASS, not once per ENTRY.
--
-- `view_authenticated_entry_results` carried
--
--     CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id) AS vis
--
-- which runs a plpgsql body once per entry row. That body does four table
-- lookups (classes JOIN trials, show_visibility_settings,
-- trial_visibility_overrides, class_visibility_overrides) plus up to twelve
-- nested _result_visibility_preset / _result_timing_visible calls. On the G9
-- load fixture -- 1,275 entries across 33 classes -- one full view scan paid
-- roughly 5,100 lookups and ~15,300 nested calls to produce at most 33 distinct
-- answers.
--
-- Measured on run 34394781017 (statement deltas resolved against
-- pg_stat_statements): this view and its `_replication` wrapper were 26.1% of
-- the top-20 server time, at 940-1744 ms per call, while Supabase Micro sat at
-- 99.16% CPU and 100% disk IO with only 36 of 60 connections used. The tell in
-- the catalog is show_visibility_settings -- 4 live rows, 1,102,291 sequential
-- scans against 602 index scans -- and trials, 16 rows and 3,661,287 seq scans.
-- Postgres is right to seq-scan a one-page table; the defect is asking it a
-- million times. Every lookup key is already indexed, so this is NOT an index
-- gap and adding indexes would fix nothing.
--
-- This is the correlated-argument blind spot PR #1532 fixed for
-- can_manage_show(entries.show_id) (311.9 ms -> 10.1 ms). This same view
-- already applies the cure to its MANAGER arms: `caller_context` materialises
-- managed_club_ids / managed_show_ids / assigned_class_ids once. Class result
-- visibility never got the same treatment.
--
-- Change: add `private.class_result_visibility`, a set-based view that resolves
-- the same cascade for all classes in one pass, and join it by class_id. The
-- SELECT list, the WHERE clause, the GRANTs and every `vis.*` reference are
-- byte-identical to 20260902130000 (MYK9-329), which is the latest migration
-- defining this view -- only the join is swapped.
--
-- public.resolve_class_result_visibility is deliberately LEFT IN PLACE and
-- unchanged. Nine other migrations' views still call it (view_own_entry_results,
-- view_public_entry_results, the ringside reads), it is the oracle the parity
-- test compares against, and anon holds EXECUTE on it per 20260712150000.
-- Those other views carry the same per-row defect; they were not in this run's
-- hot list and changing five security-boundary views in one migration is a risk
-- nobody asked for. Tracked separately.
--
-- WITH (security_invoker = false) is restated inline: CREATE OR REPLACE VIEW
-- resets reloptions when the clause is omitted (20260817190000 and the CLAUDE.md
-- lesson). `entry_views_soft_delete_test.sql` asserts the setting.
--
-- Behavioural coverage: supabase/tests/myk9_126_class_result_visibility_parity_test.sql
-- asserts private.class_result_visibility agrees with
-- public.resolve_class_result_visibility for every class and for a synthetic
-- matrix of show/trial/class override precedence and class states. The existing
-- null_club_show_authorization_test.sql, myk9_114_entry_access_context_test.sql
-- and entry_views_soft_delete_test.sql continue to cover the authorization arms.

BEGIN;

-- One row per class. Mirrors public.resolve_class_result_visibility step for
-- step; the parity test is what holds the two in agreement.
--
-- The function's `IF NOT FOUND THEN RETURN false,false,false,false` for an
-- unknown class becomes the absence of a row here, which the consuming view
-- COALESCEs to false -- see the join site below.
CREATE OR REPLACE VIEW private.class_result_visibility AS
WITH base AS (
  SELECT
    c.id AS class_id,
    c.status,
    c.is_scoring_finalized,
    c.results_released_at,
    -- Step 2: show settings are the resolved base. The write path expands a
    -- show-level preset into these columns, so they are read directly and NOT
    -- preset-expanded here (same reasoning as the function's step 2 comment).
    -- No show_visibility_settings row leaves these NULL, and the COALESCE below
    -- supplies the same hardcoded 'open' defaults the function's NOT FOUND arm
    -- does.
    COALESCE(s.placement_timing, 'class_complete') AS show_placement,
    COALESCE(s.qualification_timing, 'immediate')  AS show_qualification,
    COALESCE(s.time_timing, 'immediate')           AS show_time,
    COALESCE(s.faults_timing, 'immediate')         AS show_faults,
    tv.preset               AS trial_preset,
    tv.placement_timing     AS trial_placement,
    tv.qualification_timing AS trial_qualification,
    tv.time_timing          AS trial_time,
    tv.faults_timing        AS trial_faults,
    cv.preset               AS class_preset,
    cv.placement_timing     AS class_placement,
    cv.qualification_timing AS class_qualification,
    cv.time_timing          AS class_time,
    cv.faults_timing        AS class_faults
  FROM public.classes c
  -- INNER, matching the function: a class whose trial is missing yields no row
  -- there (NOT FOUND) and none here.
  JOIN public.trials t ON t.id = c.trial_id
  LEFT JOIN public.show_visibility_settings s  ON s.show_id  = t.show_id
  LEFT JOIN public.trial_visibility_overrides tv ON tv.trial_id = c.trial_id
  LEFT JOIN public.class_visibility_overrides cv ON cv.class_id = c.id
),
-- Step 3 then step 4: at each level a non-null preset re-expands the base, then
-- each non-null per-field value wins over it. A level with no override row has
-- all-NULL columns, so both expressions collapse to the level below -- which is
-- exactly what the function's `IF FOUND` guard produces.
after_trial AS (
  SELECT b.*,
    COALESCE(b.trial_placement,     CASE WHEN b.trial_preset IS NOT NULL THEN public._result_visibility_preset(b.trial_preset, 'placement')     ELSE b.show_placement     END) AS tp,
    COALESCE(b.trial_qualification, CASE WHEN b.trial_preset IS NOT NULL THEN public._result_visibility_preset(b.trial_preset, 'qualification') ELSE b.show_qualification END) AS tq,
    COALESCE(b.trial_time,          CASE WHEN b.trial_preset IS NOT NULL THEN public._result_visibility_preset(b.trial_preset, 'time')          ELSE b.show_time          END) AS tt,
    COALESCE(b.trial_faults,        CASE WHEN b.trial_preset IS NOT NULL THEN public._result_visibility_preset(b.trial_preset, 'faults')        ELSE b.show_faults        END) AS tf
  FROM base b
),
after_class AS (
  SELECT a.*,
    COALESCE(a.class_placement,     CASE WHEN a.class_preset IS NOT NULL THEN public._result_visibility_preset(a.class_preset, 'placement')     ELSE a.tp END) AS cp,
    COALESCE(a.class_qualification, CASE WHEN a.class_preset IS NOT NULL THEN public._result_visibility_preset(a.class_preset, 'qualification') ELSE a.tq END) AS cq,
    COALESCE(a.class_time,          CASE WHEN a.class_preset IS NOT NULL THEN public._result_visibility_preset(a.class_preset, 'time')          ELSE a.tt END) AS ct,
    COALESCE(a.class_faults,        CASE WHEN a.class_preset IS NOT NULL THEN public._result_visibility_preset(a.class_preset, 'faults')        ELSE a.tf END) AS cf,
    -- Step 5: a scoring-finalized class counts as completed even if status lags.
    CASE
      WHEN a.results_released_at IS NOT NULL THEN 'released'
      WHEN lower(COALESCE(a.status, '')) = 'completed' OR a.is_scoring_finalized IS TRUE THEN 'completed'
      ELSE 'in_progress'
    END AS state
  FROM after_trial a
)
SELECT
  class_id,
  public._result_timing_visible(cp, state) AS placement_visible,
  public._result_timing_visible(cq, state) AS qualification_visible,
  public._result_timing_visible(ct, state) AS time_visible,
  public._result_timing_visible(cf, state) AS faults_visible
FROM after_class;

COMMENT ON VIEW private.class_result_visibility IS
  'Set-based equivalent of public.resolve_class_result_visibility, one row per '
  'class (MYK9-126). Lives in private: it is an implementation detail of the '
  'entry-results views, not an API surface. Parity is pinned by '
  'supabase/tests/myk9_126_class_result_visibility_parity_test.sql.';

CREATE OR REPLACE VIEW public.view_authenticated_entry_results
  WITH (security_invoker = false)
AS
WITH caller_context AS MATERIALIZED (
  SELECT * FROM private.entry_results_caller_context()
)
SELECT
  e.id,
  e.dog_id,
  e.class_id,
  e.show_id,
  e.trial_id,
  e.handler_id,
  e.entry_status,
  CASE WHEN access.can_view_admin THEN e.payment_status END AS payment_status,
  e.handler,
  (CASE WHEN access.can_view_admin THEN e.entry_fee END)::numeric(10,2) AS entry_fee,
  e.submitted_at,
  CASE WHEN access.can_view_admin THEN e.special_requests END AS special_requests,
  e.armband,
  e.run_order,
  e.jump_height,
  e.preferred_judge,
  e.move_up_requested,
  e.is_scored,
  e.is_in_ring,
  CASE WHEN access.can_view_scores OR vis.qualification_visible THEN e.result_status END AS result_status,
  e.ring_entry_time,
  e.ring_exit_time,
  e.scoring_started_at,
  e.scoring_completed_at,
  CASE WHEN access.can_view_scores OR vis.time_visible THEN e.search_time_seconds END AS search_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area1_time_seconds END AS area1_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area2_time_seconds END AS area2_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area3_time_seconds END AS area3_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area4_time_seconds END AS area4_time_seconds,
  CASE WHEN access.can_view_scores THEN e.total_correct_finds END AS total_correct_finds,
  CASE WHEN access.can_view_scores THEN e.total_incorrect_finds END AS total_incorrect_finds,
  CASE WHEN access.can_view_scores OR vis.faults_visible THEN e.total_faults END AS total_faults,
  CASE WHEN access.can_view_scores THEN e.no_finish_count END AS no_finish_count,
  CASE WHEN access.can_view_scores THEN e.area1_correct END AS area1_correct,
  CASE WHEN access.can_view_scores THEN e.area1_incorrect END AS area1_incorrect,
  CASE WHEN access.can_view_scores THEN e.area1_faults END AS area1_faults,
  CASE WHEN access.can_view_scores THEN e.area2_correct END AS area2_correct,
  CASE WHEN access.can_view_scores THEN e.area2_incorrect END AS area2_incorrect,
  CASE WHEN access.can_view_scores THEN e.area2_faults END AS area2_faults,
  CASE WHEN access.can_view_scores THEN e.area3_correct END AS area3_correct,
  CASE WHEN access.can_view_scores THEN e.area3_incorrect END AS area3_incorrect,
  CASE WHEN access.can_view_scores THEN e.area3_faults END AS area3_faults,
  CASE WHEN access.can_view_scores OR vis.time_visible THEN e.total_score END AS total_score,
  CASE WHEN access.can_view_scores THEN e.points_earned END AS points_earned,
  CASE WHEN access.can_view_scores THEN e.points_possible END AS points_possible,
  CASE WHEN access.can_view_scores THEN e.bonus_points END AS bonus_points,
  CASE WHEN access.can_view_scores THEN e.penalty_points END AS penalty_points,
  CASE WHEN access.can_view_scores THEN e.time_over_limit END AS time_over_limit,
  CASE WHEN access.can_view_scores THEN e.time_limit_exceeded_seconds END AS time_limit_exceeded_seconds,
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.final_placement END AS final_placement,
  CASE WHEN access.can_view_scores THEN e.judge_notes END AS judge_notes,
  CASE WHEN access.can_view_scores THEN e.judge_signature END AS judge_signature,
  CASE WHEN access.can_view_scores THEN e.judge_signature_timestamp END AS judge_signature_timestamp,
  CASE WHEN access.can_view_scores THEN e.disqualification_reason END AS disqualification_reason,
  CASE WHEN access.can_view_scores THEN e.has_video_review END AS has_video_review,
  CASE WHEN access.can_view_scores THEN e.video_review_notes END AS video_review_notes,
  e.license_key,
  e.local_id,
  e.sync_version,
  e.last_synced_at,
  e.created_at,
  GREATEST(
    e.updated_at,
    c.updated_at,
    sh.updated_at,
    show_vis.updated_at,
    trial_vis.updated_at,
    class_vis.updated_at
  ) AS updated_at,
  e.deleted_at,
  CASE WHEN access.can_view_admin THEN e.deleted_by END AS deleted_by,
  e.check_in_status,
  CASE WHEN access.can_view_admin THEN e.payment_method END AS payment_method,
  e.entry_source,
  e.is_day_of_show,
  e.registration_id,
  CASE WHEN access.can_view_admin THEN e.withdrawal_reason END AS withdrawal_reason,
  (CASE WHEN access.can_view_admin THEN e.refund_amount END)::numeric(10,2) AS refund_amount,
  CASE WHEN access.can_view_admin THEN e.refund_notes END AS refund_notes,
  CASE WHEN access.can_view_admin THEN e.refunded_at END AS refunded_at,
  CASE WHEN access.can_view_admin THEN e.stripe_payment_intent_id END AS stripe_payment_intent_id,
  CASE WHEN access.can_view_admin THEN e.comped END AS comped,
  CASE WHEN access.can_view_admin THEN e.comped_reason END AS comped_reason,
  (CASE WHEN access.can_view_admin THEN e.discount_amount END)::numeric(10,2) AS discount_amount,
  CASE WHEN access.can_view_admin THEN e.promo_code_id END AS promo_code_id,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_sent_at END AS confirmation_email_sent_at,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_message_id END AS confirmation_email_message_id,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_status END AS confirmation_email_status,
  e.version,
  CASE
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'qualified'  THEN 'Q'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'nq'         THEN 'NQ'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'absent'     THEN 'ABS'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'excused'    THEN 'EX'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'withdrawn'  THEN 'WD'
    ELSE NULL
  END AS result_text,
  d.name AS dog_name,
  d.call_name AS dog_call_name,
  d.breed AS dog_breed,
  d.image_url AS dog_image_url,
  c.name AS class_name,
  c.level AS class_level,
  c.element AS class_element,
  c.results_released_at AS class_results_released_at,
  sh.name AS show_name,
  sh.start_date AS show_start_date,
  sh.organization AS show_organization,
  access.is_own_entry AS is_own_entry,
  -- Secretary payment bookkeeping. Masked by `can_view_admin` exactly like the
  -- other payment columns above; appended at the END of the select list because
  -- CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.payment_reference END AS payment_reference,
  CASE WHEN access.can_view_admin THEN e.payment_received_on END AS payment_received_on,
  CASE WHEN access.can_view_admin THEN e.payment_notes END AS payment_notes
FROM public.entries e
LEFT JOIN public.dogs d ON d.id = e.dog_id
LEFT JOIN public.classes c ON c.id = e.class_id
LEFT JOIN public.shows sh ON sh.id = e.show_id
LEFT JOIN public.show_visibility_settings show_vis ON show_vis.show_id = e.show_id
LEFT JOIN public.trial_visibility_overrides trial_vis ON trial_vis.trial_id = c.trial_id
LEFT JOIN public.class_visibility_overrides class_vis ON class_vis.class_id = e.class_id
CROSS JOIN caller_context ctx
LEFT JOIN private.class_result_visibility cvr ON cvr.class_id = e.class_id
-- MYK9-126: `vis` keeps its four column names, so every downstream reference
-- above is byte-identical to 20260902130000. The COALESCE reproduces the
-- function's fail-closed RETURN for an unknown or trial-less class, which a
-- LEFT JOIN would otherwise surface as NULL.
CROSS JOIN LATERAL (
  SELECT
    COALESCE(cvr.placement_visible, false)     AS placement_visible,
    COALESCE(cvr.qualification_visible, false) AS qualification_visible,
    COALESCE(cvr.time_visible, false)          AS time_visible,
    COALESCE(cvr.faults_visible, false)        AS faults_visible
) AS vis
CROSS JOIN LATERAL (
  SELECT
    (
      sh.id IS NOT NULL
      AND (
        -- MYK9-329: a club-less show is site-admin only. The former arm that
        -- admitted any holder of a manager role when the show had no club handed every
        -- club admin and secretary on the platform can_manage (and therefore
        -- can_view_admin: payment_status, entry_fee, judge_notes, ...) on any
        -- show with no club. MYK9-258 (20260828230000) removed that semantics
        -- from can_manage_show / manageable_show_ids / get_entries_for_export;
        -- this view was re-emitted with the old arm and left behind. Parity
        -- with can_manage_show() is restored here.
        ctx.is_site_admin
        OR sh.club_id = ANY(ctx.managed_club_ids)
        OR e.show_id = ANY(ctx.managed_show_ids)
      )
    ) AS can_manage,
    e.class_id = ANY(ctx.assigned_class_ids) AS is_assigned_judge,
    (
      e.show_id = ANY(ctx.steward_show_ids)
      OR sh.club_id = ANY(ctx.steward_club_ids)
    ) AS is_show_steward,
    (
      ctx.person_id = e.handler_id
      OR EXISTS (
        SELECT 1
        FROM public.dogs owned_dog
        WHERE owned_dog.id = e.dog_id
          AND owned_dog.owner_id = ctx.person_id
      )
    ) AS is_own_entry,
    EXISTS (
      SELECT 1
      FROM public.entries own_e
      LEFT JOIN public.dogs own_dog ON own_dog.id = own_e.dog_id
      WHERE own_e.show_id = e.show_id
        AND own_e.deleted_at IS NULL
        AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        AND (
          own_e.handler_id = ctx.person_id
          OR own_dog.owner_id = ctx.person_id
          OR own_dog.co_owner_id = ctx.person_id
        )
    ) AS is_show_exhibitor,
    (
      ctx.claim_kind = 'ringside_passcode'
      AND ctx.claim_show_id = e.show_id::text
      AND ctx.claim_generation_current
    ) AS claim_show_match,
    ctx.claim_role
) AS flags
CROSS JOIN LATERAL (
  SELECT
    flags.can_manage,
    flags.is_assigned_judge,
    flags.is_show_steward,
    flags.is_own_entry,
    flags.is_show_exhibitor,
    (flags.claim_show_match AND flags.claim_role IN ('judge', 'steward', 'admin')) AS is_ringside_claim,
    (
      flags.can_manage
      OR flags.is_assigned_judge
      OR (flags.claim_show_match AND flags.claim_role IN ('judge', 'admin'))
    ) AS can_view_scores,
    (flags.can_manage OR flags.is_own_entry) AS can_view_admin
) AS access
WHERE (e.deleted_at IS NULL OR access.is_own_entry)
  AND (
    access.can_manage
    OR access.is_assigned_judge
    OR access.is_show_steward
    OR access.is_own_entry
    OR access.is_show_exhibitor
    OR access.is_ringside_claim
  );

GRANT SELECT ON public.view_authenticated_entry_results TO authenticated;
GRANT SELECT ON public.view_authenticated_entry_results TO service_role;
REVOKE ALL ON public.view_authenticated_entry_results FROM anon;

COMMENT ON VIEW public.view_authenticated_entry_results IS
  'Authenticated entry results. Scored columns stay gated by can_view_scores and '
  'payment columns by can_view_admin. A club-less show is manageable by site '
  'admins only (MYK9-258 / MYK9-329). Class result visibility resolves once per '
  'class via private.class_result_visibility (MYK9-126). The view remains '
  'security_invoker = false.';

COMMIT;
