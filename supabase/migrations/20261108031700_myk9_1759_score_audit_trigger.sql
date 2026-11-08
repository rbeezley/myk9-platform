-- MYK9-1759: audit score changes that did not go through ringside_update_entry.
--
-- MYK9-1754 audits every write through ringside_update_entry, from inside the
-- function. Other kinds of write reach the same columns on public.entries. One
-- AFTER UPDATE row trigger now covers all of them (owner decision 2026-11-07;
-- moving secretary edits onto the RPC was rejected because it leaves every future
-- direct-UPDATE path unaudited).
--
-- DESIGN
--   * Trigger entries_score_audit: AFTER UPDATE OF <the scoring columns the RPC
--     may write (its v_scoring_cols)>, with a WHEN guard so it
--     fires only when one of those values really changed. It appends one
--     entry_score_audit row: changes = {col: {old, new}} for the changed columns
--     only, entry_version = NEW.version (after entries_version_increment),
--     client_saved_at = NULL.
--   * No double rows. ringside_update_entry sets the transaction-local setting
--     myk9.score_audit_by_rpc to the entry id right before its UPDATE and clears
--     it right after, and still writes its own richer row (tier, passcode claim,
--     device save time). The trigger skips only when the setting equals NEW.id
--     AND pg_trigger_depth() = 1 (the row the RPC itself updated). Placement
--     recalculations that the UPDATE fans out to OTHER rows run inside an AFTER
--     trigger (depth 2), so they are audited. Because the setting is cleared
--     straight after the UPDATE, any later UPDATE in the same transaction is
--     audited too. A rolled-back savepoint reverts the setting with it.
--   * Actor rules. actor_user_id = auth.uid(). The person and display name are
--     resolved exactly as the RPC does (people.auth_user_id = auth.uid(), never
--     people.id), a snapshot so the record survives a rename.
--       - signed-in, non-anonymous user, trigger depth 1  -> 'manager'
--       - no auth user (cron, service-role edge function, a definer function
--         run by the postgres role), or an anonymous session -> 'system'
--       - pg_trigger_depth() > 1, i.e. the change was made by a function running
--         inside another trigger (the placement recalculation
--         refresh_class_scoring_state, fired by handle_entry_scoring_state_change)
--         -> 'system', even when a signed-in judge's write set it off. The person
--         still appears in actor_user_id/person/name so the cause stays visible.
--     'manager' therefore means "a signed-in person made this write", which is
--     what a direct PostgREST UPDATE under the entries UPDATE policy is. The row
--     does not re-check which RLS arm admitted the user: the policy already did.
--     Placement functions called directly (not from a trigger) by a signed-in
--     user, and trials_auto_complete_stale_classes (a person's RPC, MYK9-1514),
--     record 'manager' with that person: they ARE person-initiated.
--   * entry_score_audit_actor_tier_check gains 'system'.
--   * The trigger function is SECURITY DEFINER with search_path = '' and is not
--     executable by any client role. It writes nothing when show_id or class_id
--     is NULL (the audit columns are NOT NULL, and an audit must never block a
--     score write); the RPC already refuses such entries.
--
-- GAP DISPOSITIONS (MYK9-1759)
--   1. Secretary edits through entry management (mixed-column direct UPDATE, e.g.
--      reverting a scored entry's status): audited, as 'manager' with the
--      secretary's name, by this trigger.
--   2. System writes: placement recalculation (final_placement) and cascades from
--      handle_entry_scoring_state_change are audited as 'system' (depth rule
--      above). trials_auto_complete_stale_classes is audited as 'manager' (it is
--      a judge/secretary RPC). Cron/service-role writes are 'system'.
--   3. emergency_packet_handler: there is no function of that name. The
--      emergency packet is built by the edge functions generate-trial-packet and
--      deliver-trial-packet through the read-only public.emergency_packet_input
--      (20260922220537). They write only trial_packet_snapshots, email_log and
--      packet claim rows, never entries. Out of scope: no score column is written.
--
-- Function body of ringside_update_entry copied from
-- 20261108014700_myk9_1754_entry_score_audit.sql, the LATEST migration defining it
-- (grep -l "CREATE OR REPLACE FUNCTION public.ringside_update_entry"
-- supabase/migrations/). Only the two set_config lines are new. Signature and
-- grants are unchanged and re-issued as 1754 left them.
--
-- Other entries columns deliberately NOT audited: placement_tie and
-- placement_tiebreak move together with final_placement (which is audited), and
-- results_verified_at/_by/_fingerprint record a secretary's sign-off, not a score
-- value. 'manager' means "a signed-in user made a direct write at trigger depth
-- 1"; in practice that is secretaries and club admins editing through entry
-- management, since judges and stewards write through the RPC (their own tiers).
--
-- Check-in / ring-flow columns (run_order, check_in_status, is_in_ring,
-- ring_entry_time, ring_exit_time) are DELIBERATELY excluded: this task is about
-- score changes, and auditing every check-in, self check-in and run-order drag
-- would flood the score history with non-score rows. The RPC still audits
-- whatever it writes, including those columns, unchanged.

BEGIN;

ALTER TABLE public.entry_score_audit
  DROP CONSTRAINT entry_score_audit_actor_tier_check;
ALTER TABLE public.entry_score_audit
  ADD CONSTRAINT entry_score_audit_actor_tier_check CHECK (
    actor_tier IN (
      'manager', 'assigned_judge', 'steward',
      'passcode_judge', 'passcode_admin', 'passcode_steward',
      'system'
    )
  );

CREATE OR REPLACE FUNCTION public.entries_score_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_is_anonymous boolean;
  v_person_id uuid;
  v_name text;
  v_tier text;
  v_old jsonb;
  v_new jsonb;
  v_changes jsonb;
  v_cols constant text[] := ARRAY[
    'is_scored', 'result_status', 'search_time_seconds', 'area1_time_seconds', 'area2_time_seconds', 'area3_time_seconds', 'area4_time_seconds', 'total_correct_finds', 'total_incorrect_finds', 'total_faults', 'no_finish_count', 'area1_correct', 'area1_incorrect', 'area1_faults', 'area2_correct', 'area2_incorrect', 'area2_faults', 'area3_correct', 'area3_incorrect', 'area3_faults', 'total_score', 'points_earned', 'points_possible', 'bonus_points', 'penalty_points', 'time_over_limit', 'time_limit_exceeded_seconds', 'final_placement', 'judge_notes', 'judge_signature', 'judge_signature_timestamp', 'disqualification_reason', 'has_video_review', 'video_review_notes', 'scoring_started_at', 'scoring_completed_at'
  ];
BEGIN
  -- The RPC's own row (depth 1 = this trigger is the outermost one) is audited
  -- by the RPC with richer detail.
  IF pg_trigger_depth() = 1
     AND current_setting('myk9.score_audit_by_rpc', true) = NEW.id::text THEN
    RETURN NULL;
  END IF;

  IF NEW.show_id IS NULL OR NEW.class_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  SELECT coalesce(
           jsonb_object_agg(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k)),
           '{}'::jsonb
         )
    INTO v_changes
    FROM unnest(v_cols) AS k
   WHERE (v_old -> k) IS DISTINCT FROM (v_new -> k);

  IF v_changes = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  v_uid := (SELECT auth.uid());
  v_is_anonymous := coalesce(((SELECT auth.jwt()) ->> 'is_anonymous')::boolean, false);

  -- Same resolution as ringside_update_entry (never people.id = auth.uid()).
  IF v_uid IS NOT NULL THEN
    SELECT p.id, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
      INTO v_person_id, v_name
      FROM public.people p
     WHERE p.auth_user_id = v_uid
     LIMIT 1;
  END IF;

  v_tier := CASE
    WHEN v_uid IS NULL OR v_is_anonymous OR pg_trigger_depth() > 1 THEN 'system'
    ELSE 'manager'
  END;

  INSERT INTO public.entry_score_audit (
    entry_id, class_id, show_id, changes,
    actor_user_id, actor_person_id, actor_display_name, actor_tier,
    entry_version, client_saved_at
  ) VALUES (
    NEW.id, NEW.class_id, NEW.show_id, v_changes,
    v_uid, v_person_id, v_name, v_tier,
    NEW.version, NULL
  );

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.entries_score_audit_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entries_score_audit_trigger() FROM anon;
REVOKE ALL ON FUNCTION public.entries_score_audit_trigger() FROM authenticated;

DROP TRIGGER IF EXISTS entries_score_audit ON public.entries;
CREATE TRIGGER entries_score_audit
  AFTER UPDATE OF
    is_scored, result_status, search_time_seconds, area1_time_seconds, area2_time_seconds, area3_time_seconds, area4_time_seconds, total_correct_finds, total_incorrect_finds, total_faults, no_finish_count, area1_correct, area1_incorrect, area1_faults, area2_correct, area2_incorrect, area2_faults, area3_correct, area3_incorrect, area3_faults, total_score, points_earned, points_possible, bonus_points, penalty_points, time_over_limit, time_limit_exceeded_seconds, final_placement, judge_notes, judge_signature, judge_signature_timestamp, disqualification_reason, has_video_review, video_review_notes, scoring_started_at, scoring_completed_at
  ON public.entries
  FOR EACH ROW
  WHEN (
    (OLD.is_scored, OLD.result_status, OLD.search_time_seconds, OLD.area1_time_seconds, OLD.area2_time_seconds, OLD.area3_time_seconds, OLD.area4_time_seconds, OLD.total_correct_finds, OLD.total_incorrect_finds, OLD.total_faults, OLD.no_finish_count, OLD.area1_correct, OLD.area1_incorrect, OLD.area1_faults, OLD.area2_correct, OLD.area2_incorrect, OLD.area2_faults, OLD.area3_correct, OLD.area3_incorrect, OLD.area3_faults, OLD.total_score, OLD.points_earned, OLD.points_possible, OLD.bonus_points, OLD.penalty_points, OLD.time_over_limit, OLD.time_limit_exceeded_seconds, OLD.final_placement, OLD.judge_notes, OLD.judge_signature, OLD.judge_signature_timestamp, OLD.disqualification_reason, OLD.has_video_review, OLD.video_review_notes, OLD.scoring_started_at, OLD.scoring_completed_at)
    IS DISTINCT FROM
    (NEW.is_scored, NEW.result_status, NEW.search_time_seconds, NEW.area1_time_seconds, NEW.area2_time_seconds, NEW.area3_time_seconds, NEW.area4_time_seconds, NEW.total_correct_finds, NEW.total_incorrect_finds, NEW.total_faults, NEW.no_finish_count, NEW.area1_correct, NEW.area1_incorrect, NEW.area1_faults, NEW.area2_correct, NEW.area2_incorrect, NEW.area2_faults, NEW.area3_correct, NEW.area3_incorrect, NEW.area3_faults, NEW.total_score, NEW.points_earned, NEW.points_possible, NEW.bonus_points, NEW.penalty_points, NEW.time_over_limit, NEW.time_limit_exceeded_seconds, NEW.final_placement, NEW.judge_notes, NEW.judge_signature, NEW.judge_signature_timestamp, NEW.disqualification_reason, NEW.has_video_review, NEW.video_review_notes, NEW.scoring_started_at, NEW.scoring_completed_at)
  )
  EXECUTE FUNCTION public.entries_score_audit_trigger();

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

  -- MYK9-1759: tell the entries audit trigger this row's UPDATE is audited below
  -- (step 10). The value is the entry id, transaction-local, and the trigger only
  -- honors it for this row at trigger depth 1, so placement recalculations the
  -- UPDATE fans out to other rows are still audited by the trigger.
  PERFORM set_config('myk9.score_audit_by_rpc', p_entry_id::text, true);

  -- 8. Apply the update with opt-in optimistic concurrency.
  EXECUTE format(
    'UPDATE public.entries SET %s WHERE id = $1 AND ($2 IS NULL OR version = $2) RETURNING id',
    v_set_clause
  )
  USING p_entry_id, p_expected_version, jsonb_populate_record(NULL::public.entries, v_allowed_fields)
  INTO v_updated_id;

  -- MYK9-1759: close the window straight away, so a later UPDATE in this
  -- transaction (any entry, this one included) is audited by the trigger.
  PERFORM set_config('myk9.score_audit_by_rpc', '', true);

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
