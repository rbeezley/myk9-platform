-- =============================================================================
-- Migration 20260621120000: ringside_update_entry() — ringside write authz
--
-- Problem: at-show ringside writes (scoring, run-order, reset, placement,
-- check-in) go through replicatedEntriesTable.updateEntry() -> a direct
-- PostgREST UPDATE under the signed-in user's JWT. The entries UPDATE RLS
-- policy (20260604004045) admits ONLY can_manage_show() = club_admin /
-- trial_secretary / site_admin. Judges and stewards — the roles ringside is
-- built for — are excluded, so their queued writes silently match 0 rows on
-- sync (RLS rejection) and never persist.
--
-- Fix: a SECURITY DEFINER RPC that grants a narrow, role-scoped ringside write
-- path WITHOUT widening the table's RLS policy:
--   * manager (site_admin / trial_secretary / club_admin)  -> full ringside set
--   * judge assigned to the entry's class (judge_assignments, status
--     confirmed|invited)                                    -> full ringside set
--   * steward scoped to the entry's show                    -> run-order +
--     check-in ONLY (ringside matrix: canScore=false)
--
-- Design notes:
--   * Column allow-list is intersected with the incoming payload (the
--     replication layer sends the FULL row), so non-whitelisted columns —
--     payment/refund/stripe/entry_status/etc. — are simply never written.
--     This sidesteps the payment-protection triggers (20260611240000) which
--     would otherwise fire on a full-row UPDATE, and means a steward's payload
--     that happens to carry score fields just drops them.
--   * Optimistic concurrency: caller passes p_expected_version; the UPDATE is
--     gated on `version = p_expected_version`. The entries version-increment
--     trigger (20260608200000) bumps it; we return the new value.
--   * Writing score columns auto-fires the class scoring-state /
--     placement-recalc trigger (20260525170000) — same as a manager's direct
--     write, so reset clears stale placements and scoring recomputes normally.
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
  -- Scoring + placement columns (manager + assigned-judge only).
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
  -- 1. Load the entry's context. NOT FOUND -> the entry doesn't exist (or is
  --    not visible to a SECURITY DEFINER read, which bypasses RLS, so this is a
  --    genuine missing row).
  SELECT e.show_id, e.class_id, e.version
    INTO v_show_id, v_class_id, v_current_version
    FROM public.entries e
   WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = v_show_id;

  -- Reject entries with no show/club context. entries.show_id is nullable, and a
  -- NULL club_id would make is_trial_secretary(NULL) / is_club_admin(NULL) behave
  -- as UNSCOPED checks (their `check_club_id IS NULL OR ...` short-circuits true),
  -- letting any secretary/club_admin write an orphan entry. Deny those outright.
  IF v_show_id IS NULL OR v_club_id IS NULL THEN
    RAISE EXCEPTION 'Entry % has no show/club context', p_entry_id
      USING errcode = '42501';
  END IF;

  -- 2. Resolve the caller to a person record.
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

  -- 4. Resolve the writable column allow-list for this caller.
  IF v_is_manager OR v_is_assigned_judge THEN
    v_allowed := v_runorder_checkin_cols || v_scoring_cols;
  ELSIF v_is_steward THEN
    v_allowed := v_runorder_checkin_cols;
  ELSE
    RAISE EXCEPTION 'Not authorized to update entry %', p_entry_id
      USING errcode = '42501';
  END IF;

  -- 5. Filter the payload down to the allowed keys present. Building the typed
  --    record from ONLY allowed keys means a malformed value in a
  --    non-whitelisted column (the replication layer sends the full row) cannot
  --    abort the call via a coercion error, and jsonb_populate_record only
  --    type-coerces columns we will actually write.
  SELECT jsonb_object_agg(je.key, je.value)
    INTO v_allowed_fields
    FROM jsonb_each(p_fields) AS je
   WHERE je.key = ANY(v_allowed);

  -- Nothing writable in this payload for this role. Enforce OCC if the caller
  -- supplied an expected version (so a stale client gets a conflict rather than a
  -- false "synced" result); a NULL token means last-write-wins (current entries
  -- behavior), so just no-op.
  IF v_allowed_fields IS NULL THEN
    IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
        p_entry_id, p_expected_version USING errcode = '40001';
    END IF;
    RETURN v_current_version;
  END IF;

  -- 6. Build the SET clause from the filtered keys. %I quotes each identifier and
  --    keys are constrained to the fixed allow-list arrays, so this is
  --    injection-safe. Typed values come from jsonb_populate_record so each
  --    column keeps its real type, and an explicit null in the payload (e.g. a
  --    reset clearing final_placement) is written as NULL, not skipped.
  SELECT string_agg(format('%I = ($3::public.entries).%I', key, key), ', ')
    INTO v_set_clause
    FROM jsonb_object_keys(v_allowed_fields) AS key;

  -- 7. Apply the update. The OCC precondition is conditional: a non-null
  --    p_expected_version gates on `version = $2` (opt-in optimistic
  --    concurrency); a NULL token means last-write-wins, matching current
  --    entries-write behavior. RETURNING id only tells us a row matched; the
  --    post-trigger version is read separately below.
  EXECUTE format(
    'UPDATE public.entries SET %s WHERE id = $1 AND ($2 IS NULL OR version = $2) RETURNING id',
    v_set_clause
  )
  USING p_entry_id, p_expected_version, jsonb_populate_record(NULL::public.entries, v_allowed_fields)
  INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    -- 0 rows. Disambiguate a concurrent delete from a version conflict so the
    -- client can react correctly (resync-and-retry vs drop the mutation).
    IF EXISTS (SELECT 1 FROM public.entries WHERE id = p_entry_id) THEN
      RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
        p_entry_id, p_expected_version USING errcode = '40001';
    ELSE
      RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
    END IF;
  END IF;

  -- 8. Return the AUTHORITATIVE post-trigger version. A scoring write fires the
  --    AFTER trigger handle_entry_scoring_state_change -> recalculate_class_
  --    placements, which UPDATEs final_placement on this same row and bumps
  --    version a SECOND time. RETURNING from our UPDATE would hand back the stale
  --    intermediate value, so the client would cache a token that immediately
  --    false-conflicts. Re-read after the statement's AFTER triggers have run.
  SELECT e.version INTO v_new_version FROM public.entries e WHERE e.id = p_entry_id;
  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
