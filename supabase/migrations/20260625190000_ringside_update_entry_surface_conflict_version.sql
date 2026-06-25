-- =============================================================================
-- Migration 20260625190000: ringside_update_entry surfaces the current version
-- on an OCC conflict (fixes the conflict-storm token-advance for ringside roles)
--
-- Problem (review of PR #961): the client's conflict recovery advances its local
-- OCC token by RE-READING entries.version through a direct table read. But the
-- ringside identities this RPC exists for — an assigned-judge JWT, a steward
-- role, and a passcode anon claim — are each DENIED a direct entries read (that
-- denial is the entire reason this SECURITY DEFINER RPC exists; reads go through
-- view_authenticated_entry_results, which REVOKEs anon and keys on auth.uid()).
-- So for exactly those roles the re-read returns 0 rows, the fresh version is
-- undefined, the token never advances, and the client keeps regenerating the
-- same stale-version write — the conflict storm continues.
--
-- Fix: have the RPC — which already authorized the write and already holds the
-- authoritative version — return that version in the exception's DETAIL field on
-- a version conflict. PostgREST surfaces DETAIL as error.details, so the client
-- reads the current version straight from the conflict, with no second read and
-- no dependence on the caller's table-read authz. Role-agnostic by construction.
--
-- Re-emits 20260624163000's ringside_update_entry VERBATIM except the two
-- '40001' raises now carry `detail = <current version>`. The view in that
-- migration is unchanged and is not re-emitted here.
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
GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
