-- MYK9-236 — make the hosted service_role table-grant contract observable.
--
-- The local behavioural contract runs against a migrations-only rebuild, which
-- does not reproduce Supabase's hosted ALTER DEFAULT PRIVILEGES. The full
-- health path is therefore authoritative for service_role: it reads every
-- public table's applied privileges and lets the runner compare them with the
-- contract. The five-minute continuous path remains catalog-scan free.

begin;

-- Re-emitted from 20260805120000_enforce_sign_in_email_invariant.sql.
-- Only the expensive branch changes: it enriches the zero-argument probe's
-- existing applied_acl_grants object with deployed service_role table facts.
create or replace function public.system_health_probe(p_include_expensive boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_facts jsonb;
begin
  if p_include_expensive then
    v_facts := public.system_health_probe();

    return v_facts || jsonb_build_object(
      'sign_in_email_drift', public.sign_in_email_drift(),
      'applied_acl_grants', coalesce(v_facts->'applied_acl_grants', '{}'::jsonb)
        || jsonb_build_object(
          'service_role_tables', (
            select coalesce(jsonb_agg(t order by t->>'name'), '[]'::jsonb)
            from (
              select jsonb_build_object(
                'name', c.relname,
                'privs', array_to_string(
                  array(
                    select p.privilege
                    from unnest(
                      array[
                        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
                        'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
                      ]
                    ) as p(privilege)
                    where has_table_privilege(
                      'service_role', format('public.%I', c.relname), p.privilege
                    )
                  ), ','
                )
              ) as t
              from pg_class c
              where c.relnamespace = 'public'::regnamespace
                and c.relkind = 'r'
            ) sub
          )
        )
    );
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
    'sign_in_email_drift', public.sign_in_email_drift(),
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
  'Read-only health facts for MYK9-157 and MYK9-236. The cheap path omits catalog-wide ACL scans; the full path adds applied service_role table privileges to applied_acl_grants and preserves sign-in email drift facts.';

revoke all on function public.system_health_probe(boolean) from public;
revoke all on function public.system_health_probe(boolean) from anon;
revoke all on function public.system_health_probe(boolean) from authenticated;
grant execute on function public.system_health_probe(boolean) to service_role;

commit;

notify pgrst, 'reload schema';
