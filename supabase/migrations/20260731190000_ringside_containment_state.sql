-- MYK9-115: ringside OCC admission control — persisted containment state.
-- Design: docs/superpowers/specs/2026-07-30-ringside-occ-admission-control-design.md
-- Plan:   docs/plan-ringside-occ-admission-control.md (Task 1)
--
-- A doomed conflict call's RAISE rolls back any table write it makes, so the
-- trip decision must be made OUTSIDE the failing transactions: a minutely
-- pg_cron sampler reads ringside_conflict_seq, computes the delta, and
-- persists state here. ringside_update_entry (migration B) reads this row.
--
-- CATCH-UP MIGRATION — READ BEFORE EDITING. Every object below already exists in
-- the live project (sojmvhhwsjxmfistvzbe). The plan's SQL was executed directly
-- against the database on or before 2026-07-31 without the migration file ever
-- being committed, so the schema ran ahead of the repository: no row in
-- supabase_migrations.schema_migrations, no .sql on main, and therefore no
-- migration-parsing contract test could see any of it. The breaker was doing real
-- work the whole time — it tripped at 2026-07-31T00:27Z on a measured 2,884
-- conflicts/min and ended a 34.4M-event storm — while being invisible to CI.
--
-- This file closes that gap, so it is written IDEMPOTENTLY (`if not exists`,
-- `on conflict do nothing`, `create or replace`): applying it to the live project
-- must be a no-op, while a migrations-only rebuild must produce the same schema.
-- Verified column-for-column against the live definitions before writing.

begin;

-- 1. State (single row).
create table if not exists public.ringside_containment (
  id boolean primary key default true check (id),
  state text not null default 'armed' check (state in ('armed', 'contained')),
  trip_conflicts_per_minute integer not null default 300,
  backpressure_ms integer not null default 250,
  calibrated boolean not null default false,
  last_seq bigint not null default 0,
  last_sample_at timestamptz not null default now(),
  tripped_at timestamptz,
  trip_conflict_delta bigint,
  trip_reason text
);

comment on table public.ringside_containment is
  'Single-row ringside OCC conflict-storm breaker state (MYK9-115). Written '
  'by ringside_containment_sample() (pg_cron) and ringside_containment_rearm(); '
  'read inside ringside_update_entry. calibrated=false means the threshold is '
  'provisional pending G9 evidence. No client grants by design.';

-- Client isolation. The REVOKEs are mandatory, not stylistic: this project
-- carries ALTER DEFAULT PRIVILEGES granting anon/authenticated full CRUD on new
-- public tables, so omitting them hands clients the breaker's off switch.
revoke all on public.ringside_containment from public;
revoke all on public.ringside_containment from anon;
revoke all on public.ringside_containment from authenticated;
grant select on public.ringside_containment to service_role;

insert into public.ringside_containment (id, last_seq)
values (true, (select coalesce(last_value, 0) from pg_sequences
               where schemaname = 'public' and sequencename = 'ringside_conflict_seq'))
on conflict (id) do nothing;

-- 2. Audit (append-only).
create table if not exists public.ringside_containment_audit (
  id bigint generated always as identity primary key,
  event text not null check (event in ('trip', 'rearm')),
  occurred_at timestamptz not null default now(),
  actor uuid,
  conflict_delta bigint,
  reason text
);

comment on table public.ringside_containment_audit is
  'Append-only trip/rearm history for the ringside OCC breaker (MYK9-115). '
  'actor is auth.uid() for operator rearms, NULL for cron trips.';

revoke all on public.ringside_containment_audit from public;
revoke all on public.ringside_containment_audit from anon;
revoke all on public.ringside_containment_audit from authenticated;
grant select on public.ringside_containment_audit to service_role;

-- 3. Sampler (pg_cron, minutely).
create or replace function public.ringside_containment_sample()
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

comment on function public.ringside_containment_sample() is
  'Minutely pg_cron sampler for the ringside OCC breaker (MYK9-115). Runs '
  'outside the doomed conflict transactions, which is what makes the '
  'persisted trip decision possible.';

revoke all on function public.ringside_containment_sample() from public;
revoke all on function public.ringside_containment_sample() from anon;
revoke all on function public.ringside_containment_sample() from authenticated;
grant execute on function public.ringside_containment_sample() to service_role;

-- 4. Rearm RPC (operator-explicit; MYK9-115 requires no auto-rearm).
create or replace function public.ringside_containment_rearm(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

comment on function public.ringside_containment_rearm(text) is
  'Operator rearm for the ringside OCC breaker (MYK9-115). Site-admin gated '
  'internally; idempotent (rearming an armed breaker is a no-op, no audit). '
  'Resets the sampler cursor to the current sequence value.';

-- authenticated needs EXECUTE to REACH this over PostgREST at all; the
-- authorization is the is_site_admin() gate in the body above, not the grant.
-- Removing the grant does not harden anything, it just breaks the admin button.
revoke all on function public.ringside_containment_rearm(text) from public;
revoke all on function public.ringside_containment_rearm(text) from anon;
grant execute on function public.ringside_containment_rearm(text) to authenticated;
grant execute on function public.ringside_containment_rearm(text) to service_role;

commit;

-- 5. Schedule the sampler. Outside the transaction: cron.schedule commits its own
-- row, and unschedule-then-schedule is how this repo makes a job definition
-- idempotent across re-runs.
select cron.unschedule(jobid)
from cron.job
where jobname = 'ringside-containment-sampler';

select cron.schedule(
  'ringside-containment-sampler',
  '* * * * *',
  $sampler$ SELECT public.ringside_containment_sample(); $sampler$
);

-- Reload PostgREST schema cache so the rearm RPC resolves.
notify pgrst, 'reload schema';
