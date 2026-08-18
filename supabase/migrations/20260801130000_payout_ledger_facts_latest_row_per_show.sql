-- Fix the payout_ledger probe facts: latest row per show, and processing-only staleness.
--
-- Codex review of PR #1557 caught two real defects in the version of these facts
-- added by 20260731210000. Both come from treating show_payouts as a table of
-- payouts, when it is really a table of payout ATTEMPTS.
--
-- 1. A failed row is a normal transient state, not a permanent verdict.
--    cron-process-payouts::recoverStaleProcessing deliberately sets
--    status='failed' so "the unique index reopens for a retry row" — the retry
--    is a NEW row and the failed one stays forever. Counting every historical
--    failed row therefore pins the board red for the rest of time after a single
--    transient failure that later succeeded. Correct question: for each show, is
--    its MOST RECENT attempt failed? Hence `distinct on (show_id) ... order by
--    created_at desc`, which also makes `total` mean "shows with payouts" — the
--    right denominator for "N of M payouts failed".
--
-- 2. Staleness must key on updated_at, and only for 'processing'.
--    A 'pending' row legitimately sits for days: when a club's Stripe account is
--    not yet payouts_enabled the cron inserts pending and waits for onboarding.
--    Ageing those off created_at reports ordinary waiting as a health failure.
--    Only 'processing' — a claimed row mid-send — can be stuck, and its claim is
--    stamped on updated_at by the set_updated_at trigger.
--
--    The payout cron already learned exactly this: recoverStaleProcessing carries
--    the comment "created_at would false-flag a row that sat pending for days
--    before being claimed minutes ago (review finding #1)". The same mistake was
--    repeated here against the same table. Key payout staleness on updated_at.
--
-- Recreates system_health_probe() wholesale per the rotation convention. Body is
-- unchanged from 20260731210000 except the 'payout_ledger' key.

begin;

create or replace function public.system_health_probe()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    'ringside_conflict_counter', (
      select coalesce(last_value, 0)
      from pg_sequences
      where schemaname = 'public' and sequencename = 'ringside_conflict_seq'
    ),
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
    -- One row per show: its most recent attempt. See the header for why.
    'payout_ledger', (
      with latest as (
        select distinct on (p.show_id) p.*
        from public.show_payouts p
        order by p.show_id, p.created_at desc
      )
      select jsonb_build_object(
        'total',               count(*),
        'failed',              count(*) filter (where l.status = 'failed'),
        'failed_amount_cents', coalesce(sum(l.amount_cents) filter (where l.status = 'failed'), 0),
        'in_flight',           count(*) filter (where l.status in ('pending', 'processing')),
        -- Only a CLAIMED row can be stuck, and its claim is stamped on
        -- updated_at. Pending rows are excluded entirely: waiting on Stripe
        -- onboarding is expected, not a failure.
        'stale_in_flight',     count(*) filter (
                                 where l.status = 'processing'
                                   and l.updated_at < now() - interval '26 hours'
                               ),
        'oldest_in_flight_at', min(l.updated_at) filter (where l.status = 'processing'),
        'last_completed_at',   max(l.completed_at) filter (where l.status = 'completed'),
        'failure_reasons', (
          select coalesce(jsonb_agg(distinct f.failure_reason), '[]'::jsonb)
          from latest f
          where f.status = 'failed' and f.failure_reason is not null
        )
      )
      from latest l
    ),
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
          'dispatches_http', (position('net.http_post' in coalesce(job.command, '')) > 0),
          'last_status',  lr.status,
          'last_start',   lr.start_time,
          'last_end',     lr.end_time,
          'last_message', lr.return_message
        ) as j
        from cron.job job
        left join lateral (
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
  'Read-only health facts (scheduled cron jobs + last-run outcome, newest applied migration, ringside OCC conflict counter, MYK9-115 containment breaker state, payout-ledger outcomes as the LATEST attempt per show, applied anon table/column/default ACLs) for the cron-health-check runner. SECURITY DEFINER so service_role can read cron.* / supabase_migrations.* / pg_default_acl which PostgREST does not expose. Runs no health logic; the ok/warn/fail mapping lives in the runner.';

revoke all on function public.system_health_probe() from public;
revoke all on function public.system_health_probe() from anon;
revoke all on function public.system_health_probe() from authenticated;
grant execute on function public.system_health_probe() to service_role;

commit;

notify pgrst, 'reload schema';
