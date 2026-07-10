-- =============================================================================
-- Migration 20260710160000: complete passcode-regeneration revocation across
-- EVERY endpoint that honors the ringside passcode claim (judge-verification-
-- remediation R2 / J1.3, code-review follow-up).
--
-- The prior migration (20260710150000, already pushed) added a generation check
-- to ringside_update_entry + upsert_ringside_session only. Cross-model review
-- (Codex) found — and it was live-confirmed — that the passcode claim is ALSO
-- honored by:
--   * view_authenticated_entry_results (SELECT) — a regenerated/cut-off device
--     could still READ the whole show's entries + scores. Defeats J1.3.
--   * refresh_class_scoring_state_authorized — a stale claim could still trigger
--     scoring-state mutations.
-- Both queue read views (exhibitor / co-owner) share that one view.
--
-- FIX (centralize): a single SECURITY DEFINER helper
-- public.ringside_claim_generation_current() reads the caller's forge-proof
-- app_metadata claim and returns:
--   TRUE  — a ringside_passcode claim whose stamped passcode_generation matches
--           the live show_passcodes.created_at for its (show_id, role);
--   FALSE — a ringside_passcode claim that is STALE / missing its generation /
--           whose (show, role) row is gone (fail closed — revoked);
--   NULL  — no ringside_passcode claim at all (account / plain-anon caller).
-- The three-state return lets a client distinguish "revoked" (FALSE) from "never
-- had a claim" (NULL) without leaking anything (it only reflects the caller's own
-- JWT). Every claim-honoring endpoint now gates its passcode-claim arm on it:
--   * view: AND it into claim_show_match so a stale claim's rows fall back to the
--     no-claim (minimal) visibility — NEVER widened, only narrowed. Every column
--     gate (can_view_admin etc.) is byte-for-byte unchanged.
--   * write RPCs + refresh fn: raise 42501 'Passcode has been regenerated;
--     re-enter a new code' in the passcode-claim arm when the helper is not TRUE,
--     but ONLY when the claim is the SOLE basis of authorization (a caller who
--     also holds an account tier falls back to it, never blocked).
--
-- Also closes the validate-passcode validation-to-stamping RACE: validate_passcode
-- now returns the matched row's created_at atomically with the hash match, so the
-- edge function stamps THAT value instead of a separate follow-up SELECT (which
-- could read a NEWER created_at if regeneration landed between the two).
--
-- Re-emits each touched object VERBATIM except the guard. GRANTs re-declared
-- identically; the helper additionally granted to authenticated so the ringside
-- heartbeat can detect revocation even with no push subscription.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Centralized generation-currency helper.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ringside_claim_generation_current()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (auth.jwt() -> 'app_metadata' ->> 'kind') IS DISTINCT FROM 'ringside_passcode'
      THEN NULL
    ELSE EXISTS (
      SELECT 1
        FROM public.show_passcodes sp
       WHERE sp.show_id::text = nullif((auth.jwt() -> 'app_metadata' ->> 'show_id'), '')
         AND sp.role = (auth.jwt() -> 'app_metadata' ->> 'ringside_role')
         AND (auth.jwt() -> 'app_metadata' ->> 'passcode_generation') IS NOT NULL
         AND (auth.jwt() -> 'app_metadata' ->> 'passcode_generation')::timestamptz = sp.created_at
    )
  END;
$$;

COMMENT ON FUNCTION public.ringside_claim_generation_current() IS
  'Returns TRUE when the caller''s ringside_passcode app_metadata claim carries a '
  'passcode_generation that still matches the live show_passcodes.created_at for '
  'its (show_id, role); FALSE when the claim is stale/missing (revoked, fail '
  'closed); NULL when there is no ringside_passcode claim. Used to revoke stamped '
  'claims after regenerate_show_passcodes bumps created_at in place (J1.3).';

REVOKE ALL ON FUNCTION public.ringside_claim_generation_current() FROM public;
GRANT EXECUTE ON FUNCTION public.ringside_claim_generation_current() TO authenticated;

-- -----------------------------------------------------------------------------
-- 1. validate_passcode — return created_at atomically (closes the stamping race).
--    Return columns change, so DROP + CREATE (CREATE OR REPLACE cannot alter the
--    OUT columns). Service-role-only grant re-declared.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.validate_passcode(text);

CREATE FUNCTION public.validate_passcode(p_code text)
RETURNS TABLE (show_id uuid, role text, passcode_generation timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_hash text;
begin
  v_hash := public._hash_passcode(p_code);
  if v_hash is null then
    return;
  end if;

  return query
    select sp.show_id, sp.role, sp.created_at
      from public.show_passcodes sp
      join public.shows s on s.id = sp.show_id
     where sp.passcode_hash = v_hash
       and s.deleted_at is null
     limit 1;
end
$$;

REVOKE ALL ON FUNCTION public.validate_passcode(text) FROM public;
-- Service-role-only. The only caller is the rate-limited validate-passcode edge
-- function (service_role JWT). BYPASSRLS does NOT bypass function ACLs, so this
-- grant is mandatory.
GRANT EXECUTE ON FUNCTION public.validate_passcode(text) TO service_role;

COMMENT ON FUNCTION public.validate_passcode(text) IS
  'Looks up a 5-char show passcode via HMAC-SHA256 hash and returns the '
  '(show_id, role, passcode_generation=created_at) triple or no rows. The '
  'created_at is returned ATOMICALLY with the hash match so the edge function '
  'stamps the generation the code was valid for (no validate-then-SELECT race). '
  'Service-role-only — must be invoked from a rate-limited edge function.';

-- -----------------------------------------------------------------------------
-- 2. view_authenticated_entry_results — re-emit 20260704201000 VERBATIM except
--    claim_show_match now ANDs the generation-currency helper, so a stale claim's
--    rows fall back to no-claim (minimal) visibility. Every column gate unchanged.
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
        JOIN public.dogs owned_dog ON owned_dog.id = e.dog_id
        WHERE p.auth_user_id = auth.uid()
          AND owned_dog.owner_id = p.id
      )
    ) AS is_own_entry,
    EXISTS (
      SELECT 1
      FROM public.entries own_e
      LEFT JOIN public.dogs own_dog ON own_dog.id = own_e.dog_id
      JOIN public.people p ON p.auth_user_id = auth.uid()
      WHERE own_e.show_id = e.show_id
        AND own_e.deleted_at IS NULL
        AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        AND (
          own_e.handler_id = p.id
          OR own_dog.owner_id = p.id
          OR own_dog.co_owner_id = p.id
        )
    ) AS is_show_exhibitor,
    -- Ringside passcode claim (show-scoped, forge-proof app_metadata, kind marker
    -- required). J1.3: AND the generation-currency helper so a claim minted from a
    -- since-regenerated passcode no longer matches — its rows fall back to no-claim
    -- (minimal) visibility. NEVER widens; only narrows.
    (
      (auth.jwt() -> 'app_metadata' ->> 'kind') = 'ringside_passcode'
      AND nullif((auth.jwt() -> 'app_metadata' ->> 'show_id'), '') = e.show_id::text
      AND public.ringside_claim_generation_current()
    ) AS claim_show_match,
    (auth.jwt() -> 'app_metadata' ->> 'ringside_role') AS claim_role
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

-- -----------------------------------------------------------------------------
-- 3. ringside_update_entry — re-emit 20260710150000 VERBATIM except the inline
--    generation block is replaced by the centralized helper call.
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
  -- Ringside passcode claim. app_metadata is service-role/admin set only
  -- (forge-proof); read it EXCLUSIVELY. Honored ONLY when stamped
  -- kind='ringside_passcode' (collision-proof marker).
  v_claim_kind text;
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

  -- Passcode claim, matched to THIS entry's show and gated on the explicit
  -- kind='ringside_passcode' marker. A claim for another show, or without the
  -- marker, does not authorize.
  v_claim_kind := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';
  v_has_judge_claim :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role IN ('judge', 'admin');
  v_has_steward_claim :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role = 'steward';

  -- 3b. Generation revocation (J1.3). A passcode claim authorizes ONLY while its
  -- stamped passcode_generation still matches the current show_passcodes.created_at
  -- (centralized in ringside_claim_generation_current). This gates the PASSCODE-
  -- CLAIM arm ONLY: a caller who also holds an account tier falls back to it and is
  -- never blocked by a stale claim; those branches are untouched.
  IF (v_has_judge_claim OR v_has_steward_claim)
     AND NOT (v_is_manager OR v_is_assigned_judge OR v_is_steward)
     AND public.ringside_claim_generation_current() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'
      USING errcode = '42501';
  END IF;

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
      -- DETAIL carries the authoritative current version so the client can
      -- advance its OCC token (it may be denied a direct entries read).
      RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
        p_entry_id, p_expected_version
        USING errcode = '40001', detail = v_current_version::text;
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
    -- Re-read the authoritative version (SECURITY DEFINER bypasses RLS) and, if
    -- the row still exists, surface it in DETAIL on the conflict. The caller's
    -- own role may be denied a direct entries read, so it cannot re-read this
    -- itself; without the RPC handing it back the client's OCC token stays stale
    -- and it re-conflicts forever.
    SELECT e.version INTO v_current_version FROM public.entries e WHERE e.id = p_entry_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
        p_entry_id, p_expected_version
        USING errcode = '40001', detail = v_current_version::text;
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
REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. upsert_ringside_session — re-emit 20260710150000 VERBATIM except the inline
--    generation block is replaced by the centralized helper call. Account arm
--    (else branch) untouched.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_ringside_session(
  p_passcode_or_null text,
  p_subscription_endpoint text,
  p_favorited_armbands text[] default '{}'::text[],
  p_route text default null
)
returns table (show_id uuid, role text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_subscription_user_id uuid;
  v_show_id uuid;
  v_role text;
  v_show_passcode_id uuid;
  -- Ringside passcode claim (forge-proof app_metadata; service-role set only).
  v_claim_kind text;
  v_claim_show_id text;
  v_claim_role text;
begin
  if nullif(trim(coalesce(p_subscription_endpoint, '')), '') is null then
    raise exception 'push subscription is required' using errcode = '22023';
  end if;

  select ps.id, ps.user_id
    into v_subscription_id, v_subscription_user_id
    from public.push_subscriptions ps
   where ps.endpoint = p_subscription_endpoint
   limit 1;

  if v_subscription_id is null then
    raise exception 'push subscription is required' using errcode = '22023';
  end if;

  -- Read the ringside passcode claim from the (forge-proof) app_metadata, NEVER
  -- user_metadata. Gated on the explicit kind='ringside_passcode' marker
  -- (show_id/ringside_role are generic key names; the marker is what makes the
  -- claim unambiguously "from a ringside passcode"). Mirrors mig 20260624163000.
  v_claim_kind := (auth.jwt() -> 'app_metadata' ->> 'kind');
  v_claim_show_id := nullif((auth.jwt() -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (auth.jwt() -> 'app_metadata' ->> 'ringside_role');

  if v_claim_kind = 'ringside_passcode'
     and v_claim_show_id is not null
     and v_claim_role in ('judge', 'steward', 'admin', 'exhibitor') then
    -- Passcode-claim arm (the primary ringside sign-in). The caller is a signed-in
    -- anonymous session; anonymous users carry an auth.uid(), and the push
    -- subscription must belong to that session.
    if auth.uid() is null then
      raise exception 'credential not recognized' using errcode = '28000';
    end if;

    if v_subscription_user_id is distinct from auth.uid() then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    -- Generation revocation (J1.3): the claim authorizes ONLY while its stamped
    -- passcode_generation still matches the current show_passcodes.created_at.
    -- regenerate_show_passcodes bumps created_at in place, so a claim minted from a
    -- since-regenerated code is stale and must be rejected — otherwise a compromised
    -- device the secretary tried to cut off keeps its presence + read.
    if public.ringside_claim_generation_current() is distinct from true then
      raise exception 'Passcode has been regenerated; re-enter a new code'
        using errcode = '42501';
    end if;

    v_show_id := v_claim_show_id::uuid;
    v_role := v_claim_role;

    -- Preserve the show_passcode linkage without needing the raw passcode:
    -- show_passcodes is UNIQUE(show_id, role), so this resolves at most one row.
    select sp.id
      into v_show_passcode_id
      from public.show_passcodes sp
     where sp.show_id = v_show_id
       and sp.role = v_role
     limit 1;
  else
    -- Account arm (unchanged): a signed-in ACCOUNT with no ringside passcode claim
    -- derives its single active ringside show from its OWN entries (entrant-only).
    if auth.uid() is null then
      raise exception 'credential not recognized' using errcode = '28000';
    end if;

    if v_subscription_user_id is distinct from auth.uid() then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    v_show_id := public._account_ringside_show_id(p_route);
    if v_show_id is null then
      raise exception 'account is not entered in exactly one active ringside show' using errcode = '42501';
    end if;

    v_role := 'exhibitor';
  end if;

  insert into public.ringside_sessions (
    subscription_id,
    show_id,
    show_passcode_id,
    role,
    favorited_armbands,
    last_seen_at,
    last_seen_route,
    updated_at
  )
  values (
    v_subscription_id,
    v_show_id,
    v_show_passcode_id,
    v_role,
    coalesce(p_favorited_armbands, '{}'::text[]),
    now(),
    p_route,
    now()
  )
  on conflict on constraint ringside_sessions_pkey do update
    set show_passcode_id = excluded.show_passcode_id,
        role = excluded.role,
        favorited_armbands = excluded.favorited_armbands,
        last_seen_at = excluded.last_seen_at,
        last_seen_route = excluded.last_seen_route,
        updated_at = excluded.updated_at;

  show_id := v_show_id;
  role := v_role;
  return next;
end
$$;

revoke all on function public.upsert_ringside_session(text, text, text[], text) from public;
revoke all on function public.upsert_ringside_session(text, text, text[], text) from anon;
grant execute on function public.upsert_ringside_session(text, text, text[], text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. refresh_class_scoring_state_authorized — re-emit 20260703120000 VERBATIM
--    except the passcode-claim arm now also requires a current generation.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state_authorized(
  p_class_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_class_id uuid;
  v_club_id uuid;
  v_caller_person_id uuid;
  v_is_manager boolean;
  v_is_assigned_judge boolean;
  v_claim_kind text;
  v_claim_show_id text;
  v_claim_role text;
  v_has_judge_claim boolean;
BEGIN
  SELECT c.id, t.show_id, s.club_id
    INTO v_class_id, v_show_id, v_club_id
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    JOIN public.shows s ON s.id = t.show_id
   WHERE c.id = p_class_id;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Class % not found', p_class_id
      USING errcode = 'P0002';
  END IF;

  IF v_show_id IS NULL OR v_club_id IS NULL THEN
    RAISE EXCEPTION 'Class % not found or missing show context', p_class_id
      USING errcode = '42501';
  END IF;

  SELECT p.id
    INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

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

  v_claim_kind := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';
  v_has_judge_claim :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role IN ('judge', 'admin');

  IF NOT (v_is_manager OR v_is_assigned_judge OR v_has_judge_claim) THEN
    RAISE EXCEPTION 'Not authorized to refresh scoring state for class %', p_class_id
      USING errcode = '42501';
  END IF;

  -- Generation revocation (J1.3): a judge claim triggers scoring-state refresh
  -- ONLY while its stamped generation is current. Gates the passcode-claim arm
  -- only — an account manager / assigned judge falls back to their own tier.
  IF v_has_judge_claim
     AND NOT (v_is_manager OR v_is_assigned_judge)
     AND public.ringside_claim_generation_current() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'
      USING errcode = '42501';
  END IF;

  PERFORM public.refresh_class_scoring_state(p_class_id);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_class_scoring_state_authorized(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_class_scoring_state_authorized(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
