-- MYK9-1754: an append-only audit of every successful ringside_update_entry write.
--
-- Until now nothing recorded who entered or changed a result, for a signed-in
-- judge or a passcode user (an anonymous session whose JWT carries only show_id,
-- ringside_role and passcode_generation). In a scoring dispute the secretary
-- could not say who touched a score, or when.
--
-- One row per call that actually ran the UPDATE, written in the same transaction
-- from inside the SECURITY DEFINER function, so a rolled-back call leaves no row
-- and a committed one always does. Calls that write nothing audit nothing: the
-- MYK9-740 idempotent replay returns before the UPDATE, as does a payload with no
-- writable key, and every authorization / version / containment refusal RAISEs.
-- A row trigger on entries was rejected: it cannot see the authorization tier or
-- the passcode claim, and it fires on non-score writes.
--
-- Columns: the diff is {column: {"old": ..., "new": ...}} for the keys whose value
-- changed. actor_tier names the arm that authorized the write: manager,
-- assigned_judge, steward, passcode_judge, passcode_admin, passcode_steward.
-- actor_user_id is auth.uid() (the anonymous id for passcode sessions);
-- actor_person_id and actor_display_name are the signed-in person (NULL for
-- passcode). The display name is a snapshot so the record survives a rename or
-- delete. passcode_role / passcode_generation come from the claim on passcode
-- tiers only. client_saved_at is the DEVICE save time the offline queue sends
-- as p_client_saved_at (owner decision 2026-11-07): "scored 10:42, synced 11:05".
-- It is stored as given, never validated; changed_at is the server time. The
-- column stays NULL until the client starts sending the parameter (MYK9-1758).
--
-- No foreign keys on purpose: hard_delete_show's reviewed FK manifest refuses
-- (MK615) on any unclassified edge into shows/trials/classes, and audit rows
-- must outlive the rows they describe. Retention: kept for the life of the
-- show's records. Nothing prunes this table. One small row per score change.
--
-- Access: no client write at all. Show managers (secretary, club admin, site
-- admin) read through RLS using manageable_show_ids(). anon is revoked
-- explicitly: this project's default privileges grant anon full CRUD on every
-- new table (MYK9-93).
--
-- Signature change: p_client_saved_at is a new optional parameter, so the old
-- 3-argument function is DROPPED, otherwise it would stay callable beside the
-- new one with no audit time. Grants are re-issued exactly as 20260925143700
-- left them (REVOKE public, REVOKE anon, GRANT authenticated).
--
-- Function body copied from 20260925143700_myk9_740_ringside_replay_idempotent.sql,
-- the LATEST migration defining ringside_update_entry (verified with
--   grep -l "CREATE OR REPLACE FUNCTION public.ringside_update_entry" supabase/migrations/
-- ). The helper ringside_replay_applied_version is unchanged and not redefined.
--
-- Other score-writing paths that remain UNAUDITED (documented gaps, tracked in
-- MYK9-1759): direct UPDATEs on entries by managers for mixed-column writes
-- (entry management), and server-side system writes (placement recalculation,
-- stale-class auto-completion).

BEGIN;

CREATE TABLE public.entry_score_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL,
  class_id uuid NOT NULL,
  show_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  actor_person_id uuid,
  actor_display_name text,
  actor_tier text NOT NULL,
  passcode_role text,
  passcode_generation text,
  entry_version integer,
  client_saved_at timestamptz,
  CONSTRAINT entry_score_audit_actor_tier_check CHECK (
    actor_tier IN (
      'manager', 'assigned_judge', 'steward',
      'passcode_judge', 'passcode_admin', 'passcode_steward'
    )
  )
);

CREATE INDEX entry_score_audit_entry_changed_idx
  ON public.entry_score_audit (entry_id, changed_at, id);
CREATE INDEX entry_score_audit_show_idx ON public.entry_score_audit (show_id);

ALTER TABLE public.entry_score_audit ENABLE ROW LEVEL SECURITY;
-- FORCE: the owner is subject to RLS too. ringside_update_entry runs as postgres,
-- which has BYPASSRLS in Supabase, so its insert is unaffected.
ALTER TABLE public.entry_score_audit FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.entry_score_audit FROM PUBLIC;
REVOKE ALL ON public.entry_score_audit FROM anon;
REVOKE ALL ON public.entry_score_audit FROM authenticated;
GRANT SELECT ON public.entry_score_audit TO authenticated;
-- service_role keeps its default privileges (trusted server-side only).

-- Append-only for everyone, the table owner and service_role included. Privileges
-- already stop clients; this stops a mistaken or privileged UPDATE/DELETE/TRUNCATE.
CREATE FUNCTION public.entry_score_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'entry_score_audit is append-only' USING errcode = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.entry_score_audit_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entry_score_audit_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.entry_score_audit_append_only() FROM authenticated;

CREATE TRIGGER entry_score_audit_no_update_delete
  BEFORE UPDATE OR DELETE ON public.entry_score_audit
  FOR EACH ROW EXECUTE FUNCTION public.entry_score_audit_append_only();
CREATE TRIGGER entry_score_audit_no_truncate
  BEFORE TRUNCATE ON public.entry_score_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.entry_score_audit_append_only();

CREATE POLICY entry_score_audit_manager_select
  ON public.entry_score_audit
  FOR SELECT
  TO authenticated
  USING (show_id IN (SELECT public.manageable_show_ids()));

DROP FUNCTION IF EXISTS public.ringside_update_entry(uuid, jsonb, integer);

CREATE OR REPLACE FUNCTION public.ringside_update_entry(
  p_entry_id uuid,
  p_fields jsonb,
  p_expected_version integer,
  p_client_saved_at timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_person_id uuid;
  v_caller_name text;
  v_actor_tier text;
  v_claim_generation text;
  v_prior_row jsonb;
  v_new_row jsonb;
  v_changes jsonb;
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
  v_replay_version integer;
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
  SELECT p.id, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_caller_person_id, v_caller_name
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
    -- MYK9-1754: name the arm that authorized the write, in the same order.
    v_actor_tier := CASE
      WHEN v_is_manager THEN 'manager'
      WHEN v_is_assigned_judge THEN 'assigned_judge'
      WHEN v_claim_role = 'admin' THEN 'passcode_admin'
      ELSE 'passcode_judge'
    END;
  ELSIF v_is_steward OR v_has_steward_claim THEN
    v_allowed := v_runorder_checkin_cols;
    v_actor_tier := CASE WHEN v_is_steward THEN 'steward' ELSE 'passcode_steward' END;
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
    -- lost) is not a conflict. Same predicate as the late site below.
    v_replay_version := public.ringside_replay_applied_version(p_entry_id, v_allowed_fields);
    IF v_replay_version IS NOT NULL THEN
      RETURN v_replay_version;
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

  -- MYK9-1754: capture the pre-update image for the audit diff. No path that can
  -- reach a containment pg_sleep may hold the row lock (Codex P1 on PR #2436).
  --
  -- Versioned call (the normal path): read WITHOUT a lock. The trigger
  -- entries_version_increment (20260608200000_replication_version_column.sql,
  -- BEFORE UPDATE: NEW.version = OLD.version + 1) bumps version on every UPDATE,
  -- so an UPDATE that matched `version = p_expected_version` modified exactly the
  -- row version p_expected_version. If the image read here carries that version,
  -- it IS the row the UPDATE changed; if not, the UPDATE cannot succeed (it takes
  -- the conflict path, and no audit row is written). The guard after the UPDATE
  -- nulls the image in that impossible case so `old` reads null, never wrong.
  --
  -- Unversioned call (p_expected_version IS NULL): last-write-wins, so a lock-free
  -- read could be stale if another writer commits while the UPDATE waits under
  -- READ COMMITTED. Lock for the read. This path cannot sleep: with no version
  -- predicate the UPDATE misses only when the row is gone, and the late branch
  -- below then finds no row and raises P0002; its pg_sleep sits behind FOUND.
  IF p_expected_version IS NULL THEN
    SELECT to_jsonb(o) INTO v_prior_row
      FROM public.entries o
     WHERE o.id = p_entry_id
       FOR UPDATE;
  ELSE
    SELECT to_jsonb(o) INTO v_prior_row
      FROM public.entries o
     WHERE o.id = p_entry_id;
  END IF;

  -- 8. Apply the update with opt-in optimistic concurrency.
  EXECUTE format(
    'UPDATE public.entries SET %s WHERE id = $1 AND ($2 IS NULL OR version = $2) RETURNING id',
    v_set_clause
  )
  USING p_entry_id, p_expected_version, jsonb_populate_record(NULL::public.entries, v_allowed_fields)
  INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    -- MYK9-740: an identical call that committed while this one waited on the
    -- row lock leaves nothing to conflict with. Same predicate as step 6.
    v_replay_version := public.ringside_replay_applied_version(p_entry_id, v_allowed_fields);
    IF v_replay_version IS NOT NULL THEN
      RETURN v_replay_version;
    END IF;

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

  -- Defensive (see the pre-image comment before step 8): never record an image
  -- that is not the version the UPDATE matched.
  IF p_expected_version IS NOT NULL
     AND (v_prior_row ->> 'version')::integer IS DISTINCT FROM p_expected_version THEN
    v_prior_row := NULL;
  END IF;

  -- 10. MYK9-1754: audit this write, in the same transaction, only now that the
  -- UPDATE really ran. Every early RETURN above (idempotent replay, nothing
  -- writable in the payload) and every RAISE wrote nothing, so they audit nothing.
  -- Both sides pass through the entries row type so timestamps compare by value.
  v_new_row := to_jsonb(jsonb_populate_record(NULL::public.entries, v_allowed_fields));

  SELECT coalesce(
           jsonb_object_agg(k, jsonb_build_object('old', v_prior_row -> k, 'new', v_new_row -> k)),
           '{}'::jsonb
         )
    INTO v_changes
    FROM jsonb_object_keys(v_allowed_fields) AS k
   WHERE (v_prior_row -> k) IS DISTINCT FROM (v_new_row -> k);

  IF v_actor_tier LIKE 'passcode_%' THEN
    v_claim_generation := (SELECT auth.jwt()) -> 'app_metadata' ->> 'passcode_generation';
  END IF;

  INSERT INTO public.entry_score_audit (
    entry_id, class_id, show_id, changes,
    actor_user_id, actor_person_id, actor_display_name, actor_tier,
    passcode_role, passcode_generation, entry_version, client_saved_at
  ) VALUES (
    p_entry_id, v_class_id, v_show_id, v_changes,
    (SELECT auth.uid()),
    v_caller_person_id,
    v_caller_name,
    v_actor_tier,
    CASE WHEN v_actor_tier LIKE 'passcode_%' THEN v_claim_role END,
    v_claim_generation,
    v_new_version,
    p_client_saved_at
  );

  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer, timestamptz) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
