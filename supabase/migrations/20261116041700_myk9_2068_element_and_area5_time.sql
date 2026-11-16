-- MYK9-2068: store the UKC element time and the AKC Nationals Area 5 time.
--
-- The UKC Nosework sheet sent an element time that no column held, and the
-- Nationals sheet stored areas 1 to 4 only (Area 5 survived only inside
-- search_time_seconds). Two nullable NUMERIC columns beside area1..4: NULL means
-- "not recorded" (no default, so every other sport and every older row stays NULL).
--
-- Grants: area1..area4_time_seconds carry NO column-level grants (verified by
-- grep of supabase/migrations for column-list GRANT/REVOKE on entries time
-- columns), so the new columns inherit the table-level entries grants like them.
--
-- Every object that lists the ringside score column set gets the two columns, each
-- copied from its LATEST defining migration:
--   * public.entries_score_audit_trigger + trigger entries_score_audit
--       (20261108031700_myk9_1759_score_audit_trigger.sql)
--   * public.ringside_update_entry, the write allowlist
--       (20261113224300_myk9_1950_per_judge_passcodes.sql)
--   * private.entries_refuse_cancelled_class_writes
--       (20261113163700_myk9_1863_refuse_cancelled_class_writes.sql)
--   * public.entries_block_score_when_awaiting_registration
--       (20261014214300_myk9_1162_held_entries.sql)
-- Also rebuilt: both entry result views (the replica's read path), which gate the
-- new columns on can_view_scores like area4_time_seconds. Not touched:
-- ringside_complete_stale_class (it marks unscored dogs absent; the new columns
-- are already NULL on those rows).

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS area5_time_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS element_time_seconds NUMERIC;

COMMENT ON COLUMN public.entries.area5_time_seconds IS
  'AKC Nationals: seconds spent in search area 5 (areas 1 to 4 are area1..area4_time_seconds). NULL when not recorded.';
COMMENT ON COLUMN public.entries.element_time_seconds IS
  'UKC Nosework: seconds on the element search. NULL when not recorded.';

-- entries_score_audit_trigger and its trigger
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
    'is_scored', 'result_status', 'search_time_seconds', 'area1_time_seconds', 'area2_time_seconds', 'area3_time_seconds', 'area4_time_seconds', 'area5_time_seconds', 'element_time_seconds', 'total_correct_finds', 'total_incorrect_finds', 'total_faults', 'no_finish_count', 'area1_correct', 'area1_incorrect', 'area1_faults', 'area2_correct', 'area2_incorrect', 'area2_faults', 'area3_correct', 'area3_incorrect', 'area3_faults', 'total_score', 'points_earned', 'points_possible', 'bonus_points', 'penalty_points', 'time_over_limit', 'time_limit_exceeded_seconds', 'final_placement', 'judge_notes', 'judge_signature', 'judge_signature_timestamp', 'disqualification_reason', 'has_video_review', 'video_review_notes', 'scoring_started_at', 'scoring_completed_at'
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
    is_scored, result_status, search_time_seconds, area1_time_seconds, area2_time_seconds, area3_time_seconds, area4_time_seconds, area5_time_seconds, element_time_seconds, total_correct_finds, total_incorrect_finds, total_faults, no_finish_count, area1_correct, area1_incorrect, area1_faults, area2_correct, area2_incorrect, area2_faults, area3_correct, area3_incorrect, area3_faults, total_score, points_earned, points_possible, bonus_points, penalty_points, time_over_limit, time_limit_exceeded_seconds, final_placement, judge_notes, judge_signature, judge_signature_timestamp, disqualification_reason, has_video_review, video_review_notes, scoring_started_at, scoring_completed_at
  ON public.entries
  FOR EACH ROW
  WHEN (
    (OLD.is_scored, OLD.result_status, OLD.search_time_seconds, OLD.area1_time_seconds, OLD.area2_time_seconds, OLD.area3_time_seconds, OLD.area4_time_seconds, OLD.area5_time_seconds, OLD.element_time_seconds, OLD.total_correct_finds, OLD.total_incorrect_finds, OLD.total_faults, OLD.no_finish_count, OLD.area1_correct, OLD.area1_incorrect, OLD.area1_faults, OLD.area2_correct, OLD.area2_incorrect, OLD.area2_faults, OLD.area3_correct, OLD.area3_incorrect, OLD.area3_faults, OLD.total_score, OLD.points_earned, OLD.points_possible, OLD.bonus_points, OLD.penalty_points, OLD.time_over_limit, OLD.time_limit_exceeded_seconds, OLD.final_placement, OLD.judge_notes, OLD.judge_signature, OLD.judge_signature_timestamp, OLD.disqualification_reason, OLD.has_video_review, OLD.video_review_notes, OLD.scoring_started_at, OLD.scoring_completed_at)
    IS DISTINCT FROM
    (NEW.is_scored, NEW.result_status, NEW.search_time_seconds, NEW.area1_time_seconds, NEW.area2_time_seconds, NEW.area3_time_seconds, NEW.area4_time_seconds, NEW.area5_time_seconds, NEW.element_time_seconds, NEW.total_correct_finds, NEW.total_incorrect_finds, NEW.total_faults, NEW.no_finish_count, NEW.area1_correct, NEW.area1_incorrect, NEW.area1_faults, NEW.area2_correct, NEW.area2_incorrect, NEW.area2_faults, NEW.area3_correct, NEW.area3_incorrect, NEW.area3_faults, NEW.total_score, NEW.points_earned, NEW.points_possible, NEW.bonus_points, NEW.penalty_points, NEW.time_over_limit, NEW.time_limit_exceeded_seconds, NEW.final_placement, NEW.judge_notes, NEW.judge_signature, NEW.judge_signature_timestamp, NEW.disqualification_reason, NEW.has_video_review, NEW.video_review_notes, NEW.scoring_started_at, NEW.scoring_completed_at)
  )
  EXECUTE FUNCTION public.entries_score_audit_trigger();

-- ringside_update_entry
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
  v_passcode_id uuid;
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
  v_claim_person_id uuid;
  v_judge_claim_out_of_scope boolean := false;
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
    'area1_time_seconds', 'area2_time_seconds', 'area3_time_seconds', 'area4_time_seconds', 'area5_time_seconds', 'element_time_seconds',
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
  v_claim_person_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_person_id'), '')::uuid;
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

  -- MYK9-1950: a per-judge passcode scores only the classes assigned to that judge, checked LIVE
  -- against judge_assignments at write time, so a mid-show judge change needs no new code. The
  -- admin code keeps scoring any class. A judge claim with no person id is the old show-wide
  -- shape: the generation check above already refused it as revoked.
  IF v_has_judge_claim AND v_claim_role = 'judge'
     AND NOT public._ringside_judge_in_scope(v_class_id, v_claim_person_id) THEN
    v_has_judge_claim := false;
    v_judge_claim_out_of_scope := true;
  END IF;

  -- The refusal is distinct (RS403) and names the class's judge so the device can say who to see.
  -- A caller who is also a manager, assigned judge or steward never reaches it.
  IF v_judge_claim_out_of_scope
     AND NOT (v_is_manager OR v_is_assigned_judge OR v_is_steward) THEN
    PERFORM public._ringside_raise_class_out_of_scope(v_class_id);
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
    -- MYK9-1950: name the code (and the judge it belongs to) that authorized the write.
    SELECT sp.id INTO v_passcode_id
      FROM public.show_passcodes sp
     WHERE sp.show_id = v_show_id
       AND sp.role = v_claim_role
       AND sp.person_id IS NOT DISTINCT FROM v_claim_person_id
     LIMIT 1;
  END IF;

  INSERT INTO public.entry_score_audit (
    entry_id, class_id, show_id, changes,
    actor_user_id, actor_person_id, actor_display_name, actor_tier,
    passcode_role, passcode_generation, passcode_id, passcode_person_id,
    entry_version, client_saved_at
  ) VALUES (
    p_entry_id, v_class_id, v_show_id, v_changes,
    (SELECT auth.uid()),
    v_caller_person_id,
    v_caller_name,
    v_actor_tier,
    CASE WHEN v_actor_tier LIKE 'passcode_%' THEN v_claim_role END,
    v_claim_generation,
    v_passcode_id,
    CASE WHEN v_actor_tier LIKE 'passcode_%' THEN v_claim_person_id END,
    v_new_version,
    p_client_saved_at
  );

  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer, timestamptz) TO authenticated;

-- entries_refuse_cancelled_class_writes
CREATE OR REPLACE FUNCTION private.entries_refuse_cancelled_class_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- The result columns of entries_block_score_when_awaiting_registration
  -- (20261014214300); keep the two lists in sync.
  v_score_cols constant text[] := ARRAY[
    'is_scored', 'result_status',
    'search_time_seconds',
    'area1_time_seconds', 'area2_time_seconds', 'area3_time_seconds', 'area4_time_seconds', 'area5_time_seconds', 'element_time_seconds',
    'total_correct_finds', 'total_incorrect_finds', 'total_faults', 'no_finish_count',
    'area1_correct', 'area1_incorrect', 'area1_faults',
    'area2_correct', 'area2_incorrect', 'area2_faults',
    'area3_correct', 'area3_incorrect', 'area3_faults',
    'total_score', 'points_earned', 'points_possible',
    'bonus_points', 'penalty_points',
    'time_over_limit', 'time_limit_exceeded_seconds',
    'disqualification_reason',
    'scoring_started_at', 'scoring_completed_at'
  ];
  v_new jsonb;
  v_old jsonb;
  v_score_changed boolean;
  v_records_value boolean;
  v_reset boolean;
BEGIN
  -- Cheapest gate first: one primary-key probe. Nearly every entry write is in a
  -- running class and leaves here without building the row's jsonb.
  IF NOT EXISTS (
    SELECT 1 FROM public.classes c
     WHERE c.id = NEW.class_id AND c.status = 'cancelled'
  ) THEN
    RETURN NEW;
  END IF;

  -- A reset is defined by where the entry ENDS, not by which columns the payload
  -- names (the app's reset clears only some score columns): the entry ends
  -- unscored, and no score column changes to a value that records something.
  -- So a zero-valued correction on a scored entry is not a reset (it stays
  -- scored), and a fault written to an unscored entry is not one either.
  v_new := to_jsonb(NEW);
  v_old := to_jsonb(OLD);
  SELECT bool_or((v_new -> k) IS DISTINCT FROM (v_old -> k)),
         bool_or((v_new -> k) IS DISTINCT FROM (v_old -> k)
                 AND (v_new -> k) IS NOT NULL
                 AND (v_new -> k) NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '"pending"'::jsonb))
    INTO v_score_changed, v_records_value
    FROM unnest(v_score_cols) AS k;

  v_reset := v_score_changed IS TRUE
    AND v_records_value IS NOT TRUE
    AND NEW.is_scored IS NOT TRUE
    AND coalesce(NEW.result_status, 'pending') = 'pending'
    AND coalesce(NEW.search_time_seconds, 0) = 0;

  IF (v_score_changed IS TRUE AND NOT v_reset)
     -- A check-in other than a reset to 'no-status' or a Pull. The app's score reset
     -- moves a completed dog back to 'checked-in' in the same payload
     -- (scoreResetCheckInFields), so that move rides along with a reset.
     OR (NEW.check_in_status IS DISTINCT FROM OLD.check_in_status
         AND NEW.check_in_status IS DISTINCT FROM 'no-status'
         AND NEW.check_in_status IS DISTINCT FROM 'pulled'
         AND NOT (v_reset AND OLD.check_in_status = 'completed'
                  AND NEW.check_in_status = 'checked-in'))
     OR (NEW.is_in_ring IS TRUE AND OLD.is_in_ring IS NOT TRUE) THEN
    RAISE EXCEPTION 'This class is cancelled. Scores and check-ins are closed.'
      USING ERRCODE = '23514', HINT = 'class_cancelled';
  END IF;
  RETURN NEW;
END;
$function$;

-- entries_block_score_when_awaiting_registration
CREATE OR REPLACE FUNCTION public.entries_block_score_when_awaiting_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  -- Every column that carries a result: ringside_update_entry's v_scoring_cols
  -- (20260925143700) minus what is not a score (judge notes and signature,
  -- video review, and final_placement, which the server's placement pass
  -- writes). Watching the whole set, not a few of its members, is what keeps a
  -- fault-only or area-time correction from slipping past.
  v_score_cols constant text[] := ARRAY[
    'is_scored', 'result_status',
    'search_time_seconds',
    'area1_time_seconds', 'area2_time_seconds', 'area3_time_seconds', 'area4_time_seconds', 'area5_time_seconds', 'element_time_seconds',
    'total_correct_finds', 'total_incorrect_finds', 'total_faults', 'no_finish_count',
    'area1_correct', 'area1_incorrect', 'area1_faults',
    'area2_correct', 'area2_incorrect', 'area2_faults',
    'area3_correct', 'area3_incorrect', 'area3_faults',
    'total_score', 'points_earned', 'points_possible',
    'bonus_points', 'penalty_points',
    'time_over_limit', 'time_limit_exceeded_seconds',
    'disqualification_reason',
    'scoring_started_at', 'scoring_completed_at'
  ];
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := to_jsonb(OLD);
  v_changed boolean;
BEGIN
  SELECT bool_or((v_new -> k) IS DISTINCT FROM (v_old -> k))
    INTO v_changed
    FROM unnest(v_score_cols) AS k;
  IF v_changed IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- A reset clears a result rather than recording one: not scored, no result,
  -- no time, and no new scoring start. Allowed even when the entry became held after it
  -- was scored, so a judge can take an old result off.
  IF NEW.is_scored IS NOT TRUE
     AND (NEW.result_status IS NULL OR NEW.result_status = 'pending')
     AND coalesce(NEW.search_time_seconds, 0) = 0
     AND (NEW.scoring_started_at IS NULL
          OR NEW.scoring_started_at IS NOT DISTINCT FROM OLD.scoring_started_at) THEN
    RETURN NEW;
  END IF;

  -- Recording a dog ABSENT needs no registration number: the live scoresheet's
  -- Absent chip writes a zero time and no scoring start. Anything timed, and
  -- every other result (qualified, NQ, excused, disqualified), stays locked.
  IF NEW.result_status = 'absent'
     AND coalesce(NEW.search_time_seconds, 0) = 0
     AND NEW.scoring_started_at IS NOT DISTINCT FROM OLD.scoring_started_at THEN
    RETURN NEW;
  END IF;

  IF public.entry_awaiting_registration_number(
       NEW.dog_id, NEW.class_id, NEW.entry_status, NEW.deleted_at) THEN
    RAISE EXCEPTION 'Registration number needed. See the secretary.'
      USING ERRCODE = '23514', HINT = 'registration_number_needed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.entries_block_score_when_awaiting_registration()
  FROM PUBLIC, anon, authenticated;

-- No SELECT is granted on the new columns: entries keeps table-level SELECT revoked
-- for authenticated and anon, and both read the time columns only through the
-- owner-run entry result views below. Mirror the other server-side columns.
REVOKE ALL (area5_time_seconds, element_time_seconds) ON public.entries FROM anon;

-- ---------------------------------------------------------------------------
-- The two entry read views carry the new columns, so the replica (and every
-- reader of the score) sees them. Copied verbatim from
-- 20261108033700_myk9_1757_pull_source.sql (the latest definition of both) with the
-- two columns appended LAST; security_invoker = false carried inline
-- (CREATE OR REPLACE VIEW resets reloptions); ACLs are
-- preserved by CREATE OR REPLACE. The inner view comment is restated with one added sentence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_authenticated_entry_results
  WITH (security_invoker = false)
AS
WITH caller_context AS MATERIALIZED (
  -- MYK9-1757: explicit columns (the view lint bans SELECT * in a new view migration); these are
  -- the 13 columns the function returns (20260830240000, its latest definition).
  SELECT
    c.auth_user_id,
    c.person_id,
    c.is_site_admin,
    c.has_manager_role,
    c.managed_club_ids,
    c.managed_show_ids,
    c.assigned_class_ids,
    c.steward_show_ids,
    c.steward_club_ids,
    c.claim_kind,
    c.claim_show_id,
    c.claim_role,
    c.claim_generation_current
  FROM private.entry_results_caller_context() AS c
),
-- MYK9-1369: the shows where the caller has a live, non-withdrawn entry as
-- handler, dog owner or dog co-owner. Depends on caller_context only, and
-- MATERIALIZED guarantees one evaluation per query. Three UNION ALL arms, one
-- per role, so each is an index lookup on the caller's own rows
-- (entries_active_handler_id_idx; dogs_owner_id_idx / dogs_co_owner_id_idx ->
-- entries_active_dog_id_idx) rather than an OR across the join, which would
-- scan every live entry on the platform. The union is the same set the old
-- `handler OR own_dog.owner OR own_dog.co_owner` over entries LEFT JOIN dogs
-- admitted: an entry with no dog row can match only through its handler arm.
exhibitor_shows AS MATERIALIZED (
  SELECT COALESCE(
    (
      SELECT array_agg(DISTINCT own.show_id)
      FROM (
        SELECT own_e.show_id
        FROM public.entries own_e
        WHERE own_e.handler_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        UNION ALL
        SELECT own_e.show_id
        FROM public.dogs own_dog
        JOIN public.entries own_e ON own_e.dog_id = own_dog.id
        WHERE own_dog.owner_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        UNION ALL
        SELECT own_e.show_id
        FROM public.dogs own_dog
        JOIN public.entries own_e ON own_e.dog_id = own_dog.id
        WHERE own_dog.co_owner_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
      ) own
    ),
    ARRAY[]::uuid[]
  ) AS show_ids
  FROM caller_context ctx0
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
    class_vis.updated_at,
    -- MYK9-969: every input to the privacy mask moves the row (see the
    -- header's input table): tied people's profiles and people rows, the
    -- dog's ownership, and the one-time epoch of this migration.
    consent.profiles_updated_at,
    d.updated_at,
    (SELECT max(epoch.updated_at) FROM private.results_privacy_epoch epoch),
    -- MYK9-1476: the caller's own role set is an input to the mask too
    -- (can_view_scores, steward, club-manager arms read user_roles). A grant,
    -- revoke, deactivation, hard delete or expiry moves every row THIS caller
    -- reads and no other caller's; see private.entry_results_caller_access_epoch().
    (SELECT private.entry_results_caller_access_epoch()),
    -- MYK9-1162: changing the trial's registry flips awaiting_registration_number
    -- for every entry in it, so the trial moves the row for the replication
    -- cursor (updated_at, id). Registration changes do not appear here: a
    -- DELETE cannot be seen by a max(updated_at), so
    -- trg_dog_registrations_touch_entries bumps the dog's entries instead.
    held_trial.updated_at
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
  CASE WHEN access.can_view_admin THEN e.confirmation_email_sent_at END AS confirmation_email_sent_at,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_message_id END AS confirmation_email_message_id,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_status END AS confirmation_email_status,
  e.version,
  CASE
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'qualified'  THEN 'Q'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'nq'         THEN 'NQ'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'absent'     THEN 'ABS'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'excused'    THEN 'EX'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'disqualified' THEN 'DQ'
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
  access.is_own_entry AS is_own_entry,
  -- Secretary payment bookkeeping. Masked by `can_view_admin` exactly like the
  -- other payment columns above; appended at the END of the select list because
  -- CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.payment_reference END AS payment_reference,
  CASE WHEN access.can_view_admin THEN e.payment_received_on END AS payment_received_on,
  CASE WHEN access.can_view_admin THEN e.payment_notes END AS payment_notes,
  -- MYK9-632: the ENUMERATED withdrawal reason, beside the free-text
  -- `withdrawal_reason` above and masked by the same `can_view_admin` (a show
  -- manager, or the entry's own exhibitor). Appended at the END of the select
  -- list because CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.withdrawal_reason_code END AS withdrawal_reason_code,
  -- MYK9-639: the supersession link. Structural, not financial, so it is NOT
  -- masked by can_view_admin -- it is the same kind of fact as e.class_id, and
  -- anyone this view already admits to the row may know which entry this one
  -- replaced. Appended at the END of the select list because CREATE OR REPLACE
  -- VIEW may only add columns there.
  e.moved_from_entry_id,
  -- MYK9-659: the ORDER's human reference. `enrollments.confirmation_number`
  -- is NOT NULL and defaulted from generate_confirmation_number(), and
  -- submit_show_entries always writes entries.registration_id, so every
  -- order the app creates has one. It reached the client only through the
  -- PostgREST `registration:registration_id(...)` embed, which the offline
  -- replica path cannot make -- so the same order printed `Confirmation #:
  -- MK9-000146` online and a raw enrollment UUID offline.
  --
  -- NOT the sibling of `payment_reference` above. That is an `entries` column,
  -- also reachable under `entries` RLS; this is a CROSS-TABLE column from
  -- `public.enrollments`, reached by an owner-run LEFT JOIN that evaluates no
  -- `enrollments` policy, so `access.can_view_admin` is its ONLY guard -- and
  -- a different predicate from `enrollments_select`, which matches the
  -- enrollment's own handler_id. Deliberate: the order reference belongs to
  -- whoever the ENTRY belongs to, so the entry's handler or the dog's owner
  -- sees the reference of the order their entry is on, even when another
  -- person placed it. Both client read paths apply that one rule.
  --
  -- Appended at the END of the select list because CREATE OR REPLACE VIEW may
  -- only add columns there.
  CASE WHEN access.can_view_admin THEN en.confirmation_number END AS registration_confirmation_number,
  -- MYK9-969: TRUE when this row's results are private and the caller is
  -- neither show staff nor a person tied to the entry, so every result column
  -- above arrived NULL for that reason (not because results are unreleased).
  -- Appended at the END: CREATE OR REPLACE VIEW may only add columns there.
  privacy.masked AS results_private,
  -- MYK9-1162: TRUE when this live entry's dog has no registration number for
  -- the trial's registry (a held entry). Computed here, server-side, by the one
  -- predicate public.entry_awaiting_registration_number() so a ringside device
  -- that cannot read dog_registrations (RLS, passcode sessions) still knows.
  -- Not masked: it names no registration data. Appended at the END because
  -- CREATE OR REPLACE VIEW may only add columns there.
  public.entry_awaiting_registration_number(e.dog_id, e.class_id, e.entry_status, e.deleted_at) AS awaiting_registration_number,
  -- MYK9-1473: the tie marker and the secretary's recorded order, masked
  -- EXACTLY like final_placement (the ranking they explain): visible to the
  -- people who can see scores, and to everyone else only when the placement is
  -- visible to them. Appended at the END because CREATE OR REPLACE VIEW may
  -- only add columns there.
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.placement_tie END AS placement_tie,
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.placement_tiebreak END AS placement_tiebreak,
  -- MYK9-1637: masked like payment_status and refund_amount. Appended at the END
  -- because CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.card_paid END AS card_paid,
  -- MYK9-1757: WHO flagged a pull ('exhibitor' | 'staff'), stamped by the server and NOT masked
  -- (like check_in_status it names no money or result). Appended at the END because CREATE OR
  -- REPLACE VIEW may only add columns there.
  e.check_in_pulled_by,
  -- MYK9-2068: Nationals' Area 5 time and UKC's element time, gated exactly like
  -- area4_time_seconds above. Appended at the END because CREATE OR REPLACE VIEW
  -- may only add columns there.
  CASE WHEN access.can_view_scores THEN e.area5_time_seconds END AS area5_time_seconds,
  CASE WHEN access.can_view_scores THEN e.element_time_seconds END AS element_time_seconds
FROM public.entries e
LEFT JOIN public.enrollments en ON en.id = e.registration_id
LEFT JOIN public.dogs d ON d.id = e.dog_id
LEFT JOIN public.classes c ON c.id = e.class_id
LEFT JOIN public.trials held_trial ON held_trial.id = c.trial_id
LEFT JOIN public.shows sh ON sh.id = e.show_id
LEFT JOIN public.show_visibility_settings show_vis ON show_vis.show_id = e.show_id
LEFT JOIN public.trial_visibility_overrides trial_vis ON trial_vis.trial_id = c.trial_id
LEFT JOIN public.class_visibility_overrides class_vis ON class_vis.class_id = e.class_id
CROSS JOIN caller_context ctx
CROSS JOIN exhibitor_shows
LEFT JOIN private.class_result_visibility cvr ON cvr.class_id = e.class_id
-- MYK9-126: `vis` keeps its four column names, so every downstream reference
-- above is byte-identical to 20260902130000. The COALESCE reproduces the
-- function's fail-closed RETURN for an unknown or trial-less class, which a
-- LEFT JOIN would otherwise surface as NULL.
CROSS JOIN LATERAL (
  SELECT
    COALESCE(cvr.placement_visible, false)     AS placement_visible,
    COALESCE(cvr.qualification_visible, false) AS qualification_visible,
    COALESCE(cvr.time_visible, false)          AS time_visible,
    COALESCE(cvr.faults_visible, false)        AS faults_visible
) AS cascade_vis
CROSS JOIN LATERAL (
  SELECT
    (
      sh.id IS NOT NULL
      AND (
        -- MYK9-329: a club-less show is site-admin only. The former arm that
        -- admitted any holder of a manager role when the show had no club handed every
        -- club admin and secretary on the platform can_manage (and therefore
        -- can_view_admin: payment_status, entry_fee, judge_notes, ...) on any
        -- show with no club. MYK9-258 (20260828230000) removed that semantics
        -- from can_manage_show / manageable_show_ids / get_entries_for_export;
        -- this view was re-emitted with the old arm and left behind. Parity
        -- with can_manage_show() is restored here.
        ctx.is_site_admin
        OR sh.club_id = ANY(ctx.managed_club_ids)
        OR e.show_id = ANY(ctx.managed_show_ids)
      )
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
    COALESCE(e.show_id = ANY(exhibitor_shows.show_ids), false) AS is_show_exhibitor,
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
-- MYK9-969: results privacy. An entry's results are PUBLIC only when the show
-- is not private AND every person tied to the entry (the dog's owner and
-- co-owner, the entry's handler) has opted in on their own account. Most
-- private wins; an entry with no tied person, or a tied person with no
-- account, stays private (nobody opted in).
--
-- The opt-in is read through the person's OWN account: people.auth_user_id ->
-- exhibitor_profiles.auth_user_id (unique on both sides). It is never read via
-- exhibitor_profiles.person_id, which the row's own user may rewrite under the
-- self-only UPDATE policy -- keying on it would let anyone opt a stranger in.
CROSS JOIN LATERAL (
  SELECT
    bool_and(COALESCE(tep.results_public, false)) AS all_opted_in,
    -- people.updated_at too: relinking an account changes WHICH profile
    -- counts, and a deleted profile touches its person (trigger above).
    max(GREATEST(tep.updated_at, tp.updated_at)) AS profiles_updated_at
  FROM unnest(ARRAY[d.owner_id, d.co_owner_id, e.handler_id]) AS tied(person_id)
  LEFT JOIN public.people tp ON tp.id = tied.person_id
  LEFT JOIN public.exhibitor_profiles tep ON tep.auth_user_id = tp.auth_user_id
  WHERE tied.person_id IS NOT NULL
) AS consent
CROSS JOIN LATERAL (
  SELECT
    (
      (COALESCE(show_vis.results_private, false) OR consent.all_opted_in IS NOT TRUE)
      -- COALESCE: the claim arms are NULL (not false) for a caller with no
      -- ringside claim, and a NULL here would leave results_private NULL.
      AND NOT COALESCE(
        -- Show staff see every result: manager, the class's judge, a steward,
        -- and a current ringside judge/steward/admin passcode session.
        access.can_view_scores
        OR access.is_show_steward
        OR access.is_ringside_claim
        -- The people tied to the entry see their own results.
        OR access.is_own_entry
        OR (ctx.person_id IS NOT NULL AND ctx.person_id = d.co_owner_id),
        false
      )
    ) AS masked
) AS privacy
-- The cascade-visible flags, with privacy applied on top. Every result column
-- above reads `vis`, so masking here leaves their expressions byte-identical.
-- can_view_scores already short-circuits those columns for staff.
CROSS JOIN LATERAL (
  SELECT
    cascade_vis.placement_visible     AND NOT privacy.masked AS placement_visible,
    cascade_vis.qualification_visible AND NOT privacy.masked AS qualification_visible,
    cascade_vis.time_visible          AND NOT privacy.masked AS time_visible,
    cascade_vis.faults_visible        AND NOT privacy.masked AS faults_visible
) AS vis
WHERE (e.deleted_at IS NULL OR access.is_own_entry)
  AND (
    access.can_manage
    OR access.is_assigned_judge
    OR access.is_show_steward
    OR access.is_own_entry
    OR access.is_show_exhibitor
    OR access.is_ringside_claim
  );


COMMENT ON VIEW public.view_authenticated_entry_results IS
  'Authenticated entry results. Scored columns stay gated by can_view_scores and '
  'payment columns by can_view_admin, which now also masks the enumerated '
  'withdrawal_reason_code beside the free-text withdrawal_reason (MYK9-632). A '
  'club-less show is manageable by site admins only (MYK9-258 / MYK9-329). Class '
  'result visibility resolves once per class via private.class_result_visibility '
  '(MYK9-126). moved_from_entry_id (MYK9-639) is unmasked: it is structural provenance, like class_id. registration_confirmation_number (MYK9-659) is appended after it and is NOT a sibling of payment_reference: it is a cross-table column from public.enrollments, reached by an owner-run LEFT JOIN that evaluates no enrollments policy, so can_view_admin is its ONLY guard -- a different predicate from enrollments_select, which matches the enrollment''s own handler_id. That is deliberate: the order reference belongs to whoever the ENTRY belongs to, so the entry''s handler or the dog''s owner sees the reference of the order their entry is on, even when another person placed it, and both client read paths apply that one rule. MYK9-969 results privacy: an entry''s results are public only when the show is not private (show_visibility_settings.results_private) and every tied person (dog owner, co-owner, handler) has exhibitor_profiles.results_public; otherwise every result column is NULL for a caller who is neither show staff nor a tied person, and results_private says so. Staff paths (can_view_scores, stewards, ringside staff claims) are unaffected. The view remains security_invoker = false. awaiting_registration_number (MYK9-1162) is appended last: TRUE for a live entry whose dog has no registration number for the trial''s registry, from public.entry_awaiting_registration_number(), and unmasked because it carries no registration data. is_show_exhibitor (MYK9-1369) is computed once per query from a materialized set of the caller''s exhibitor show ids, not once per entry; the access rule is unchanged. placement_tie and placement_tiebreak (MYK9-1473) are appended after it and masked exactly like final_placement (can_view_scores OR placement_visible), so the replica holds the coin-flip state wherever it holds the placement. The caller''s own role set (MYK9-1476) is an input to updated_at via private.entry_results_caller_access_epoch(), so a grant, revoke, deactivation, hard delete or expiry moves every row this caller reads. card_paid (MYK9-1637) is appended after it and masked by can_view_admin like the other payment columns: TRUE when a succeeded Stripe order paid for the entry and Stripe has not refunded it. check_in_pulled_by (MYK9-1757) is appended last and unmasked like check_in_status: who flagged a pull, stamped by the server. area5_time_seconds and element_time_seconds (MYK9-2068) are appended last and masked like area4_time_seconds (can_view_scores).';

CREATE OR REPLACE VIEW public.view_authenticated_entry_results_replication
  WITH (security_invoker = false)
AS
SELECT
  entries.id,
  entries.dog_id,
  entries.class_id,
  entries.show_id,
  entries.trial_id,
  entries.handler_id,
  entries.entry_status,
  entries.payment_status,
  entries.handler,
  entries.entry_fee,
  entries.submitted_at,
  entries.special_requests,
  entries.armband,
  entries.run_order,
  entries.jump_height,
  entries.preferred_judge,
  entries.move_up_requested,
  entries.is_scored,
  entries.is_in_ring,
  entries.result_status,
  entries.ring_entry_time,
  entries.ring_exit_time,
  entries.scoring_started_at,
  entries.scoring_completed_at,
  entries.search_time_seconds,
  entries.area1_time_seconds,
  entries.area2_time_seconds,
  entries.area3_time_seconds,
  entries.area4_time_seconds,
  entries.total_correct_finds,
  entries.total_incorrect_finds,
  entries.total_faults,
  entries.no_finish_count,
  entries.area1_correct,
  entries.area1_incorrect,
  entries.area1_faults,
  entries.area2_correct,
  entries.area2_incorrect,
  entries.area2_faults,
  entries.area3_correct,
  entries.area3_incorrect,
  entries.area3_faults,
  entries.total_score,
  entries.points_earned,
  entries.points_possible,
  entries.bonus_points,
  entries.penalty_points,
  entries.time_over_limit,
  entries.time_limit_exceeded_seconds,
  entries.final_placement,
  entries.judge_notes,
  entries.judge_signature,
  entries.judge_signature_timestamp,
  entries.disqualification_reason,
  entries.has_video_review,
  entries.video_review_notes,
  entries.license_key,
  entries.local_id,
  entries.sync_version,
  entries.last_synced_at,
  entries.created_at,
  entries.updated_at,
  entries.deleted_at,
  entries.deleted_by,
  entries.check_in_status,
  entries.payment_method,
  entries.entry_source,
  entries.is_day_of_show,
  entries.registration_id,
  entries.withdrawal_reason,
  entries.refund_amount,
  entries.refund_notes,
  entries.refunded_at,
  entries.stripe_payment_intent_id,
  entries.comped,
  entries.comped_reason,
  entries.discount_amount,
  entries.confirmation_email_sent_at,
  entries.confirmation_email_message_id,
  entries.confirmation_email_status,
  entries.version,
  entries.result_text,
  entries.dog_name,
  entries.dog_call_name,
  entries.dog_breed,
  entries.dog_image_url,
  entries.class_name,
  entries.class_level,
  entries.class_element,
  entries.class_results_released_at,
  entries.show_name,
  entries.show_start_date,
  entries.show_organization,
  entries.is_own_entry,
  entries.payment_reference,
  entries.payment_received_on,
  entries.payment_notes,
  shows.deleted_at AS show_deleted_at,
  shows.name AS source_show_name,
  shows.start_date AS source_show_start_date,
  shows.end_date AS source_show_end_date,
  -- Appended last: CREATE OR REPLACE VIEW may only add columns at the end, and
  -- the four `shows` columns above already hold ordinals 99-102.
  entries.withdrawal_reason_code,
  -- MYK9-639, appended last for the same CREATE OR REPLACE reason.
  entries.moved_from_entry_id,
  -- MYK9-659, appended last for the same CREATE OR REPLACE reason. Already
  -- masked by the inner view; the wrapper only carries it.
  entries.registration_confirmation_number,
  -- MYK9-969, appended last for the same CREATE OR REPLACE reason. Computed by
  -- the inner view; the wrapper only carries it.
  entries.results_private,
  -- MYK9-1162, appended last for the same CREATE OR REPLACE reason. Computed by
  -- the inner view; the wrapper only carries it.
  entries.awaiting_registration_number,
  -- MYK9-1473, appended last for the same CREATE OR REPLACE reason. Already
  -- masked like final_placement by the inner view; the wrapper only carries it.
  entries.placement_tie,
  entries.placement_tiebreak,
  entries.card_paid,
  -- MYK9-1757, appended last for the same CREATE OR REPLACE reason. Stamped by the server
  -- and carried by the inner view; the wrapper only carries it.
  entries.check_in_pulled_by,
  -- MYK9-2068, appended last for the same CREATE OR REPLACE reason. Masked by the
  -- inner view like area4_time_seconds; the wrapper only carries them.
  entries.area5_time_seconds,
  entries.element_time_seconds
FROM public.view_authenticated_entry_results AS entries
LEFT JOIN public.shows AS shows ON shows.id = entries.show_id;

COMMIT;
