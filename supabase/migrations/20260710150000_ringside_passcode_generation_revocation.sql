-- =============================================================================
-- Migration 20260710150000: passcode-regeneration revokes stamped ringside claims
-- (judge-verification-remediation R2 / J1.3)
--
-- Change: openspec/changes/judge-verification-remediation/ (R2)
--
-- PROBLEM (J1.3):
--   regenerate_show_passcodes(p_show_id) rewrites show_passcodes.passcode_hash +
--   created_at IN PLACE (ON CONFLICT (show_id, role) DO UPDATE) — the row's
--   primary key `id` is STABLE across regeneration. validate-passcode stamps a
--   forge-proof app_metadata claim { kind:'ringside_passcode', show_id,
--   ringside_role } that carries NO generation marker, and both
--   ringside_update_entry and upsert_ringside_session authorize purely on that
--   claim with no cross-check against the live show_passcodes row. So a claim
--   minted from an ALREADY-REGENERATED (stale) passcode keeps working forever —
--   a secretary regenerating codes to cut off a compromised device does NOT
--   actually cut it off.
--
-- FIX (generation counter — server-authoritative, no schema change, no auth-admin
--   calls): validate-passcode now ALSO stamps app_metadata.passcode_generation =
--   the matched (show_id, role) row's created_at, serialized as an ISO timestamp.
--   created_at already exists, is bumped on every regeneration, and monotonically
--   increases. Both RPCs, IN THEIR PASSCODE-CLAIM ARM ONLY, re-look-up the CURRENT
--   show_passcodes.created_at for the claim's (show, role) and reject the call
--   with 42501 if the stamped generation does not match (or the row is gone).
--
--   * The manager / assigned-judge / steward-ROLE authorization branches, the
--     column allow-lists, and the OCC/version-conflict logic in
--     ringside_update_entry are UNTOUCHED — a stale passcode claim only fails hard
--     when it is the SOLE basis for authorization (a caller who ALSO holds an
--     account-based tier falls back to that tier, never blocked by a stale claim).
--   * The account arm (signed-in account, no passcode claim) of
--     upsert_ringside_session is UNTOUCHED — the generation check applies ONLY to
--     the passcode-claim arm.
--
-- Re-emits 20260625190000's ringside_update_entry and 20260704190000's
-- upsert_ringside_session VERBATIM except for the new generation guard. GRANTs are
-- re-declared identically.
-- =============================================================================

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
  -- Generation-revocation (J1.3): the claim's stamped passcode generation and the
  -- current show_passcodes.created_at it is validated against.
  v_claim_generation text;
  v_current_generation timestamptz;
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
  -- stamped passcode_generation still matches the CURRENT show_passcodes.created_at
  -- for (show, role). regenerate_show_passcodes bumps created_at in place (the row
  -- id is stable), so a claim minted from a since-regenerated code is stale and must
  -- be revoked. This gates the PASSCODE-CLAIM arm ONLY: a caller who also holds an
  -- account tier (manager / assigned judge / steward role) falls back to it and is
  -- never blocked by a stale claim; those branches are untouched.
  IF (v_has_judge_claim OR v_has_steward_claim)
     AND NOT (v_is_manager OR v_is_assigned_judge OR v_is_steward) THEN
    SELECT sp.created_at
      INTO v_current_generation
      FROM public.show_passcodes sp
     WHERE sp.show_id = v_show_id
       AND sp.role = v_claim_role
     LIMIT 1;

    v_claim_generation := (SELECT auth.jwt()) -> 'app_metadata' ->> 'passcode_generation';

    IF v_current_generation IS NULL
       OR v_claim_generation IS NULL
       OR v_claim_generation::timestamptz IS DISTINCT FROM v_current_generation THEN
      RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'
        USING errcode = '42501';
    END IF;
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
-- Harden: the live grant left `anon` with stale EXECUTE (unlike its sibling
-- upsert_ringside_session, which revokes it). The ringside passcode session runs
-- as `authenticated` (anonymous sign-in yields the authenticated role, not the
-- `anon` postgres role), so revoking `anon` closes dead-but-reachable surface
-- without affecting any real caller. Internal authz already denied a claimless
-- anon, so this is defense-in-depth, not a behavior change for legitimate use.
REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- upsert_ringside_session — add the same generation guard to its passcode-claim
-- arm ONLY. The account arm (the ELSE branch for signed-in accounts with no
-- passcode claim) is re-emitted verbatim and untouched.
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
  -- Generation-revocation (J1.3): stamped claim generation vs. current row.
  v_claim_generation text;
  v_current_generation timestamptz;
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

    v_show_id := v_claim_show_id::uuid;
    v_role := v_claim_role;

    -- Preserve the show_passcode linkage without needing the raw passcode:
    -- show_passcodes is UNIQUE(show_id, role), so this resolves at most one row.
    select sp.id, sp.created_at
      into v_show_passcode_id, v_current_generation
      from public.show_passcodes sp
     where sp.show_id = v_show_id
       and sp.role = v_role
     limit 1;

    -- Generation revocation (J1.3): the claim authorizes ONLY while its stamped
    -- passcode_generation still matches the current show_passcodes.created_at.
    -- regenerate_show_passcodes bumps created_at in place, so a claim minted from
    -- a since-regenerated code is stale and must be rejected — otherwise a
    -- compromised device the secretary tried to cut off keeps its presence + read.
    v_claim_generation := (auth.jwt() -> 'app_metadata' ->> 'passcode_generation');
    if v_current_generation is null
       or v_claim_generation is null
       or v_claim_generation::timestamptz is distinct from v_current_generation then
      raise exception 'Passcode has been regenerated; re-enter a new code'
        using errcode = '42501';
    end if;
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

notify pgrst, 'reload schema';
