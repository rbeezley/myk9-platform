-- MYK9-740: a replayed ringside write that has ALREADY landed returns success
-- instead of a 40001 version conflict.
--
-- What happened (Playwright Regression run 36057233283, attempt 2): a judge's
-- offline score drained on reconnect, the page reloaded 18ms later, and the
-- browser abandoned the request. The server had committed it (version 14 -> 15).
-- After the reload the queue replayed the same call with p_expected_version 14,
-- which this function rejected as a conflict (DETAIL 15). The client parked the
-- score in OCC back-off, and the judge was shown "This record was changed
-- elsewhere" for their own score. Any lost response does the same: a timeout,
-- a tab closed mid-upload, a service-worker update.
--
-- The fix is value-level idempotency at the conflict site. On a version
-- mismatch, if every field this caller is allowed to write already holds the
-- value the call asks for, there is nothing to conflict with: applying the write
-- would change nothing. Return the current version (so the client's OCC token
-- advances and the next queued write for the row carries it) and write nothing.
-- If ANY requested field differs, the conflict stands exactly as before,
-- including the MYK9-115 containment gate.
--
-- Comparison is column-typed, not textual: both sides go through the entries
-- row type, so '2026-09-24T21:19:38.574Z' in the payload equals the stored
-- timestamptz that PostgREST spells '...+00:00'. The row is re-read FOR UPDATE
-- for the check, so the version returned is the version of the row compared.
--
-- Ordering is unchanged where it matters: authorization (step 4) still runs
-- before any version is disclosed or any counter moves. The allow-list filter
-- moved up from step 6 to step 5 so the replay check sees only writable keys;
-- it reads no data. An already-applied replay does not bump
-- ringside_conflict_seq, because it is not a conflict.
--
-- Rebuilt from 20260731200000_ringside_update_entry_containment_gate.sql, the
-- LATEST migration defining this function (verified with
--   grep -l "CREATE OR REPLACE FUNCTION public.ringside_update_entry" supabase/migrations/
-- ). Signature, return type, SECURITY DEFINER, search_path and grants unchanged.

BEGIN;

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
  v_already_applied boolean;
  v_current_row jsonb;
  v_requested_row jsonb;
  v_containment public.ringside_containment;
  v_runorder_checkin_cols constant text[] := ARRAY[
    'run_order', 'check_in_status', 'is_in_ring',
    'ring_entry_time', 'ring_exit_time'
  ];
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
  -- 1. Load the entry's context. Existence is still disclosed for a known UUID,
  -- matching the prior accepted trade-off; version conflicts are not.
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

  IF (v_has_judge_claim OR v_has_steward_claim)
     AND NOT (v_is_manager OR v_is_assigned_judge OR v_is_steward)
     AND public.ringside_claim_generation_current() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'
      USING errcode = '42501';
  END IF;

  -- 4. Resolve the writable column allow-list before any OCC conflict response.
  -- This is the security boundary: unauthorized callers must never increment the
  -- health counter or receive current-version DETAIL.
  IF v_is_manager OR v_is_assigned_judge OR v_has_judge_claim THEN
    v_allowed := v_runorder_checkin_cols || v_scoring_cols;
  ELSIF v_is_steward OR v_has_steward_claim THEN
    v_allowed := v_runorder_checkin_cols;
  ELSE
    RAISE EXCEPTION 'Not authorized to update entry %', p_entry_id
      USING errcode = '42501';
  END IF;

  -- 5. Filter the payload down to the allowed keys present. Pure: reads no row.
  SELECT jsonb_object_agg(je.key, je.value)
    INTO v_allowed_fields
    FROM jsonb_each(p_fields) AS je
   WHERE je.key = ANY(v_allowed);

  -- 6. Authorized OCC precheck. A stale expected_version can never succeed by
  -- retrying unchanged, so reject it before the dynamic UPDATE.
  -- nextval survives the abort and now counts only authorized ringside writers.
  IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
    -- MYK9-740: a replay of a write that already landed (its response was
    -- lost) is not a conflict. When every requested field already holds the
    -- requested value, the write would change nothing: report the current
    -- version and write nothing. A key the row does not have never matches.
    --
    -- The row is re-read FOR UPDATE: the comparison and the version returned
    -- must describe the same row state, and no other writer may move it in
    -- between. Returning the step-1 version after a concurrent write would
    -- hand the caller a stale OCC token for its next queued write.
    IF v_allowed_fields IS NOT NULL THEN
      SELECT to_jsonb(e), e.version
        INTO v_current_row, v_current_version
        FROM public.entries e
       WHERE e.id = p_entry_id
         FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
      END IF;

      v_requested_row := to_jsonb(jsonb_populate_record(NULL::public.entries, v_allowed_fields));

      SELECT NOT EXISTS (
        SELECT 1
          FROM jsonb_object_keys(v_allowed_fields) AS k
         WHERE NOT (v_current_row ? k)
            OR (v_current_row -> k) IS DISTINCT FROM (v_requested_row -> k)
      )
        INTO v_already_applied;

      IF v_already_applied THEN
        RETURN v_current_version;
      END IF;
    END IF;

    PERFORM nextval('public.ringside_conflict_seq');
    -- MYK9-115 admission control: while the breaker is contained, conflicting
    -- calls back off server-side (rate-caps stale bundles that predate RS429)
    -- and raise a distinguishable code so current clients pause their outbox.
    -- Version-correct calls never take this path (blast-radius decision).
    SELECT * INTO v_containment FROM public.ringside_containment;
    IF FOUND AND v_containment.state = 'contained' THEN
      PERFORM pg_sleep(v_containment.backpressure_ms / 1000.0);
      RAISE EXCEPTION 'Ringside scoring contained; retries paused'
        USING errcode = 'RS429',
              detail = v_current_version::text,
              hint = 'retry_after=60';
    END IF;
    RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
      p_entry_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  IF v_allowed_fields IS NULL THEN
    RETURN v_current_version;
  END IF;

  -- 7. Build the SET clause from the filtered keys (identifiers from the fixed
  -- allow-list, %I-quoted -> injection-safe).
  SELECT string_agg(format('%I = ($3::public.entries).%I', key, key), ', ')
    INTO v_set_clause
    FROM jsonb_object_keys(v_allowed_fields) AS key;

  -- 8. Apply the update with opt-in optimistic concurrency.
  EXECUTE format(
    'UPDATE public.entries SET %s WHERE id = $1 AND ($2 IS NULL OR version = $2) RETURNING id',
    v_set_clause
  )
  USING p_entry_id, p_expected_version, jsonb_populate_record(NULL::public.entries, v_allowed_fields)
  INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    SELECT e.version INTO v_current_version FROM public.entries e WHERE e.id = p_entry_id;
    IF FOUND THEN
      PERFORM nextval('public.ringside_conflict_seq');
      -- Same containment gate at the late TOCTOU conflict site (mirrors step 6).
      SELECT * INTO v_containment FROM public.ringside_containment;
      IF FOUND AND v_containment.state = 'contained' THEN
        PERFORM pg_sleep(v_containment.backpressure_ms / 1000.0);
        RAISE EXCEPTION 'Ringside scoring contained; retries paused'
          USING errcode = 'RS429',
                detail = v_current_version::text,
                hint = 'retry_after=60';
      END IF;
      RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
        p_entry_id, p_expected_version
        USING errcode = '40001', detail = v_current_version::text;
    ELSE
      RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
    END IF;
  END IF;

  -- 9. Return the authoritative post-trigger version.
  SELECT e.version INTO v_new_version FROM public.entries e WHERE e.id = p_entry_id;
  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM public;
REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
