-- =============================================================================
-- Migration: ringside OCC conflict containment (2026-07-11 incident).
--
-- Incident: a stale-bundle client looped ringside_update_entry with a
-- permanently-behind expected_version (~70 calls/sec for 12+ hours), and every
-- doomed call paid the FULL cost of the function — caller resolution, 6–8
-- authorization lookups, and a dynamically planned UPDATE — before failing.
-- Staging Postgres pegged >80% CPU and shed load platform-wide (503s).
-- The server cannot trust clients to run fixed code (PWA bundles go stale on
-- devices indefinitely), so the guarantee must live here.
--
-- Tracked in openspec change: ringside-occ-conflict-circuit-breaker.
--
-- Three deltas, everything else re-emitted VERBATIM:
--   1. ringside_conflict_seq — rollback-proof conflict counter. nextval() is
--      non-transactional, so it advances even though the conflict RAISE aborts
--      the surrounding transaction (the only Postgres primitive that can count
--      from a failing call; a counter TABLE write would roll back with it).
--      Written only inside the SECURITY DEFINER function, read only by
--      system_health_probe: deliberately NO client grants.
--   2. ringside_update_entry — early version precheck: the entry row (with
--      version) is already loaded in step 1, so a stale expected_version now
--      raises 40001 (+ authoritative version in DETAIL, contract unchanged)
--      BEFORE caller/authorization resolution and BEFORE the dynamic UPDATE.
--      A doomed retry costs one PK lookup + an exception.
--        Disclosure trade-off (accepted, design D1): any authenticated caller
--        who knows an entry UUID can learn its integer version without passing
--        ringside authz. The function already discloses entry EXISTENCE
--        pre-auth (P0002 in step 1); UUIDs are unguessable; a bare version
--        integer carries no show data.
--      The late 0-row-UPDATE conflict path is KEPT as the concurrent-race
--      (TOCTOU) handler; both raise paths bump the counter.
--   3. system_health_probe — re-emitted from 20260704130000 with one added
--      fact: ringside_conflict_counter (raw sequence value). The daily
--      check-runner turns the delta between snapshots into the
--      ringside_conflicts check (thresholds live in the TS runner, not here).
--
-- Grants: closes the 2026-07-11 emergency out-of-band
-- `REVOKE EXECUTE ... FROM authenticated` — the final grant block below
-- restores authenticated EXECUTE now that protection is structural.
-- Rollback: re-emit the 20260710160000 §3 function + 20260704130000 probe;
-- the sequence may remain (inert without callers).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Rollback-proof conflict counter.
-- -----------------------------------------------------------------------------
create sequence if not exists public.ringside_conflict_seq;

comment on sequence public.ringside_conflict_seq is
  'Monotonic count of ringside_update_entry version conflicts. Advanced via nextval() immediately before each conflict RAISE — sequences are non-transactional, so the count survives the abort. Read by system_health_probe for the ringside_conflicts daily health check. No client grants by design.';

-- Sequences created by postgres are not client-accessible without a grant;
-- deliberately grant nothing (used only inside SECURITY DEFINER functions).

-- -----------------------------------------------------------------------------
-- 2. ringside_update_entry — re-emit 20260710160000 §3 VERBATIM except the
--    early OCC precheck (step 1b) and the two counter bumps.
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

  -- 1b. OCC precheck (2026-07-11 conflict-containment, design D1). The version
  -- is already in hand from step 1; a stale expected_version can NEVER succeed
  -- by retrying unchanged, so reject it here — before caller resolution, the
  -- 6–8 authorization lookups, and the dynamically planned UPDATE — making a
  -- conflict-storm call cost one PK lookup instead of the full function.
  -- Error shape is byte-identical to the late conflict path below (40001 +
  -- authoritative version in DETAIL) so post-#963 clients rebase exactly as
  -- before. nextval survives the abort this RAISE causes (see sequence above).
  IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
    PERFORM nextval('public.ringside_conflict_seq');
    RAISE EXCEPTION 'Version conflict updating entry % (expected %)',
      p_entry_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
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
      -- Unreachable since the 1b precheck (v_current_version is not re-read),
      -- kept verbatim as belt-and-braces; counted like every conflict raise.
      PERFORM nextval('public.ringside_conflict_seq');
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
    -- and it re-conflicts forever. This late path stays alive after the 1b
    -- precheck as the concurrent-race (TOCTOU) handler.
    SELECT e.version INTO v_current_version FROM public.entries e WHERE e.id = p_entry_id;
    IF FOUND THEN
      PERFORM nextval('public.ringside_conflict_seq');
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

-- Restores the authenticated grant (converging the live DB out of the
-- 2026-07-11 emergency REVOKE) behind the structural protection above.
REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM public;
REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. system_health_probe — re-emit 20260704130000 VERBATIM plus one fact:
--    ringside_conflict_counter (raw sequence value; delta/thresholds live in
--    the runner's TS module).
-- -----------------------------------------------------------------------------
create or replace function public.system_health_probe()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Raw facts only; no thresholds or status decisions here. Timestamps are
  -- returned as native timestamptz so jsonb serializes them as ISO-8601, which
  -- the TS side parses with Date.parse().
  return jsonb_build_object(
    'probed_at', now(),
    'latest_migration', (
      select version
      from supabase_migrations.schema_migrations
      order by version desc
      limit 1
    ),
    'migration_count', (
      select count(*)
      from supabase_migrations.schema_migrations
    ),
    -- Monotonic ringside OCC conflict counter (see ringside_conflict_seq).
    -- pg_sequences.last_value is NULL until the first nextval(); coalesce to 0
    -- so the runner always sees an integer.
    'ringside_conflict_counter', (
      select coalesce(last_value, 0)
      from pg_sequences
      where schemaname = 'public' and sequencename = 'ringside_conflict_seq'
    ),
    'cron_jobs', (
      select coalesce(jsonb_agg(j order by j->>'jobname'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'jobname',      job.jobname,
          'active',       job.active,
          -- A job whose command dispatches an Edge Function via net.http_post
          -- reports 'succeeded' the moment the request is ENQUEUED — pg_cron
          -- never sees the async HTTP response, so a downstream 4xx/5xx still
          -- reads 'succeeded' here. The runner words these jobs accordingly and
          -- leaves true downstream health to per-function ledgers (Codex #1125).
          'dispatches_http', (position('net.http_post' in coalesce(job.command, '')) > 0),
          'last_status',  lr.status,
          'last_start',   lr.start_time,
          'last_end',     lr.end_time,
          'last_message', lr.return_message
        ) as j
        from cron.job job
        left join lateral (
          -- Most recent run for this job (start_time desc; a never-run job
          -- yields NULLs, which the runner reads as "warn: no run recorded").
          select status, start_time, end_time, return_message
          from cron.job_run_details d
          where d.jobid = job.jobid
          order by d.start_time desc nulls last
          limit 1
        ) lr on true
      ) sub
    )
  );
end;
$$;

comment on function public.system_health_probe() is
  'Read-only health facts (scheduled cron jobs + last-run outcome, newest applied migration, ringside OCC conflict counter) for the cron-health-check runner. SECURITY DEFINER so service_role can read cron.* / supabase_migrations.* which PostgREST does not expose. Runs no health logic; the ok/warn/fail mapping lives in the runner. Same monitoring family as the operator_alerts surface (MP-08).';

-- Functions default to EXECUTE for PUBLIC — revoke, then grant only the runner.
revoke all on function public.system_health_probe() from public;
grant execute on function public.system_health_probe() to service_role;

commit;

-- Reload PostgREST schema cache so the updated RPCs resolve.
notify pgrst, 'reload schema';
