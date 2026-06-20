-- =============================================================================
-- Migration 20260620001929: restrict authenticated direct entry result reads
--
-- `entries_select` correctly scopes rows to managers + own entries, but it is
-- still a table read: an exhibitor who owns an entry can query
-- public.entries directly and receive withheld scored columns before the
-- result-visibility cascade releases them.
--
-- Close that column bypass by:
--   1. exposing an owner-run authenticated view that embeds its own row gate;
--      managers get raw scored fields, own-entry callers get cascade-masked
--      fields.
--   2. replacing authenticated's broad table SELECT with a non-scoring column
--      allowlist. UPDATE/INSERT/DELETE privileges and RLS policies are left
--      intact for existing mutation paths.
-- =============================================================================

DROP VIEW IF EXISTS public.view_authenticated_entry_results;

CREATE VIEW public.view_authenticated_entry_results
  WITH (security_invoker = false)
AS
SELECT
  e.id,
  e.dog_id,
  e.class_id,
  e.show_id,
  e.trial_id,
  e.handler_id,
  e.entry_status,
  e.payment_status,
  e.handler,
  e.entry_fee,
  e.submitted_at,
  e.special_requests,
  e.armband,
  e.run_order,
  e.jump_height,
  e.preferred_judge,
  e.move_up_requested,
  e.is_scored,
  e.is_in_ring,
  CASE WHEN access.can_manage OR vis.qualification_visible THEN e.result_status END AS result_status,
  e.ring_entry_time,
  e.ring_exit_time,
  e.scoring_started_at,
  e.scoring_completed_at,
  CASE WHEN access.can_manage OR vis.time_visible THEN e.search_time_seconds END AS search_time_seconds,
  CASE WHEN access.can_manage THEN e.area1_time_seconds END AS area1_time_seconds,
  CASE WHEN access.can_manage THEN e.area2_time_seconds END AS area2_time_seconds,
  CASE WHEN access.can_manage THEN e.area3_time_seconds END AS area3_time_seconds,
  CASE WHEN access.can_manage THEN e.area4_time_seconds END AS area4_time_seconds,
  CASE WHEN access.can_manage THEN e.total_correct_finds END AS total_correct_finds,
  CASE WHEN access.can_manage THEN e.total_incorrect_finds END AS total_incorrect_finds,
  CASE WHEN access.can_manage OR vis.faults_visible THEN e.total_faults END AS total_faults,
  CASE WHEN access.can_manage THEN e.no_finish_count END AS no_finish_count,
  CASE WHEN access.can_manage THEN e.area1_correct END AS area1_correct,
  CASE WHEN access.can_manage THEN e.area1_incorrect END AS area1_incorrect,
  CASE WHEN access.can_manage THEN e.area1_faults END AS area1_faults,
  CASE WHEN access.can_manage THEN e.area2_correct END AS area2_correct,
  CASE WHEN access.can_manage THEN e.area2_incorrect END AS area2_incorrect,
  CASE WHEN access.can_manage THEN e.area2_faults END AS area2_faults,
  CASE WHEN access.can_manage THEN e.area3_correct END AS area3_correct,
  CASE WHEN access.can_manage THEN e.area3_incorrect END AS area3_incorrect,
  CASE WHEN access.can_manage THEN e.area3_faults END AS area3_faults,
  CASE WHEN access.can_manage OR vis.time_visible THEN e.total_score END AS total_score,
  CASE WHEN access.can_manage THEN e.points_earned END AS points_earned,
  CASE WHEN access.can_manage THEN e.points_possible END AS points_possible,
  CASE WHEN access.can_manage THEN e.bonus_points END AS bonus_points,
  CASE WHEN access.can_manage THEN e.penalty_points END AS penalty_points,
  CASE WHEN access.can_manage THEN e.time_over_limit END AS time_over_limit,
  CASE WHEN access.can_manage THEN e.time_limit_exceeded_seconds END AS time_limit_exceeded_seconds,
  CASE WHEN access.can_manage OR vis.placement_visible THEN e.final_placement END AS final_placement,
  CASE WHEN access.can_manage THEN e.judge_notes END AS judge_notes,
  CASE WHEN access.can_manage THEN e.judge_signature END AS judge_signature,
  CASE WHEN access.can_manage THEN e.judge_signature_timestamp END AS judge_signature_timestamp,
  CASE WHEN access.can_manage THEN e.disqualification_reason END AS disqualification_reason,
  CASE WHEN access.can_manage THEN e.has_video_review END AS has_video_review,
  CASE WHEN access.can_manage THEN e.video_review_notes END AS video_review_notes,
  e.license_key,
  e.local_id,
  e.sync_version,
  e.last_synced_at,
  e.created_at,
  e.updated_at,
  e.deleted_at,
  e.deleted_by,
  e.check_in_status,
  e.payment_method,
  e.entry_source,
  e.is_day_of_show,
  e.registration_id,
  e.withdrawal_reason,
  e.refund_amount,
  e.refund_notes,
  e.refunded_at,
  e.stripe_payment_intent_id,
  e.comped,
  e.comped_reason,
  e.discount_amount,
  e.promo_code_id,
  e.confirmation_email_sent_at,
  e.confirmation_email_message_id,
  e.confirmation_email_status,
  e.version,
  CASE
    WHEN (access.can_manage OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'qualified'  THEN 'Q'
    WHEN (access.can_manage OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'nq'         THEN 'NQ'
    WHEN (access.can_manage OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'absent'     THEN 'ABS'
    WHEN (access.can_manage OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'excused'    THEN 'EX'
    WHEN (access.can_manage OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'withdrawn'  THEN 'WD'
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
  sh.organization AS show_organization
FROM public.entries e
LEFT JOIN public.dogs d ON d.id = e.dog_id
LEFT JOIN public.classes c ON c.id = e.class_id
LEFT JOIN public.shows sh ON sh.id = e.show_id
CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id) AS vis
CROSS JOIN LATERAL (
  SELECT
    public.can_manage_show(e.show_id) AS can_manage,
    EXISTS (
      SELECT 1
      FROM public.people p
      WHERE p.auth_user_id = auth.uid()
        AND p.id = e.handler_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.people p
      JOIN public.dogs owned_dog ON owned_dog.owner_id = p.id
      WHERE p.auth_user_id = auth.uid()
        AND owned_dog.id = e.dog_id
    ) AS is_own_entry
) AS access
WHERE access.can_manage OR access.is_own_entry;

GRANT SELECT ON public.view_authenticated_entry_results TO authenticated;
GRANT SELECT ON public.view_authenticated_entry_results TO service_role;
REVOKE SELECT ON public.view_authenticated_entry_results FROM anon;

-- Replace authenticated's broad table SELECT with a safe column allowlist.
-- Scored/result columns are intentionally omitted; staff and own-entry reads
-- that need those fields must use view_authenticated_entry_results.
REVOKE SELECT ON public.entries FROM authenticated;

GRANT SELECT (
  id,
  dog_id,
  class_id,
  show_id,
  trial_id,
  handler_id,
  entry_status,
  payment_status,
  handler,
  entry_fee,
  submitted_at,
  special_requests,
  armband,
  run_order,
  jump_height,
  preferred_judge,
  move_up_requested,
  is_scored,
  is_in_ring,
  ring_entry_time,
  ring_exit_time,
  scoring_started_at,
  scoring_completed_at,
  license_key,
  local_id,
  sync_version,
  last_synced_at,
  created_at,
  updated_at,
  deleted_at,
  deleted_by,
  check_in_status,
  payment_method,
  entry_source,
  is_day_of_show,
  registration_id,
  withdrawal_reason,
  refund_amount,
  refund_notes,
  refunded_at,
  stripe_payment_intent_id,
  comped,
  comped_reason,
  discount_amount,
  promo_code_id,
  confirmation_email_sent_at,
  confirmation_email_message_id,
  confirmation_email_status,
  version
) ON public.entries TO authenticated;

GRANT SELECT ON public.entries TO service_role;

NOTIFY pgrst, 'reload schema';
