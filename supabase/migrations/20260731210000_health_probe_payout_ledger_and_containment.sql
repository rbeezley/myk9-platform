-- Add payout-ledger and ringside-containment facts to system_health_probe().
--
-- TICKET-2 (payout check can never fail). The `payout_cron` check reads pg_cron's
-- job_run_details, which for a net.http_post job reports 'succeeded' the moment the
-- request is ENQUEUED. It can therefore never go red on a payout run that dispatched
-- and then failed. The runner keeps that check honest (it now reports Unverified, not
-- OK) and gains a SECOND, outcome-based check that reads the payout ledger itself:
-- `public.show_payouts` carries the terminal state of every transfer
-- (pending | processing | completed | failed) plus failure_reason. A failed row, or a
-- row stuck non-terminal past the nightly window, is the signal the cron check cannot
-- produce.
--
-- TICKET-1 (ringside conflict counter). The counter is NOT broken — see the 2026-07-28
-- to 2026-07-31 storm, 34.4M genuine nextval() calls at the two authorized OCC-conflict
-- sites, ended by the MYK9-115 admission-control breaker tripping at 00:27Z on 07-31.
-- What the check lacked was context: it reported a 24h delta with no rate and no
-- awareness that ringside scoring is currently being throttled server-side. The breaker
-- state is the single most operationally important ringside fact and it was not on the
-- board at all. This adds it as a raw fact; the ok/warn/fail mapping stays in the
-- runner's unit-tested TS (_shared/systemHealthChecks.ts), per this function's design.
--
-- Depends on 20260731190000_ringside_containment_state.sql, the catch-up migration that
-- finally commits the MYK9-115 objects. They had been applied to the live database out
-- of band, with no schema_migrations row and no .sql on main; a static reference here
-- would have been unbuildable on a migrations-only rebuild. That is fixed, so this reads
-- public.ringside_containment directly — no to_regclass guard, no dynamic SQL.
--
-- Recreates system_health_probe() wholesale per the established rotation convention (a
-- NEW migration, never an in-place edit). Body is unchanged from
-- 20260725190000_health_probe_anon_grants.sql except the two added keys.

begin;

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
    -- MYK9-115 admission-control breaker. `state = 'contained'` means ringside
    -- scoring writes are being throttled right now; `calibrated = false` means the
    -- threshold that tripped it is still provisional. Both belong on the board.
    'ringside_containment', (
      select jsonb_build_object(
        'state',                     c.state,
        'tripped_at',                c.tripped_at,
        'trip_conflict_delta',       c.trip_conflict_delta,
        'trip_reason',               c.trip_reason,
        'trip_conflicts_per_minute', c.trip_conflicts_per_minute,
        'backpressure_ms',           c.backpressure_ms,
        'calibrated',                c.calibrated,
        'last_sample_at',            c.last_sample_at
      )
      from public.ringside_containment c
    ),
    -- TICKET-2: outcome facts for the payout ledger. `completed` and `failed` are
    -- the terminal states; `pending` and `processing` are in flight. A row that is
    -- still in flight long after its scheduled_date means a dispatched run did not
    -- finish — exactly the failure the cron check renders green.
    'payout_ledger', (
      select jsonb_build_object(
        'total',                count(*),
        'failed',               count(*) filter (where p.status = 'failed'),
        'failed_amount_cents',  coalesce(sum(p.amount_cents) filter (where p.status = 'failed'), 0),
        'in_flight',            count(*) filter (where p.status in ('pending', 'processing')),
        'stale_in_flight',      count(*) filter (
                                  where p.status in ('pending', 'processing')
                                    and p.created_at < now() - interval '26 hours'
                                ),
        'oldest_in_flight_at',  min(p.created_at) filter (where p.status in ('pending', 'processing')),
        'last_completed_at',    max(p.completed_at) filter (where p.status = 'completed'),
        'failure_reasons', (
          select coalesce(jsonb_agg(distinct f.failure_reason), '[]'::jsonb)
          from public.show_payouts f
          where f.status = 'failed' and f.failure_reason is not null
        )
      )
      from public.show_payouts p
    ),
    -- Applied anon ACLs across schema public. `acl::text` renders as
    -- 'anon=arwdDxtm/postgres'; `privs` is the part between '=' and '/', so the
    -- runner compares privilege LETTERS (r = SELECT, a = INSERT, w = UPDATE,
    -- d = DELETE, …) rather than parsing aclitem itself.
    'anon_grants', jsonb_build_object(
      'tables', (
        select coalesce(jsonb_agg(t order by t->>'name'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'name',  c.relname,
            'kind',  c.relkind::text,
            'privs', split_part(split_part(acl::text, '=', 2), '/', 1)
          ) as t
          from pg_class c
          cross join lateral unnest(coalesce(c.relacl, '{}'::aclitem[])) as acl
          where c.relnamespace = 'public'::regnamespace
            and c.relkind in ('r', 'p', 'v', 'm')
            and split_part(acl::text, '=', 1) = 'anon'
        ) sub
      ),
      'columns', (
        select coalesce(jsonb_agg(x order by x->>'name', x->>'column'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'name',   c.relname,
            'column', a.attname,
            'privs',  split_part(split_part(acl::text, '=', 2), '/', 1)
          ) as x
          from pg_class c
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          cross join lateral unnest(coalesce(a.attacl, '{}'::aclitem[])) as acl
          where c.relnamespace = 'public'::regnamespace
            and split_part(acl::text, '=', 1) = 'anon'
        ) sub
      ),
      -- Any surviving ALTER DEFAULT PRIVILEGES that would hand anon privileges on
      -- objects created later. Expected to list only the supabase_admin grantor.
      'defaults', (
        select coalesce(jsonb_agg(d order by d->>'grantor', d->>'objtype'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'grantor', da.defaclrole::regrole::text,
            'objtype', da.defaclobjtype::text,
            'privs',   split_part(split_part(acl::text, '=', 2), '/', 1)
          ) as d
          from pg_default_acl da
          join pg_namespace n on n.oid = da.defaclnamespace
          cross join lateral unnest(coalesce(da.defaclacl, '{}'::aclitem[])) as acl
          where n.nspname = 'public'
            and split_part(acl::text, '=', 1) = 'anon'
        ) sub
      )
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
  'Read-only health facts (scheduled cron jobs + last-run outcome, newest applied migration, ringside OCC conflict counter, MYK9-115 containment breaker state, payout-ledger outcomes, applied anon table/column/default ACLs) for the cron-health-check runner. SECURITY DEFINER so service_role can read cron.* / supabase_migrations.* / pg_default_acl which PostgREST does not expose. Runs no health logic; the ok/warn/fail mapping lives in the runner. Same monitoring family as the operator_alerts surface (MP-08).';

-- Functions default to EXECUTE for PUBLIC — revoke, then grant only the runner.
-- anon and authenticated are named explicitly: this is SECURITY DEFINER over cron.*,
-- supabase_migrations.*, pg_default_acl and now the payout ledger, so "no client role
-- may execute it" has to be a written decision, not an omission.
revoke all on function public.system_health_probe() from public;
revoke all on function public.system_health_probe() from anon;
revoke all on function public.system_health_probe() from authenticated;
grant execute on function public.system_health_probe() to service_role;

commit;

-- Reload PostgREST schema cache so the updated RPCs resolve.
notify pgrst, 'reload schema';
