BEGIN;

-- MYK9-114: evaluate role, assignment, and passcode authorization once per
-- view statement instead of allowing PostgreSQL to copy correlated subplans
-- across the wide protected projection.

-- Fail rather than silently reusing an unexpected schema owner/ACL.
CREATE SCHEMA private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated, service_role;

DROP FUNCTION IF EXISTS private.entry_results_caller_context();

CREATE FUNCTION private.entry_results_caller_context()
RETURNS TABLE (
  auth_user_id uuid,
  person_id uuid,
  is_site_admin boolean,
  has_manager_role boolean,
  managed_club_ids uuid[],
  assigned_class_ids uuid[],
  steward_show_ids uuid[],
  steward_club_ids uuid[],
  claim_kind text,
  claim_show_id text,
  claim_role text,
  claim_generation_current boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH caller_identity AS MATERIALIZED (
    SELECT
      auth.uid() AS auth_user_id,
      (
        SELECT p.id
        FROM public.people p
        WHERE p.auth_user_id = auth.uid()
        LIMIT 1
      ) AS person_id,
      auth.jwt() AS jwt
  ),
  role_context AS MATERIALIZED (
    SELECT
      COALESCE(bool_or(r.name = 'site_admin'), false) AS is_site_admin,
      COALESCE(
        bool_or(r.name IN ('secretary', 'trial_secretary', 'club_admin')),
        false
      ) AS has_manager_role,
      COALESCE(array_agg(DISTINCT ur.club_id) FILTER (
        WHERE r.name IN ('secretary', 'trial_secretary', 'club_admin')
          AND ur.club_id IS NOT NULL
      ), ARRAY[]::uuid[]) AS managed_club_ids,
      COALESCE(array_agg(DISTINCT ur.show_id) FILTER (
        WHERE r.name = 'steward'
          AND ur.show_id IS NOT NULL
      ), ARRAY[]::uuid[]) AS steward_show_ids,
      COALESCE(array_agg(DISTINCT ur.club_id) FILTER (
        WHERE r.name = 'steward'
          AND ur.show_id IS NULL
          AND ur.club_id IS NOT NULL
      ), ARRAY[]::uuid[]) AS steward_club_ids
    FROM caller_identity ci
    LEFT JOIN public.user_roles ur
      ON ur.auth_user_id = ci.auth_user_id
     AND ur.is_active
     AND (ur.expires_at IS NULL OR ur.expires_at > now())
    LEFT JOIN public.roles r ON r.id = ur.role_id
  ),
  judge_context AS MATERIALIZED (
    SELECT COALESCE(array_agg(DISTINCT ja.class_id) FILTER (
      WHERE ja.class_id IS NOT NULL
    ), ARRAY[]::uuid[]) AS assigned_class_ids
    FROM caller_identity ci
    LEFT JOIN public.judge_assignments ja
      ON ja.person_id = ci.person_id
     AND ja.status IN ('confirmed', 'invited')
  )
  SELECT
    ci.auth_user_id,
    ci.person_id,
    rc.is_site_admin,
    rc.has_manager_role,
    rc.managed_club_ids,
    jc.assigned_class_ids,
    rc.steward_show_ids,
    rc.steward_club_ids,
    ci.jwt -> 'app_metadata' ->> 'kind' AS claim_kind,
    nullif(ci.jwt -> 'app_metadata' ->> 'show_id', '') AS claim_show_id,
    ci.jwt -> 'app_metadata' ->> 'ringside_role' AS claim_role,
    public.ringside_claim_generation_current() AS claim_generation_current
  FROM caller_identity ci
  CROSS JOIN role_context rc
  CROSS JOIN judge_context jc;
$$;

COMMENT ON FUNCTION private.entry_results_caller_context() IS
  'Internal MYK9-114 helper. Returns one fail-closed statement-scoped caller '
  'context for view_authenticated_entry_results so role, judge-assignment, '
  'steward, and ringside-generation inputs are not recopied per projected field.';

REVOKE ALL ON FUNCTION private.entry_results_caller_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.entry_results_caller_context()
  FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.entry_results_caller_context() TO authenticated;
GRANT EXECUTE ON FUNCTION private.entry_results_caller_context() TO service_role;

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
  access.is_own_entry AS is_own_entry
FROM public.entries e
LEFT JOIN public.dogs d ON d.id = e.dog_id
LEFT JOIN public.classes c ON c.id = e.class_id
LEFT JOIN public.shows sh ON sh.id = e.show_id
LEFT JOIN public.show_visibility_settings show_vis ON show_vis.show_id = e.show_id
LEFT JOIN public.trial_visibility_overrides trial_vis ON trial_vis.trial_id = c.trial_id
LEFT JOIN public.class_visibility_overrides class_vis ON class_vis.class_id = e.class_id
CROSS JOIN caller_context ctx
CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id) AS vis
CROSS JOIN LATERAL (
  SELECT
    (
      ctx.is_site_admin
      OR (sh.club_id IS NULL AND ctx.has_manager_role)
      OR sh.club_id = ANY(ctx.managed_club_ids)
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
WHERE access.can_manage
   OR access.is_assigned_judge
   OR access.is_show_steward
   OR access.is_own_entry
   OR access.is_show_exhibitor
   OR access.is_ringside_claim;

GRANT SELECT ON public.view_authenticated_entry_results TO authenticated;
GRANT SELECT ON public.view_authenticated_entry_results TO service_role;
REVOKE SELECT ON public.view_authenticated_entry_results FROM anon;

COMMENT ON VIEW public.view_authenticated_entry_results IS
  'Authenticated/offline entry-results boundary. MYK9-114 materializes one '
  'private caller context per statement to bound authorization-table scans.';

NOTIFY pgrst, 'reload schema';

COMMIT;
