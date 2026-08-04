-- MYK9-157 — refresh cheap health facts continuously and add a real Run now.
--
-- The existing zero-argument system_health_probe() remains the full probe used
-- by older callers. The boolean overload avoids running catalog-wide ACL scans
-- on the continuous path while preserving the same raw-facts contract for the
-- nightly/full path.

begin;

create or replace function public.system_health_probe(p_include_expensive boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_include_expensive then
    return public.system_health_probe();
  end if;

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
    'cron_jobs', (
      select coalesce(jsonb_agg(j order by j->>'jobname'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'jobname',          job.jobname,
          'active',           job.active,
          'dispatches_http',  (position('net.http_post' in coalesce(job.command, '')) > 0),
          'last_status',      lr.status,
          'last_start',       lr.start_time,
          'last_end',         lr.end_time,
          'last_message',     lr.return_message
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

comment on function public.system_health_probe(boolean) is
  'Read-only health facts for MYK9-157. p_include_expensive=false omits catalog-wide ACL scans for the continuous runner; true delegates to the full zero-argument probe.';

revoke all on function public.system_health_probe(boolean) from public;
revoke all on function public.system_health_probe(boolean) from anon;
revoke all on function public.system_health_probe(boolean) from authenticated;
grant execute on function public.system_health_probe(boolean) to service_role;

-- The browser calls this RPC, never the Edge Function secret. pg_net queues the
-- same full run used by the nightly schedule and returns a request id so the
-- client can poll for the new snapshot.
create or replace function public.run_system_health_check_now()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  edge_function_base_url text;
  service_role_key text;
  health_cron_secret text;
  request_id bigint;
  run_token uuid := gen_random_uuid();
begin
  if not public.is_site_admin() then
    raise exception 'Not authorized to run system health checks'
      using errcode = '42501';
  end if;

  select decrypted_secret into edge_function_base_url
  from vault.decrypted_secrets
  where name = 'edge_function_base_url';

  select decrypted_secret into service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  select decrypted_secret into health_cron_secret
  from vault.decrypted_secrets
  where name = 'health_cron_secret';

  if nullif(edge_function_base_url, '') is null
     or nullif(service_role_key, '') is null
     or nullif(health_cron_secret, '') is null then
    raise exception 'Health check trigger is not configured';
  end if;

  select net.http_post(
    url := edge_function_base_url || '/cron-health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key,
      'x-function-secret', health_cron_secret,
      'x-health-check-mode', 'full',
      'x-health-run-token', run_token::text
    ),
    body := '{}'::jsonb
  ) into request_id;

  return jsonb_build_object('request_id', request_id, 'run_token', run_token);
end;
$$;

comment on function public.run_system_health_check_now() is
  'Site-admin-gated, asynchronous full System Health run. Queues cron-health-check through Vault-backed pg_net without exposing HEALTH_CRON_SECRET to the browser.';

revoke all on function public.run_system_health_check_now() from public;
revoke all on function public.run_system_health_check_now() from anon;
grant execute on function public.run_system_health_check_now() to authenticated;
grant execute on function public.run_system_health_check_now() to service_role;

commit;

-- Replace the once-daily dispatch with an explicitly full nightly run and add
-- the cheap continuous run. Both jobs use the same Vault-backed secret path.
select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-health-check';

select cron.schedule(
  'daily-health-check',
  '0 7 * * *',
  $daily_health_check$
  do $health_check$
  declare
    edge_function_base_url text;
    service_role_key text;
    health_cron_secret text;
  begin
    select decrypted_secret into edge_function_base_url
    from vault.decrypted_secrets where name = 'edge_function_base_url';
    select decrypted_secret into service_role_key
    from vault.decrypted_secrets where name = 'service_role_key';
    select decrypted_secret into health_cron_secret
    from vault.decrypted_secrets where name = 'health_cron_secret';
    perform net.http_post(
      url := edge_function_base_url || '/cron-health-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key,
        'x-function-secret', health_cron_secret,
        'x-health-check-mode', 'full'
      ),
      body := '{}'::jsonb
    );
  end
  $health_check$;
  $daily_health_check$
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'continuous-health-check';

select cron.schedule(
  'continuous-health-check',
  '*/5 * * * *',
  $continuous_health_check$
  do $health_check$
  declare
    edge_function_base_url text;
    service_role_key text;
    health_cron_secret text;
  begin
    select decrypted_secret into edge_function_base_url
    from vault.decrypted_secrets where name = 'edge_function_base_url';
    select decrypted_secret into service_role_key
    from vault.decrypted_secrets where name = 'service_role_key';
    select decrypted_secret into health_cron_secret
    from vault.decrypted_secrets where name = 'health_cron_secret';
    perform net.http_post(
      url := edge_function_base_url || '/cron-health-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key,
        'x-function-secret', health_cron_secret,
        'x-health-check-mode', 'continuous'
      ),
      body := '{}'::jsonb
    );
  end
  $health_check$;
  $continuous_health_check$
);

notify pgrst, 'reload schema';
