# Ringside OCC Admission Control Implementation Plan (MYK9-115)

> **Status:** Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound the rate at which a wedged ringside client can burn database CPU with OCC conflicts, with a persisted, operator-visible, operator-rearmed containment state.

**Architecture:** A pg_cron sampler (1/min) computes the conflict delta from the existing `ringside_conflict_seq` and flips a single-row `ringside_containment` state table when it exceeds a threshold. `ringside_update_entry`'s conflict precheck path reads that row; while contained, conflicting calls sleep 250 ms and raise custom SQLSTATE `RS429` (authoritative version still in DETAIL). Version-correct calls are never affected. The client recognizes `RS429`, pauses RPC-mutation uploads for 60 s (scores retained, OCC token advanced), and shows a banner; the head-of-queue retry is the probe. Operators see a `/admin/health` row and rearm via an audited, site-admin-gated RPC.

**Spec:** `docs/superpowers/specs/2026-07-30-ringside-occ-admission-control-design.md` (user-approved 2026-07-30).

**Tech Stack:** Postgres (plpgsql, pg_cron, sequences), Supabase migrations + behavioral SQL harness, TypeScript (`@myk9/replication` IndexedDB outbox), React (myK9Show at-show + admin health), Deno edge function (`systemHealthChecks`).

## Global Constraints

- Work in a git worktree (concurrent MYK9-93 session is active); `.githooks/pre-commit` enforces this.
- **Before creating each migration file**: `ls supabase/migrations/ | tail -3` AND `select version from supabase_migrations.schema_migrations order by version desc limit 3` (read-only MCP) — the concurrent MYK9-93 session may take timestamps. Renumber above whatever exists.
- Every new table/function needs explicit anon + authenticated GRANT/REVOKE lines in the same migration file (`migrationGrantDecisionContract` fails CI otherwise), and this project's default privileges auto-grant anon full CRUD on new tables — `REVOKE ALL ... FROM anon` is mandatory, not stylistic.
- `ringside_update_entry` must be rebuilt from the LATEST migration that defines it (currently `20260712101000_authorize_ringside_occ_conflicts.sql`) — never from an older file (LESSONS: silent revert trap).
- Grants on `ringside_update_entry` itself are NOT changed by this work (issue safety gate).
- Provisional threshold 300 conflicts/min, `backpressure_ms` 250, `calibrated=false`; changing thresholds later is a config UPDATE, not a migration.
- `db push` and any deploy only in a user-approved window; the user approved this feature's normal PR + push flow on 2026-07-30.
- App tests run against built package dist: after editing `packages/replication`, run `pnpm --filter @myk9/replication build` before any app-level test.
- Always `pnpm typecheck` (never raw tsc). Remove unused test variables instead of underscore-prefixing.

---

### Task 1: Containment state, audit, sampler, rearm RPC, probe field (migration A)

**Files:**

- Create: `supabase/migrations/<TS1>_ringside_containment_state.sql` (TS1 = next free timestamp per Global Constraints)
- Create: `supabase/tests/ringside_containment_test.sql`
- Modify: `scripts/qa/run-behavioral-sql-tests.sh` (TEST_FILES array, alphabetical position)
- Modify: `scripts/qa/run-behavioral-sql-tests.test.ts` (`launchCriticalSqlTests` array, same position)

**Interfaces:**

- Consumes: `public.ringside_conflict_seq` (exists, migration 20260711150000), `public.is_site_admin()` (exists).
- Produces: table `public.ringside_containment` (single row, columns below); table `public.ringside_containment_audit`; `public.ringside_containment_sample() RETURNS void`; `public.ringside_containment_rearm(p_reason text) RETURNS jsonb` — `{"state":"armed","was_contained":<bool>}`. Task 2's function gate reads `ringside_containment.state`, `backpressure_ms`. Task 6 calls the rearm RPC via PostgREST.

- [ ] **Step 1: Write the failing behavioral SQL test**

`supabase/tests/ringside_containment_test.sql`:

```sql
-- MYK9-115 trip/contain/rearm semantics for ringside OCC admission control.
-- Fixtures and claims are transaction-local and roll back.

begin;

-- Grant posture: clients must not see containment internals.
do $$
begin
  if has_table_privilege('anon', 'public.ringside_containment', 'select')
     or has_table_privilege('authenticated', 'public.ringside_containment', 'select') then
    raise exception 'FAIL containment state table is client-readable';
  end if;
  if has_table_privilege('anon', 'public.ringside_containment_audit', 'select')
     or has_table_privilege('authenticated', 'public.ringside_containment_audit', 'select') then
    raise exception 'FAIL containment audit table is client-readable';
  end if;
  if has_function_privilege('anon', 'public.ringside_containment_rearm(text)', 'execute') then
    raise exception 'FAIL anon can execute rearm';
  end if;
  if not has_function_privilege('authenticated', 'public.ringside_containment_rearm(text)', 'execute') then
    raise exception 'FAIL authenticated cannot reach rearm (internal gate expects to run)';
  end if;
  if has_function_privilege('anon', 'public.ringside_containment_sample()', 'execute')
     or has_function_privilege('authenticated', 'public.ringside_containment_sample()', 'execute') then
    raise exception 'FAIL sampler is client-executable';
  end if;
end;
$$;

-- Seed row exists and starts armed with provisional config.
do $$
declare r public.ringside_containment;
begin
  select * into strict r from public.ringside_containment;
  if r.state <> 'armed' or r.trip_conflicts_per_minute <> 300
     or r.backpressure_ms <> 250 or r.calibrated then
    raise exception 'FAIL seed row wrong: % % % %',
      r.state, r.trip_conflicts_per_minute, r.backpressure_ms, r.calibrated;
  end if;
end;
$$;

-- Sampler below threshold: cursor advances, state stays armed, no audit.
select nextval('public.ringside_conflict_seq') from generate_series(1, 5);
update public.ringside_containment
   set last_seq = (select last_value from public.ringside_conflict_seq),
       last_sample_at = now() - interval '1 minute';
select nextval('public.ringside_conflict_seq') from generate_series(1, 10);
select public.ringside_containment_sample();
do $$
declare r public.ringside_containment;
begin
  select * into strict r from public.ringside_containment;
  if r.state <> 'armed' then
    raise exception 'FAIL sampler tripped below threshold';
  end if;
  if r.last_seq <> (select last_value from public.ringside_conflict_seq) then
    raise exception 'FAIL sampler did not advance cursor';
  end if;
  if exists (select 1 from public.ringside_containment_audit) then
    raise exception 'FAIL audit written below threshold';
  end if;
end;
$$;

-- Sampler above threshold: trips, records metadata + audit.
update public.ringside_containment
   set last_seq = (select last_value from public.ringside_conflict_seq),
       last_sample_at = now() - interval '1 minute';
select nextval('public.ringside_conflict_seq') from generate_series(1, 301);
select public.ringside_containment_sample();
do $$
declare r public.ringside_containment;
begin
  select * into strict r from public.ringside_containment;
  if r.state <> 'contained' then
    raise exception 'FAIL sampler did not trip above threshold';
  end if;
  if r.tripped_at is null or r.trip_conflict_delta < 301 then
    raise exception 'FAIL trip metadata missing: % %', r.tripped_at, r.trip_conflict_delta;
  end if;
  if not exists (
    select 1 from public.ringside_containment_audit
    where event = 'trip' and actor is null and conflict_delta >= 301
  ) then
    raise exception 'FAIL trip audit row missing';
  end if;
end;
$$;

-- Sampler while already contained: cursor still advances, no second trip audit.
update public.ringside_containment
   set last_sample_at = now() - interval '1 minute';
select nextval('public.ringside_conflict_seq') from generate_series(1, 400);
select public.ringside_containment_sample();
do $$
begin
  if (select count(*) from public.ringside_containment_audit where event = 'trip') <> 1 then
    raise exception 'FAIL re-trip audit while already contained';
  end if;
end;
$$;

-- Rearm by non-admin is denied. Fixture admin per club_secretary_grant_test pattern.
insert into public.roles (id, name, description, is_system)
values ('00000000-0000-0000-0000-000000115801', 'site_admin', 'MYK9-115 fixture', true)
on conflict (name) do nothing;
insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000000115011', 'Site', 'Admin', '00000000-0000-0000-0000-000000115101'),
  ('00000000-0000-0000-0000-000000115012', 'Not', 'Admin', '00000000-0000-0000-0000-000000115102');
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000115011', r.id, true, '00000000-0000-0000-0000-000000115101'
from public.roles r where r.name = 'site_admin';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000115102', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000115102","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.ringside_containment_rearm('should be denied');
    raise exception 'FAIL non-admin rearm succeeded';
  exception
    when insufficient_privilege then null; -- expected 42501
  end;
end;
$$;

-- Rearm by site admin: state armed, cursor reset, trip metadata cleared, audit row.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000115101', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000115101","role":"authenticated"}', true);
select nextval('public.ringside_conflict_seq') from generate_series(1, 3);
do $$
declare
  result jsonb;
  r public.ringside_containment;
begin
  result := public.ringside_containment_rearm('operator test rearm');
  if result->>'state' <> 'armed' or (result->>'was_contained')::boolean is not true then
    raise exception 'FAIL rearm result wrong: %', result;
  end if;
  select * into strict r from public.ringside_containment;
  if r.state <> 'armed' or r.tripped_at is not null or r.trip_conflict_delta is not null then
    raise exception 'FAIL rearm did not clear trip state';
  end if;
  if r.last_seq <> (select last_value from public.ringside_conflict_seq) then
    raise exception 'FAIL rearm did not reset sampler cursor';
  end if;
  if not exists (
    select 1 from public.ringside_containment_audit
    where event = 'rearm'
      and actor = '00000000-0000-0000-0000-000000115101'
      and reason = 'operator test rearm'
  ) then
    raise exception 'FAIL rearm audit row missing';
  end if;
  -- Idempotent no-op: rearming an armed breaker succeeds and writes no audit.
  result := public.ringside_containment_rearm('noop');
  if (result->>'was_contained')::boolean is not false then
    raise exception 'FAIL no-op rearm reported was_contained';
  end if;
  if (select count(*) from public.ringside_containment_audit where event = 'rearm') <> 1 then
    raise exception 'FAIL no-op rearm wrote audit';
  end if;
end;
$$;

rollback;
```

- [ ] **Step 2: Run it to verify it fails** (objects don't exist yet)

Run (rolled-back rehearsal against the linked project — the harness pattern used for `entries_manager_policy_hashable_test.sql`; password from `supabase/.env`, pooler `aws-1-us-east-2.pooler.supabase.com`, user `postgres.sojmvhhwsjxmfistvzbe`):

```bash
psql "<pooler conn>" -v ON_ERROR_STOP=1 -f supabase/tests/ringside_containment_test.sql
```

Expected: FAIL with `relation "public.ringside_containment" does not exist`.

- [ ] **Step 3: Write migration A**

`supabase/migrations/<TS1>_ringside_containment_state.sql`:

```sql
-- MYK9-115: ringside OCC admission control — persisted containment state.
-- Design: docs/superpowers/specs/2026-07-30-ringside-occ-admission-control-design.md
-- A doomed conflict call's RAISE rolls back any table write it makes, so the
-- trip decision must be made OUTSIDE the failing transactions: a minutely
-- pg_cron sampler reads ringside_conflict_seq, computes the delta, and
-- persists state here. ringside_update_entry (migration B) reads this row.

-- 1. State (single row).
CREATE TABLE public.ringside_containment (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  state text NOT NULL DEFAULT 'armed' CHECK (state IN ('armed', 'contained')),
  trip_conflicts_per_minute integer NOT NULL DEFAULT 300,
  backpressure_ms integer NOT NULL DEFAULT 250,
  calibrated boolean NOT NULL DEFAULT false,
  last_seq bigint NOT NULL DEFAULT 0,
  last_sample_at timestamptz NOT NULL DEFAULT now(),
  tripped_at timestamptz,
  trip_conflict_delta bigint,
  trip_reason text
);

COMMENT ON TABLE public.ringside_containment IS
  'Single-row ringside OCC conflict-storm breaker state (MYK9-115). Written '
  'by ringside_containment_sample() (pg_cron) and ringside_containment_rearm(); '
  'read inside ringside_update_entry. calibrated=false means the threshold is '
  'provisional pending G9 evidence. No client grants by design.';

-- Client isolation. The REVOKEs are mandatory: this project carries default
-- privileges granting anon/authenticated full CRUD on new public tables.
REVOKE ALL ON public.ringside_containment FROM PUBLIC;
REVOKE ALL ON public.ringside_containment FROM anon;
REVOKE ALL ON public.ringside_containment FROM authenticated;
GRANT SELECT ON public.ringside_containment TO service_role;

INSERT INTO public.ringside_containment (id, last_seq)
VALUES (true, (SELECT coalesce(last_value, 0) FROM pg_sequences
               WHERE schemaname = 'public' AND sequencename = 'ringside_conflict_seq'));

-- 2. Audit (append-only).
CREATE TABLE public.ringside_containment_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event text NOT NULL CHECK (event IN ('trip', 'rearm')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor uuid,
  conflict_delta bigint,
  reason text
);

COMMENT ON TABLE public.ringside_containment_audit IS
  'Append-only trip/rearm history for the ringside OCC breaker (MYK9-115). '
  'actor is auth.uid() for operator rearms, NULL for cron trips.';

REVOKE ALL ON public.ringside_containment_audit FROM PUBLIC;
REVOKE ALL ON public.ringside_containment_audit FROM anon;
REVOKE ALL ON public.ringside_containment_audit FROM authenticated;
GRANT SELECT ON public.ringside_containment_audit TO service_role;

-- 3. Sampler (pg_cron, minutely).
CREATE OR REPLACE FUNCTION public.ringside_containment_sample()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
  v_seq bigint;
  v_state public.ringside_containment;
  v_delta bigint;
  v_minutes numeric;
  v_rate_per_minute numeric;
BEGIN
  SELECT coalesce(last_value, 0) INTO v_seq
    FROM pg_sequences
   WHERE schemaname = 'public' AND sequencename = 'ringside_conflict_seq';

  SELECT * INTO STRICT v_state
    FROM public.ringside_containment
   FOR UPDATE;

  v_delta := greatest(v_seq - v_state.last_seq, 0);
  v_minutes := greatest(extract(epoch FROM (v_now - v_state.last_sample_at)) / 60.0, 0.25);
  v_rate_per_minute := v_delta / v_minutes;

  UPDATE public.ringside_containment
     SET last_seq = v_seq,
         last_sample_at = v_now;

  IF v_state.state = 'armed'
     AND v_rate_per_minute > v_state.trip_conflicts_per_minute THEN
    UPDATE public.ringside_containment
       SET state = 'contained',
           tripped_at = v_now,
           trip_conflict_delta = v_delta,
           trip_reason = format('conflict rate %s/min exceeded threshold %s/min',
                                round(v_rate_per_minute), v_state.trip_conflicts_per_minute);
    INSERT INTO public.ringside_containment_audit (event, actor, conflict_delta, reason)
    VALUES ('trip', NULL, v_delta,
            format('conflict rate %s/min exceeded threshold %s/min',
                   round(v_rate_per_minute), v_state.trip_conflicts_per_minute));
  END IF;
END;
$$;

COMMENT ON FUNCTION public.ringside_containment_sample() IS
  'Minutely pg_cron sampler for the ringside OCC breaker (MYK9-115). Runs '
  'outside the doomed conflict transactions, which is what makes the '
  'persisted trip decision possible.';

REVOKE ALL ON FUNCTION public.ringside_containment_sample() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ringside_containment_sample() FROM anon;
REVOKE ALL ON FUNCTION public.ringside_containment_sample() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ringside_containment_sample() TO service_role;

-- 4. Rearm RPC (operator-explicit; MYK9-115 requires no auto-rearm).
CREATE OR REPLACE FUNCTION public.ringside_containment_rearm(p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state public.ringside_containment;
  v_seq bigint;
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Not authorized to rearm ringside containment'
      USING errcode = '42501';
  END IF;

  SELECT * INTO STRICT v_state
    FROM public.ringside_containment
   FOR UPDATE;

  IF v_state.state = 'armed' THEN
    -- Idempotent no-op: no state change, no audit row.
    RETURN jsonb_build_object('state', 'armed', 'was_contained', false);
  END IF;

  SELECT coalesce(last_value, 0) INTO v_seq
    FROM pg_sequences
   WHERE schemaname = 'public' AND sequencename = 'ringside_conflict_seq';

  UPDATE public.ringside_containment
     SET state = 'armed',
         tripped_at = NULL,
         trip_conflict_delta = NULL,
         trip_reason = NULL,
         -- Reset the sampler cursor so the stale window cannot insta-retrip.
         last_seq = v_seq,
         last_sample_at = now();

  INSERT INTO public.ringside_containment_audit (event, actor, conflict_delta, reason)
  VALUES ('rearm', (SELECT auth.uid()), v_state.trip_conflict_delta, p_reason);

  RETURN jsonb_build_object('state', 'armed', 'was_contained', true);
END;
$$;

COMMENT ON FUNCTION public.ringside_containment_rearm(text) IS
  'Operator rearm for the ringside OCC breaker (MYK9-115). Site-admin gated '
  'internally; idempotent (rearming an armed breaker is a no-op, no audit). '
  'Resets the sampler cursor to the current sequence value.';

REVOKE ALL ON FUNCTION public.ringside_containment_rearm(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ringside_containment_rearm(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_containment_rearm(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ringside_containment_rearm(text) TO service_role;

-- 5. Schedule the sampler.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'ringside-containment-sampler';

SELECT cron.schedule(
  'ringside-containment-sampler',
  '* * * * *',
  $sampler$ SELECT public.ringside_containment_sample(); $sampler$
);

-- Reload PostgREST schema cache so the rearm RPC resolves.
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Add `system_health_probe` containment facts (same migration)**

Append to migration A a re-emit of `system_health_probe` copied VERBATIM from its latest definition (currently in `20260711150000_ringside_occ_conflict_containment.sql` §3 — re-grep `grep -l "create or replace function public.system_health_probe" supabase/migrations/` first and copy from the newest hit), adding ONE key to the returned `jsonb_build_object`, directly after the `'ringside_conflict_counter'` entry:

```sql
    'ringside_containment', (
      select jsonb_build_object(
        'state', c.state,
        'tripped_at', c.tripped_at,
        'trip_conflict_delta', c.trip_conflict_delta,
        'trip_reason', c.trip_reason,
        'trip_conflicts_per_minute', c.trip_conflicts_per_minute,
        'calibrated', c.calibrated,
        'last_sample_at', c.last_sample_at
      )
      from public.ringside_containment c
    ),
```

Keep the probe's existing REVOKE/GRANT block verbatim (service_role only).

- [ ] **Step 5: Wire the harness allowlist**

In `scripts/qa/run-behavioral-sql-tests.sh` add `"$TEST_DIR/ringside_containment_test.sql"` to `TEST_FILES` (alphabetical: after `recoverable_show_access_codes_test.sql`), and in `scripts/qa/run-behavioral-sql-tests.test.ts` add `'ringside_containment_test.sql'` at the same position in `launchCriticalSqlTests`.

- [ ] **Step 6: Verify — rolled-back rehearsal, then harness pin test**

```bash
# wrapper: BEGIN; \i migrationA; \i test (test's inner begin warns, its final
# rollback unwinds everything) — same pattern as verify-migration.sql this session
psql "<pooler conn>" -f /tmp/verify-115a.sql
```

Expected: all DO blocks pass, final `ROLLBACK`, exit 0.
Note: `cron.schedule` inside the rolled-back rehearsal also rolls back — fine.

```bash
pnpm qa:sql:behavioral:test
```

Expected: PASS (allowlists agree).

- [ ] **Step 7: Run the grant-decision contract**

```bash
cd apps/myk9show && pnpm vitest run src/test/database/migrationGrantDecisionContract.test.ts
```

Expected: PASS (migration A carries explicit anon + authenticated decisions for both tables and both functions).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/<TS1>_ringside_containment_state.sql \
        supabase/tests/ringside_containment_test.sql \
        scripts/qa/run-behavioral-sql-tests.sh scripts/qa/run-behavioral-sql-tests.test.ts
git commit -m "feat(db): ringside OCC containment state, sampler, rearm RPC (MYK9-115)"
```

---

### Task 2: RS429 gate in `ringside_update_entry` (migration B)

**Files:**

- Create: `supabase/migrations/<TS2>_ringside_update_entry_containment_gate.sql` (TS2 > TS1, re-check for collisions)
- Modify: `supabase/tests/ringside_containment_test.sql` (append gate assertions)

**Interfaces:**

- Consumes: `public.ringside_containment.state/backpressure_ms` (Task 1).
- Produces: while contained, conflicting `ringside_update_entry` calls raise SQLSTATE `RS429`, message `Ringside scoring contained; retries paused`, DETAIL = authoritative current version (unchanged contract), HINT = `retry_after=60`. Task 3's client classifier matches `code === 'RS429'`.

- [ ] **Step 1: Append failing gate assertions to the behavioral test**

Append to `supabase/tests/ringside_containment_test.sql` BEFORE its final `rollback;` (fixture ids continue the 115 range; the entry fixture needs show/trial/class/dog rows — copy the insert shapes from `supabase/tests/entries_manager_policy_hashable_test.sql` with ids `…115020`–`…115033`, one published show, one entry with `version` defaulting to its initial value):

```sql
-- ---- Gate semantics (migration B) ----
reset role;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000115020', 'MYK9-115 Gate Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000115021', 'MYK9-115 Gate Show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000000115020', 'published');
insert into public.trials (id, show_id, name, date)
values ('00000000-0000-0000-0000-000000115022', '00000000-0000-0000-0000-000000115021',
        'MYK9-115 Gate Trial', current_date);
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000115023', '00000000-0000-0000-0000-000000115022',
        'Container Novice', 'upcoming');
insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000115024', 'Gate Dog', 'Gate Dog', 'Beagle',
        '00000000-0000-0000-0000-000000115011');
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
                            entry_status, payment_status, entry_fee)
values ('00000000-0000-0000-0000-000000115033', '00000000-0000-0000-0000-000000115024',
        '00000000-0000-0000-0000-000000115023', '00000000-0000-0000-0000-000000115021',
        '00000000-0000-0000-0000-000000115022', '00000000-0000-0000-0000-000000115011',
        'confirmed', 'paid', 25);

-- Force contained state directly (sampler already proven above).
update public.ringside_containment
   set state = 'contained', tripped_at = now(),
       trip_conflict_delta = 999, trip_reason = 'gate test',
       backpressure_ms = 0;  -- zero sleep keeps the test fast

-- Site admin caller (already claimed above as …115101; is_site_admin() holds).
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000115101', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000115101","role":"authenticated"}', true);

do $$
declare
  v_version integer;
  v_new_version integer;
  v_detail text;
  v_state text;
begin
  select version into strict v_version
    from public.entries where id = '00000000-0000-0000-0000-000000115033';

  -- Version-correct write SUCCEEDS while contained (blast-radius decision).
  v_new_version := public.ringside_update_entry(
    '00000000-0000-0000-0000-000000115033', '{"is_in_ring": true}'::jsonb, v_version);
  if v_new_version is null then
    raise exception 'FAIL version-correct write blocked while contained';
  end if;

  -- Conflicting write raises RS429 with authoritative version in DETAIL.
  begin
    perform public.ringside_update_entry(
      '00000000-0000-0000-0000-000000115033', '{"is_in_ring": false}'::jsonb, v_version - 1);
    raise exception 'FAIL contained conflict did not raise';
  exception
    when sqlstate 'RS429' then
      get stacked diagnostics v_detail = pg_exception_detail;
      if v_detail <> v_new_version::text then
        raise exception 'FAIL RS429 DETAIL % <> authoritative %', v_detail, v_new_version;
      end if;
  end;

  -- Armed behavior unchanged: same conflict raises plain 40001.
  reset role;
  update public.ringside_containment set state = 'armed';
  set local role authenticated;
  begin
    perform public.ringside_update_entry(
      '00000000-0000-0000-0000-000000115033', '{"is_in_ring": false}'::jsonb, v_version - 1);
    raise exception 'FAIL armed conflict did not raise';
  exception
    when serialization_failure then null; -- expected 40001
  end;

  select state into v_state from public.ringside_containment;
  if v_state <> 'armed' then
    raise exception 'FAIL state drifted during gate test';
  end if;
end;
$$;
```

(Note: `reset role` + re-`set local role` inside the DO block is not possible — plpgsql cannot RESET ROLE; move the "armed behavior unchanged" stanza into a SEPARATE `do` block after a top-level `reset role; update …; set local role authenticated;` sequence, mirroring the structure above. Keep the assertions identical.)

- [ ] **Step 2: Run to verify the new stanza fails** (function has no gate yet)

Same rolled-back wrapper as Task 1 Step 6, now including migration B's file once written — at this point run with migration A only. Expected: FAIL at `'FAIL contained conflict did not raise'` (the conflict raises `40001`, not `RS429`).

- [ ] **Step 3: Write migration B**

`supabase/migrations/<TS2>_ringside_update_entry_containment_gate.sql`. Rebuild the ENTIRE function by copying the newest definition — verify with `grep -l "CREATE OR REPLACE FUNCTION public.ringside_update_entry" supabase/migrations/ | sort | tail -1` (expected `20260712101000_authorize_ringside_occ_conflicts.sql`) — VERBATIM, with exactly these deltas:

1. Add to DECLARE:

```sql
  v_containment public.ringside_containment;
```

2. Replace the step-1b conflict raise body (anchor: the first
   `PERFORM nextval('public.ringside_conflict_seq');` … `RAISE EXCEPTION 'Version conflict updating entry`
   block) with:

```sql
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
```

3. Apply the SAME replacement to the OTHER TWO conflict-raise sites (the belt-and-braces empty-payload site and the late TOCTOU site) — all three raise paths must honor containment identically.

4. Re-emit the existing grant block VERBATIM (REVOKE public/anon, GRANT authenticated) — grants unchanged per the issue's safety gate. End with `NOTIFY pgrst, 'reload schema';`.

- [ ] **Step 4: Run the full rolled-back rehearsal (migration A + B + test)**

Expected: every DO block passes, exit 0.

- [ ] **Step 5: Run grant-decision contract + full database contract dir**

```bash
cd apps/myk9show && pnpm vitest run src/test/database/
```

Expected: PASS (ringsideOccAuthzContract and friends read the migrations corpus; migration B re-emits the function so source-text pins may need their migration path updated — if a pin fails, update its `readFileSync` source to the new migration file, keeping assertions unchanged).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<TS2>_ringside_update_entry_containment_gate.sql supabase/tests/ringside_containment_test.sql
git commit -m "feat(db): RS429 containment gate in ringside_update_entry (MYK9-115)"
```

---

### Task 3: Client containment classification (`@myk9/replication`)

**Files:**

- Modify: `packages/replication/src/mutation-occ.ts`
- Modify: `packages/replication/src/mutation-execute.ts:120-135` (the `isVersionConflictError` conversion site)
- Test: `packages/replication/src/mutation-occ.test.ts` (extend), `packages/replication/src/mutation-execute.test.ts` (extend)

**Interfaces:**

- Consumes: PostgREST error shape `{ code: 'RS429', details: '<version>', hint: 'retry_after=60' }`.
- Produces: `class ContainmentError extends Error { tableName: string; rowId: string; currentServerVersion?: number; retryAfterMs: number }` and `isContainmentError(error: unknown): boolean` exported from `mutation-occ.ts`; `mutation-execute` throws `ContainmentError` (never `OccRejectionError`) for RS429. Task 4 catches `ContainmentError` in the upload runner.

- [ ] **Step 1: Write failing tests**

In `mutation-occ.test.ts`:

```typescript
describe('isContainmentError', () => {
  it('matches the RS429 PostgREST error shape', () => {
    expect(
      isContainmentError({ code: 'RS429', message: 'Ringside scoring contained; retries paused' })
    ).toBe(true);
  });
  it('does not match ordinary version conflicts or other errors', () => {
    expect(
      isContainmentError({
        code: '40001',
        message: 'Version conflict updating entry x (expected 1)',
      })
    ).toBe(false);
    expect(isContainmentError(new Error('network'))).toBe(false);
    expect(isContainmentError(null)).toBe(false);
  });
  it('RS429 is not classified as a version conflict', () => {
    expect(
      isVersionConflictError({
        code: 'RS429',
        message: 'Ringside scoring contained; retries paused',
      })
    ).toBe(false);
  });
});

describe('ContainmentError', () => {
  it('carries version from details and parses retry_after from hint', () => {
    const err = new ContainmentError('entries', 'row-1', 7, 60_000);
    expect(err.currentServerVersion).toBe(7);
    expect(err.retryAfterMs).toBe(60_000);
    expect(parseContainmentRetryAfterMs({ hint: 'retry_after=60' })).toBe(60_000);
    expect(parseContainmentRetryAfterMs({ hint: undefined })).toBe(60_000); // default
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/replication && pnpm vitest run src/mutation-occ.test.ts
```

Expected: FAIL — `isContainmentError` not exported.

- [ ] **Step 3: Implement in `mutation-occ.ts`**

```typescript
/** SQLSTATE raised by ringside_update_entry while the OCC breaker is contained (MYK9-115). */
export const CONTAINMENT_SQLSTATE = 'RS429';
const DEFAULT_CONTAINMENT_RETRY_AFTER_MS = 60_000;

/**
 * Thrown when the server's OCC conflict-storm breaker is contained. Unlike an
 * OCC rejection this is a GLOBAL pause signal: the mutation is left untouched
 * (no occRetries increment, no parking) and the whole RPC-mutation upload lane
 * pauses for retryAfterMs. The head-of-queue retry after the pause is the probe.
 */
export class ContainmentError extends Error {
  constructor(
    public readonly tableName: string,
    public readonly rowId: string,
    public readonly currentServerVersion: number | undefined,
    public readonly retryAfterMs: number
  ) {
    super(`Ringside containment active for ${tableName}/${rowId}; uploads paused.`);
    this.name = 'ContainmentError';
  }
}

export function isContainmentError(error: unknown): boolean {
  if (error instanceof ContainmentError) return true;
  if (typeof error !== 'object' || error === null) return false;
  return (error as { code?: unknown }).code === CONTAINMENT_SQLSTATE;
}

export function parseContainmentRetryAfterMs(error: { hint?: unknown }): number {
  if (typeof error.hint === 'string') {
    const match = /retry_after=(\d+)/.exec(error.hint);
    if (match) return Number(match[1]) * 1000;
  }
  return DEFAULT_CONTAINMENT_RETRY_AFTER_MS;
}
```

Also add an early guard in `isVersionConflictError` (RS429's message must never be caught by the `/version conflict/i` fallback — it can't be, but the guard documents intent):

```typescript
if (candidate.code === CONTAINMENT_SQLSTATE) return false;
```

In `mutation-execute.ts`, at the `isVersionConflictError(error)` site (line ~123), add BEFORE it:

```typescript
if (isContainmentError(error)) {
  const raw = error as { details?: unknown; hint?: unknown };
  throw new ContainmentError(
    mutation.tableName,
    String(mutation.rowId),
    getConflictServerVersion(error),
    parseContainmentRetryAfterMs(raw)
  );
}
```

(`getConflictServerVersion` already parses `details`; it is code-agnostic.)

- [ ] **Step 4: Run tests**

```bash
cd packages/replication && pnpm vitest run src/mutation-occ.test.ts src/mutation-execute.test.ts
```

Expected: PASS (extend `mutation-execute.test.ts` with one case: an RS429 supabase error rejects with `ContainmentError`, mirroring its existing OccRejectionError conversion test).

- [ ] **Step 5: Commit**

```bash
git add packages/replication/src/mutation-occ.ts packages/replication/src/mutation-execute.ts \
        packages/replication/src/mutation-occ.test.ts packages/replication/src/mutation-execute.test.ts
git commit -m "feat(replication): classify RS429 containment errors (MYK9-115)"
```

---

### Task 4: Upload-runner pause + containment event

**Files:**

- Modify: `packages/replication/src/MutationUploadRunner.ts` (catch chain at ~line 276; pass gate in the mutation loop)
- Modify: `packages/replication/src/mutation-upload-events.ts`
- Test: `packages/replication/src/MutationManager.test.ts` (extend — it exercises the runner)

**Interfaces:**

- Consumes: `ContainmentError` (Task 3), `rowSync.advanceReplicatedRowServerVersion` (exists).
- Produces: runner field `containmentUntil: number | null`; window event `replication:containment` with `detail: { until: number }`; RPC mutations (`mutation.rpc !== undefined`) are skipped while `Date.now() < containmentUntil`. Task 5 listens for the event.

- [ ] **Step 1: Write failing tests** (in `MutationManager.test.ts`, following its existing harness for enqueuing an RPC mutation and stubbing the supabase client)

```typescript
describe('containment (MYK9-115)', () => {
  it('pauses RPC uploads, retains the mutation, advances the row token, and emits the event', async () => {
    // enqueue one ringside RPC mutation; stub executeMutation path to reject
    // with the RS429 PostgREST shape { code: 'RS429', details: '9', hint: 'retry_after=60' }
    // run an upload pass
    // - mutation still in PENDING_MUTATIONS, occRetries NOT incremented, status unchanged
    // - replicated row's serverVersion advanced to 9
    // - a 'replication:containment' CustomEvent fired with detail.until ≈ now + 60_000 (± jitter 10_000)
  });
  it('skips RPC mutations while paused but still uploads direct-table mutations', async () => {
    // set containmentUntil = Date.now() + 60_000 via a first RS429 pass
    // enqueue one RPC mutation and one plain UPDATE mutation; run a pass
    // - RPC mutation untouched; plain mutation uploaded
  });
  it('resumes after the window: next pass attempts the RPC mutation again', async () => {
    // advance fake timers past containmentUntil; stub success; run a pass
    // - mutation uploads and is deleted from the queue
  });
});
```

Write these as REAL tests against the existing fake-IDB + stubbed-supabase harness already used in `MutationManager.test.ts` (mirror its setup blocks; do not invent a new harness).

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/replication && pnpm vitest run src/MutationManager.test.ts -t containment
```

Expected: FAIL (no containment handling).

- [ ] **Step 3: Implement**

In `mutation-upload-events.ts`:

```typescript
export function dispatchContainment(logger: Logger, until: number): void {
  logger.warn(
    `[MutationManager] Server containment active; pausing RPC-mutation uploads until ${new Date(until).toISOString()}.`
  );
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('replication:containment', { detail: { until } }));
  }
}
```

In `MutationUploadRunner.ts`:

1. Field: `private containmentUntil: number | null = null;`
2. In the mutation loop, immediately after the unresolved-conflict skip (~line 233):

```typescript
// MYK9-115: while the server's OCC breaker is contained, RPC mutations
// (the storm vector) stay parked in the queue untouched. Direct-table
// mutations continue. The first attempt after the window is the probe.
if (
  queuedMutation.rpc !== undefined &&
  this.containmentUntil !== null &&
  now < this.containmentUntil
) {
  skipped.containment = (skipped.containment ?? 0) + 1;
  blockedDependencyIds.add(queuedMutation.id);
  continue;
}
```

3. In the catch chain, BEFORE the `OccRejectionError` branch:

```typescript
if (error instanceof ContainmentError) {
  // Global pause, not a per-mutation failure: leave the mutation
  // exactly as queued (no retries/occRetries increment — a contained
  // server must not consume the lifetime cap) and advance the row
  // token so post-containment writes carry a fresh version.
  if (typeof error.currentServerVersion === 'number') {
    await rowSync.advanceReplicatedRowServerVersion(
      db,
      queuedMutation.tableName,
      String(queuedMutation.rowId),
      error.currentServerVersion
    );
  }
  const jitter = Math.floor(Math.random() * 10_000);
  this.containmentUntil = now + error.retryAfterMs + jitter;
  dispatchContainment(this.logger, this.containmentUntil);
  results.push({
    success: false,
    tableName: queuedMutation.tableName,
    operation: queuedMutation.operation,
    rowsAffected: 0,
    duration: 0,
    error: error.message,
  });
  blockedDependencyIds.add(queuedMutation.id);
  continue; // remaining RPC mutations hit the pass gate above
}
```

4. On any successful upload of an RPC mutation, clear the pause: `this.containmentUntil = null;` (place next to the existing success bookkeeping at ~line 261, guarded by `if (queuedMutation.rpc !== undefined)`).
5. If `skipped` is a typed object, extend its type with `containment?: number`.

- [ ] **Step 4: Run the tests, then the full package suite, then rebuild**

```bash
cd packages/replication && pnpm vitest run && pnpm --filter @myk9/replication build
```

Expected: PASS; build clean (app tests consume dist).

- [ ] **Step 5: Commit**

```bash
git add packages/replication/src/MutationUploadRunner.ts packages/replication/src/mutation-upload-events.ts packages/replication/src/MutationManager.test.ts
git commit -m "feat(replication): pause RPC uploads under RS429 containment (MYK9-115)"
```

---

### Task 5: At-show containment banner

**Files:**

- Modify: `apps/myk9show/src/providers/ReplicationSyncProvider.tsx` (already listens for `replication:sync-failed`; add the containment listener beside it)
- Create: `apps/myk9show/src/hooks/useReplicationContainment.ts`
- Modify: `apps/myk9show/src/features/at-show/slots/atShowLayoutSlotComponents.tsx` (banner slot)
- Test: `apps/myk9show/src/hooks/useReplicationContainment.test.ts`, extend `apps/myk9show/src/features/at-show/slots/atShowLayoutSlotComponents.test.tsx`

**Interfaces:**

- Consumes: `replication:containment` window event `{ detail: { until: number } }` (Task 4).
- Produces: `useReplicationContainment(): { active: boolean; until: number | null }` — re-renders on the event and self-clears when `until` passes (single `setTimeout`, cleaned up on unmount).

- [ ] **Step 1: Write the failing hook test** (use the custom render/harness from `src/test/utils/testUtils.tsx`; fake timers)

```typescript
it('activates on replication:containment and self-clears after until', () => {
  const { result } = renderHook(() => useReplicationContainment());
  expect(result.current.active).toBe(false);
  act(() => {
    window.dispatchEvent(
      new CustomEvent('replication:containment', { detail: { until: Date.now() + 5_000 } })
    );
  });
  expect(result.current.active).toBe(true);
  act(() => vi.advanceTimersByTime(6_000));
  expect(result.current.active).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure** — `cd apps/myk9show && pnpm vitest run src/hooks/useReplicationContainment.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement the hook**

```typescript
import { useEffect, useState } from 'react';

interface ContainmentState {
  active: boolean;
  until: number | null;
}

/**
 * Tracks the replication layer's MYK9-115 containment pause. Scores stay
 * queued locally; this only drives the at-show "sync paused" banner.
 */
export function useReplicationContainment(): ContainmentState {
  const [until, setUntil] = useState<number | null>(null);

  useEffect(() => {
    const onContainment = (event: Event) => {
      const detail = (event as CustomEvent<{ until: number }>).detail;
      if (typeof detail?.until === 'number') setUntil(detail.until);
    };
    window.addEventListener('replication:containment', onContainment);
    return () => window.removeEventListener('replication:containment', onContainment);
  }, []);

  useEffect(() => {
    if (until === null) return;
    const remaining = until - Date.now();
    if (remaining <= 0) {
      setUntil(null);
      return;
    }
    const timer = setTimeout(() => setUntil(null), remaining);
    return () => clearTimeout(timer);
  }, [until]);

  return { active: until !== null, until };
}
```

- [ ] **Step 4: Banner in the at-show layout slots**

Read `atShowLayoutSlotComponents.tsx` and add a `ContainmentBanner` component rendered in the same slot region as the existing status/offline chrome (match its styling primitives), gated on `useReplicationContainment().active`. Copy (INTENT: calm, not alarming — judges must trust their scores are safe):

> **Score sync paused** — the server asked this device to wait. Your scores are saved here and will sync automatically in about a minute.

Extend `atShowLayoutSlotComponents.test.tsx`: banner absent by default; present after dispatching the containment event (reuse the file's existing render harness).

- [ ] **Step 5: Run tests + typecheck**

```bash
cd apps/myk9show && pnpm vitest run src/hooks/useReplicationContainment.test.ts src/features/at-show/slots/atShowLayoutSlotComponents.test.tsx
pnpm typecheck
```

Expected: PASS. (If typecheck errors mention `Database[...]` types, rebuild `pnpm --filter @myk9/supabase build` first — stale-dist trap.)

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/hooks/useReplicationContainment.ts apps/myk9show/src/hooks/useReplicationContainment.test.ts apps/myk9show/src/features/at-show/slots/atShowLayoutSlotComponents.tsx apps/myk9show/src/features/at-show/slots/atShowLayoutSlotComponents.test.tsx apps/myk9show/src/providers/ReplicationSyncProvider.tsx
git commit -m "feat(at-show): containment sync-paused banner (MYK9-115)"
```

(Only include `ReplicationSyncProvider.tsx` if a change was actually needed — the hook listens on `window` directly; touch the provider only if the event must be re-broadcast for non-DOM consumers, which Step 4's reading will determine. If unneeded, drop it from the commit.)

---

### Task 6: Health check + admin rearm button

**Files:**

- Modify: `apps/myk9show/supabase/functions/_shared/systemHealthChecks.ts` (+ its `.test.ts`)
- Modify: `apps/myk9show/src/features/admin-system-health/systemHealthTypes.ts`, `systemHealthSelectors.ts` (+ tests), and the health page component that renders check rows (found via `grep -rn "useSystemHealthSnapshots" apps/myk9show/src --include="*.tsx"`)
- Create: `apps/myk9show/src/features/admin-system-health/RearmContainmentButton.tsx` (+ test)

**Interfaces:**

- Consumes: probe fact `ringside_containment` (Task 1): `{ state, tripped_at, trip_conflict_delta, trip_reason, trip_conflicts_per_minute, calibrated, last_sample_at }`; RPC `ringside_containment_rearm(p_reason)` → `{ state, was_contained }`.
- Produces: a `ringside_containment` check in the snapshot (`ok` when armed, `fail` when contained, `warn` when the fact is missing/stale), and a site-admin rearm button on the failing row.

- [ ] **Step 1: Failing edge-check test** — in `systemHealthChecks.test.ts`, mirror the existing `ringside_conflicts` check tests: armed fact → `ok`; `state: 'contained'` → `fail` with message containing `trip_reason` and `tripped_at`; fact absent → `warn`.
- [ ] **Step 2: Implement the check** in `systemHealthChecks.ts` following the adjacent check's exact shape (name `ringside_containment`; no thresholds — state maps directly).
- [ ] **Step 3: Failing UI test** — `RearmContainmentButton.test.tsx` (custom render from `testUtils.tsx`): renders only for the contained check row; opens confirm dialog with required reason input; calls `supabase.rpc('ringside_containment_rearm', { p_reason })` once (mock), disables while pending via `useRef` in-flight latch (repo pattern: in-flight guard via useRef + onSettled; per-mount AlertDialog latch #1343); surfaces success/failure toast.
- [ ] **Step 4: Implement button + wire into the health row component**; invalidate the snapshots query on success so the row re-renders after the next probe.
- [ ] **Step 5: Run** the three test files + `pnpm typecheck`. New RPC not in generated types: cast the rpc name like `WaitlistFormLanding` does (repo precedent) — CI is authoritative for the TS2345 class.
- [ ] **Step 6: Commit** — `feat(admin): ringside containment health check + rearm (MYK9-115)`.

---

### Task 7: Runbook, docs index, deploy, Linear

**Files:**

- Modify: the operator runbook (locate: `grep -rln "ringside_update_entry" docs/runbooks/ docs/*.md` — the emergency-REVOKE procedure lives there; extend that section)
- Modify: `docs/README.md` (this plan is already registered; flip nothing yet)
- Modify: `docs/qa/findings.md` (`QA-INFRA-OCC-STORM-037` — reference this work; do NOT close it: closure requires the G9 evidence per the issue)

- [ ] **Step 1: Runbook section** — "Ringside containment tripped": read `/admin/health` row → identify wedged device via PostgREST logs (filter `ringside_update_entry`, inspect caller identity/user-agent) → remove/park the device → rearm via the admin button (or `select public.ringside_containment_rearm('reason')` from the SQL editor as fallback) → watch the next sampler tick stays armed. Emergency `REVOKE EXECUTE ... FROM authenticated` documented as LAST resort, unchanged.
- [ ] **Step 2: Full gates** — from the worktree: `pnpm typecheck && pnpm lint`, `cd apps/myk9show && pnpm test` (respect the 30s hang rule), `pnpm qa:sql:behavioral:test`.
- [ ] **Step 3: `db push` both migrations** (db-push skill; verify `Deployed`/applied list names both files; then live-verify ACLs: `relacl` for both tables, `proacl` for both new functions, and `select jobname from cron.job` shows `ringside-containment-sampler`).
- [ ] **Step 4: Post-push live smoke (read-only + rolled back)** — rolled-back psql txn: force `contained`, call the RPC with a stale version as an authorized fixture caller, assert SQLSTATE `RS429`; rollback. Then confirm the real row is `armed` and `system_health_probe()` (as service role) returns the containment object.
- [ ] **Step 5: PR** per the 8-step workflow (Codex review is ON — this changes gates/state); merge from the main repo dir; after merge flip this plan's Status to Complete, `git mv` to `docs/archive/`, drop the index row.
- [ ] **Step 6: Linear comment on MYK9-115** — what changed, tests run, PR link, and the explicit list of criteria still OPEN: calibration (G9), controlled smoke + rehearsal evidence, reconcile-after-rearm proof, runbook sign-off/closure of QA-INFRA-OCC-STORM-037. Keep the issue In Progress.

---

## Out of scope (from the approved spec)

Per-caller blocking, auto-rearm, 40001-contract changes, compute upgrades, and any `ringside_update_entry` grant change.
