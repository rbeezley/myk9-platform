-- =============================================================================
-- Migration 20260624163000: ringside PASSCODE-claim read + write authorization
--
-- Plan: docs/plan-ringside-entries-read-authz.md (Phases A + B).
--
-- Context: a judge/steward/timer who signs in with a show PASSCODE (no account)
-- is the primary real-world ringside identity. Today they have no server
-- identity: validate-passcode returns {show_id, role} but the grant is
-- client-only, so the DB sees a plain anon caller — the at-show read view
-- REVOKEs anon and the write RPC authorizes on auth.uid() only. Result: a
-- passcode judge reads 0 entries and cannot score.
--
-- Keystone (locked 2026-06-24): validate-passcode will mint a short-lived
-- ANONYMOUS Supabase session stamped with app_metadata { show_id, ringside_role }
-- (Phase C, separate PR). Anonymous users authenticate as the `authenticated`
-- Postgres role, so they reuse the same offline replication read + write RPC as
-- accounts. THIS migration adds the claim-based authorization tier to both the
-- read view and the write RPC so that, once Phase C mints the claim, the
-- existing paths admit it. Until Phase C ships, the claim branch is inert (no
-- session carries the claim), so this migration is a safe no-op on its own.
--
-- SECURITY — why app_metadata, not user_metadata:
--   app_metadata is settable ONLY by the service role / GoTrue admin API; an
--   end user cannot modify their own app_metadata. user_metadata IS user-
--   editable. Authorizing on app_metadata is therefore forge-proof; authorizing
--   on user_metadata would be a privilege-escalation hole. We read app_metadata
--   EXCLUSIVELY.
--
-- SCOPE — what a claim grants (least privilege):
--   * judge / admin claim (matching the entry's show) -> rows + SCORES (write:
--     full ringside set). Mirrors the account assigned-judge tier.
--   * steward claim (matching the entry's show)        -> rows only, NO scores
--     (write: run-order + check-in only). Mirrors the account steward tier.
--   * Claims are SHOW-scoped (a passcode is one code per show/role), so a judge
--     claim authorizes every class in that show — correct passcode semantics.
--   * Claims NEVER widen can_view_admin: payment / refund / Stripe / comp /
--     email columns stay restricted to managers + the entry owner. A passcode is
--     shareable; financial data must never ride on it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Phase A — read: add the claim tier to view_authenticated_entry_results.
-- Re-emits the view from 20260621190000 verbatim EXCEPT:
--   (1) flags lateral gains claim_show_match + claim_role,
--   (2) access lateral gains is_ringside_claim and folds judge/admin claims into
--       can_view_scores (can_view_admin is UNCHANGED — claims get no financials),
--   (3) WHERE admits is_ringside_claim.
-- Column list is byte-for-byte unchanged (CREATE OR REPLACE VIEW forbids
-- changing a column's name/type/order).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_authenticated_entry_results
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
CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id) AS vis
-- Base access flags, correlated to e/sh (single-level lateral, as the prior view).
CROSS JOIN LATERAL (
  SELECT
    public.can_manage_show(e.show_id) AS can_manage,
    EXISTS (
      SELECT 1
      FROM public.judge_assignments ja
      JOIN public.people p ON p.id = ja.person_id
      WHERE p.auth_user_id = auth.uid()
        AND ja.class_id = e.class_id
        AND ja.status IN ('confirmed', 'invited')
    ) AS is_assigned_judge,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.auth_user_id = auth.uid()
        AND r.name = 'steward'
        AND ur.is_active
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
        AND (ur.show_id = e.show_id OR (ur.show_id IS NULL AND ur.club_id = sh.club_id))
    ) AS is_show_steward,
    (
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
      )
    ) AS is_own_entry,
    -- Ringside passcode claim (Phase A). app_metadata is service-role/admin set
    -- only (forge-proof). Claims are show-scoped: a passcode is one code per
    -- show/role, so a matching claim authorizes every class in that show.
    (
      nullif((auth.jwt() -> 'app_metadata' ->> 'show_id'), '') = e.show_id::text
    ) AS claim_show_match,
    (auth.jwt() -> 'app_metadata' ->> 'ringside_role') AS claim_role
) AS flags
-- Derived gates (chained lateral references the prior lateral's output):
--  * can_view_scores — raw scored columns: managers + the class's assigned
--    judge + a judge/admin PASSCODE claim. Stewards (role or claim) excluded.
--  * can_view_admin — financial/PII columns: managers + the entry's OWNER only.
--    Ringside staff (judge/steward, account OR claim) are admitted to rows but
--    must NOT see payment/refund/Stripe/comp/email fields.
CROSS JOIN LATERAL (
  SELECT
    flags.can_manage,
    flags.is_assigned_judge,
    flags.is_show_steward,
    flags.is_own_entry,
    -- A valid ringside claim for THIS show (any ringside role) admits the row.
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
   OR access.is_ringside_claim;

GRANT SELECT ON public.view_authenticated_entry_results TO authenticated;
GRANT SELECT ON public.view_authenticated_entry_results TO service_role;
REVOKE SELECT ON public.view_authenticated_entry_results FROM anon;

-- -----------------------------------------------------------------------------
-- Phase B — write: add the claim tier to ringside_update_entry.
-- Re-emits 20260621171500 verbatim EXCEPT for the new claim variables and their
-- inclusion in the authorization / allow-list resolution (step 3 + 4).
-- judge/admin claim -> full ringside set; steward claim -> run-order + check-in.
-- Claim is matched to the ENTRY'S show (v_show_id), so a claim for show X cannot
-- write entries in show Y.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ringside_update_entry(
  p_entry_id uuid,
  p_fields jsonb,
  p_expected_version integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_person_id uuid;
  v_show_id uuid;
  v_class_id uuid;
  v_club_id uuid;
  v_current_version integer;
  v_is_manager boolean;
  v_is_assigned_judge boolean;
  v_is_steward boolean;
  -- Ringside passcode claim (Phase B). app_metadata is service-role/admin set
  -- only (forge-proof); read it EXCLUSIVELY, never user_metadata.
  v_claim_show_id text;
  v_claim_role text;
  v_has_judge_claim boolean;
  v_has_steward_claim boolean;
  v_allowed text[];
  v_allowed_fields jsonb;
  v_set_clause text;
  v_updated_id uuid;
  v_new_version integer;
  -- Run-order + check-in columns (the steward / shared subset).
  v_runorder_checkin_cols constant text[] := ARRAY[
    'run_order', 'check_in_status', 'is_in_ring',
    'ring_entry_time', 'ring_exit_time'
  ];
  -- Scoring + placement columns (manager + assigned-judge / judge-claim only).
  v_scoring_cols constant text[] := ARRAY[
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
    'final_placement',
    'judge_notes', 'judge_signature', 'judge_signature_timestamp',
    'disqualification_reason', 'has_video_review', 'video_review_notes',
    'scoring_started_at', 'scoring_completed_at'
  ];
BEGIN
  -- 1. Load the entry's context.
  SELECT e.show_id, e.class_id, e.version
    INTO v_show_id, v_class_id, v_current_version
    FROM public.entries e
   WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = v_show_id;

  IF v_show_id IS NULL OR v_club_id IS NULL THEN
    RAISE EXCEPTION 'Entry % has no show/club context', p_entry_id
      USING errcode = '42501';
  END IF;

  -- 2. Resolve the caller to a person record (NULL for a passcode/anon session).
  SELECT p.id
    INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  -- 3. Authorization tiers.
  v_is_manager :=
    public.is_site_admin()
    OR public.is_trial_secretary(v_club_id)
    OR public.is_club_admin(v_club_id);

  v_is_assigned_judge := v_caller_person_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.judge_assignments ja
     WHERE ja.person_id = v_caller_person_id
       AND ja.class_id = v_class_id
       AND ja.status IN ('confirmed', 'invited')
  );

  v_is_steward := EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.auth_user_id = (SELECT auth.uid())
       AND r.name = 'steward'
       AND ur.is_active
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
       AND (ur.show_id = v_show_id
            OR (ur.show_id IS NULL AND ur.club_id = v_club_id))
  );

  -- Passcode claim, matched to THIS entry's show. A claim for another show
  -- does not authorize this write.
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';
  v_has_judge_claim :=
    v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role IN ('judge', 'admin');
  v_has_steward_claim :=
    v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role = 'steward';

  -- 4. Resolve the writable column allow-list for this caller.
  IF v_is_manager OR v_is_assigned_judge OR v_has_judge_claim THEN
    v_allowed := v_runorder_checkin_cols || v_scoring_cols;
  ELSIF v_is_steward OR v_has_steward_claim THEN
    v_allowed := v_runorder_checkin_cols;
  ELSE
    RAISE EXCEPTION 'Not authorized to update entry %', p_entry_id
      USING errcode = '42501';
  END IF;

  -- 5. Filter the payload down to the allowed keys present.
  SELECT jsonb_object_agg(je.key, je.value)
    INTO v_allowed_fields
    FROM jsonb_each(p_fields) AS je
   WHERE je.key = ANY(v_allowed);

  IF v_allowed_fields IS NULL THEN
    IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
        p_entry_id, p_expected_version USING errcode = '40001';
    END IF;
    RETURN v_current_version;
  END IF;

  -- 6. Build the SET clause from the filtered keys (identifiers from the fixed
  --    allow-list, %I-quoted -> injection-safe).
  SELECT string_agg(format('%I = ($3::public.entries).%I', key, key), ', ')
    INTO v_set_clause
    FROM jsonb_object_keys(v_allowed_fields) AS key;

  -- 7. Apply the update with opt-in optimistic concurrency.
  EXECUTE format(
    'UPDATE public.entries SET %s WHERE id = $1 AND ($2 IS NULL OR version = $2) RETURNING id',
    v_set_clause
  )
  USING p_entry_id, p_expected_version, jsonb_populate_record(NULL::public.entries, v_allowed_fields)
  INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.entries WHERE id = p_entry_id) THEN
      RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
        p_entry_id, p_expected_version USING errcode = '40001';
    ELSE
      RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
    END IF;
  END IF;

  -- 8. Return the AUTHORITATIVE post-trigger version.
  SELECT e.version INTO v_new_version FROM public.entries e WHERE e.id = p_entry_id;
  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
