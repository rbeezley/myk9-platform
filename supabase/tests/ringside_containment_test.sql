-- MYK9-115 trip / contain / rearm semantics for ringside OCC admission control.
--
-- These objects shipped as catch-up migrations (20260731190000, 20260731200000)
-- after being applied to the live project out of band, so they reached main with
-- no behavioural coverage at all. This is that coverage.
--
-- Sections:
--   A. grant posture — clients cannot see or drive the breaker
--   B. seed row — provisional config, armed
--   C. sampler — below threshold, above threshold, and while already contained
--   D. rearm — non-admin denied, site admin succeeds, idempotent no-op
--   E. RS429 gate — a CONFLICTING call is contained; a version-CORRECT one is not
--
-- Fixtures and claims are transaction-local and roll back.

begin;

-- ===========================================================================
-- A. Grant posture: clients must not see containment internals.
-- ===========================================================================
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
  -- authenticated MUST keep EXECUTE: PostgREST needs it to reach the function
  -- at all, and the authorization is the is_site_admin() gate in the body.
  -- Revoking this does not harden anything, it just breaks the admin button.
  if not has_function_privilege('authenticated', 'public.ringside_containment_rearm(text)', 'execute') then
    raise exception 'FAIL authenticated cannot reach rearm (internal gate expects to run)';
  end if;
  if has_function_privilege('anon', 'public.ringside_containment_sample()', 'execute')
     or has_function_privilege('authenticated', 'public.ringside_containment_sample()', 'execute') then
    raise exception 'FAIL sampler is client-executable';
  end if;
  -- The audit table's identity sequence picked up authenticated=rwU from this
  -- project's ALTER DEFAULT PRIVILEGES until 20260801120000 revoked it. A client
  -- with setval() on the audit sequence can reorder the breaker's own history.
  if has_sequence_privilege('anon', 'public.ringside_containment_audit_id_seq', 'usage')
     or has_sequence_privilege('authenticated', 'public.ringside_containment_audit_id_seq', 'usage')
     or has_sequence_privilege('authenticated', 'public.ringside_containment_audit_id_seq', 'update') then
    raise exception 'FAIL containment audit sequence is client-writable';
  end if;
  raise notice 'PASS containment internals are not client-reachable';
end;
$$;

-- ===========================================================================
-- B. Seed row exists and starts armed with the provisional config.
-- ===========================================================================
do $$
declare r public.ringside_containment;
begin
  select * into strict r from public.ringside_containment;
  if r.state <> 'armed' or r.trip_conflicts_per_minute <> 300
     or r.backpressure_ms <> 250 or r.calibrated then
    raise exception 'FAIL seed row wrong: % % % %',
      r.state, r.trip_conflicts_per_minute, r.backpressure_ms, r.calibrated;
  end if;
  raise notice 'PASS breaker seeds armed with provisional thresholds';
end;
$$;

-- The live row may be mid-incident when CI runs against a restored database.
-- Normalise to armed so the sampler assertions below start from a known state.
update public.ringside_containment
   set state = 'armed', tripped_at = null, trip_conflict_delta = null, trip_reason = null;
delete from public.ringside_containment_audit;

-- ===========================================================================
-- C. Sampler.
-- ===========================================================================

-- Below threshold: cursor advances, state stays armed, no audit row.
--
-- Every read of the sequence coalesces: `pg_sequences.last_value` is NULL until
-- the first nextval(), and on a migrations-only rebuild it has never been
-- called. The probe function coalesces for the same reason. Reading it raw
-- passes against the live database and fails only in CI.
update public.ringside_containment
   set last_seq = (select coalesce(last_value, 0) from pg_sequences
                    where schemaname = 'public' and sequencename = 'ringside_conflict_seq'),
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
  if r.last_seq <> (select coalesce(last_value, 0) from pg_sequences
                     where schemaname = 'public' and sequencename = 'ringside_conflict_seq') then
    raise exception 'FAIL sampler did not advance cursor';
  end if;
  if exists (select 1 from public.ringside_containment_audit) then
    raise exception 'FAIL audit written below threshold';
  end if;
  raise notice 'PASS 10 conflicts/min leaves the breaker armed';
end;
$$;

-- Above threshold: trips, records metadata, writes exactly one audit row.
update public.ringside_containment
   set last_sample_at = now() - interval '1 minute';
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
  raise notice 'PASS 301 conflicts/min trips the breaker and is audited';
end;
$$;

-- While already contained: the cursor still advances but the trip is not
-- re-audited. A breaker that re-audits every minute buries its own history.
update public.ringside_containment
   set last_sample_at = now() - interval '1 minute';
select nextval('public.ringside_conflict_seq') from generate_series(1, 400);
select public.ringside_containment_sample();
do $$
begin
  if (select count(*) from public.ringside_containment_audit where event = 'trip') <> 1 then
    raise exception 'FAIL re-trip audit while already contained';
  end if;
  raise notice 'PASS an already-contained breaker does not re-audit';
end;
$$;

-- ===========================================================================
-- D. Rearm.
-- ===========================================================================
insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000000115011', 'Site', 'Admin',
   '00000000-0000-0000-0000-000000115101'),
  ('00000000-0000-0000-0000-000000115012', 'Not', 'Admin',
   '00000000-0000-0000-0000-000000115102');

insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000115011', r.id, true,
       '00000000-0000-0000-0000-000000115101'
from public.roles r where r.name = 'site_admin';

-- Non-admin is denied by the in-body gate, not by the grant.
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
  raise notice 'PASS a signed-in non-admin cannot rearm the breaker';
end;
$$;

-- Site admin: state armed, cursor reset, trip metadata cleared, audit written.
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
  -- Resetting the cursor is what stops the stale window insta-retripping the
  -- breaker on the very next sample.
  if r.last_seq <> (select coalesce(last_value, 0) from pg_sequences
                     where schemaname = 'public' and sequencename = 'ringside_conflict_seq') then
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

  -- Idempotent: rearming an armed breaker succeeds and writes no audit.
  result := public.ringside_containment_rearm('noop');
  if (result->>'was_contained')::boolean is not false then
    raise exception 'FAIL no-op rearm reported was_contained';
  end if;
  if (select count(*) from public.ringside_containment_audit where event = 'rearm') <> 1 then
    raise exception 'FAIL no-op rearm wrote audit';
  end if;
  raise notice 'PASS site admin rearm clears state, resets the cursor, and is idempotent';
end;
$$;

-- ===========================================================================
-- E. The RS429 gate in ringside_update_entry.
--
-- This is the assertion the whole client change (Tasks 3-5) depends on: while
-- contained, a CONFLICTING call raises RS429 with the authoritative version
-- still in DETAIL — and a version-CORRECT call is untouched. That second half
-- is the blast-radius property, and the reason the gate sits at the conflict
-- sites rather than at the top of the function.
-- ===========================================================================
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
insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
  payment_status, entry_fee
) values
  ('00000000-0000-0000-0000-000000115033', '00000000-0000-0000-0000-000000115024',
   '00000000-0000-0000-0000-000000115023', '00000000-0000-0000-0000-000000115021',
   '00000000-0000-0000-0000-000000115022', '00000000-0000-0000-0000-000000115011',
   'confirmed', 'paid', 25);

-- Force contained directly; the sampler is already proven above.
-- backpressure_ms = 0 keeps the test fast (the gate sleeps before raising).
update public.ringside_containment
   set state = 'contained', tripped_at = now(),
       trip_conflict_delta = 999, trip_reason = 'gate test',
       backpressure_ms = 0;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000115101', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000115101","role":"authenticated"}', true);

do $$
declare
  v_version integer;
  v_new_version integer;
  v_detail text;
  v_sqlstate text;
begin
  select version into strict v_version
    from public.entries where id = '00000000-0000-0000-0000-000000115033';

  -- A version-CORRECT call must succeed even while contained. If this ever
  -- fails, the breaker has stopped being a conflict shed and become an outage.
  v_new_version := public.ringside_update_entry(
    '00000000-0000-0000-0000-000000115033',
    jsonb_build_object('check_in_status', 'at-gate'),
    v_version
  );
  if v_new_version is null then
    raise exception 'FAIL version-correct write was blocked while contained';
  end if;

  -- A CONFLICTING call is contained: RS429, with the authoritative version
  -- still in DETAIL so the client can advance its OCC token while it waits.
  begin
    perform public.ringside_update_entry(
      '00000000-0000-0000-0000-000000115033',
      jsonb_build_object('check_in_status', 'in-ring'),
      v_version -- deliberately stale now
    );
    raise exception 'FAIL contained conflicting write was not rejected';
  exception
    when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_detail = pg_exception_detail;
      if v_sqlstate <> 'RS429' then
        raise exception 'FAIL expected RS429 while contained, got %', v_sqlstate;
      end if;
      if v_detail is null or v_detail !~ '^[0-9]+$' then
        raise exception 'FAIL RS429 did not carry the current version in DETAIL: %', v_detail;
      end if;
  end;
  raise notice 'PASS contained: conflicting write gets RS429 + version, correct write still lands';
end;
$$;

-- Armed again: the same conflicting write must return to plain 40001, or the
-- client would treat an ordinary lost race as a reason to pause the outbox.
reset role;
update public.ringside_containment set state = 'armed';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000115101","role":"authenticated"}', true);

do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.ringside_update_entry(
      '00000000-0000-0000-0000-000000115033',
      jsonb_build_object('check_in_status', 'in-ring'),
      1 -- stale
    );
    raise exception 'FAIL armed conflicting write was not rejected';
  exception
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate <> '40001' then
        raise exception 'FAIL expected 40001 when armed, got %', v_sqlstate;
      end if;
  end;
  raise notice 'PASS armed: a conflict is an ordinary 40001, not a containment pause';
end;
$$;

rollback;
