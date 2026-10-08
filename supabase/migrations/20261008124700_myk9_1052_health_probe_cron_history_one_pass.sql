-- MYK9-1052 — the health probes stop scanning pg_cron's run history once per job.
--
-- On 2026-10-08 the live project (Micro, 1 GB) ran ~12 hours at ~100% CPU, almost all IOwait,
-- with the Disk IO budget depleted. The continuous health check (every 5 minutes) read about
-- 1.1 GB per run: system_health_probe's cron_jobs block looked up each job's last run with a
-- per-job lateral query, and cron.job_run_details (144k rows, 75 MB, owned by supabase_admin, so
-- no index can be added) was seq-scanned once per job. class_results_push_health() scanned it
-- three more times. The table only grew (no retention), so the cost grew until it tipped.
--
-- 1. Both probe functions read the history in one pass (DISTINCT ON jobid).
--    Bodies re-emitted from the latest definitions:
--      system_health_probe()          20260804140000_health_probe_applied_acl_grants.sql
--      system_health_probe(boolean)   20260824210000_service_role_acl_health_probe.sql
--    Only the cron_jobs lookup changes; the jsonb shape the runner parses is unchanged.
-- 2. class_results_push_health() reads its job's runs once.
--    Re-emitted from 20260925194700_myk9_737_class_results_push.sql.
-- 3. An hourly job keeps 7 days of run history, so the table cannot grow back.

begin;

-- 1a.
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
    -- One row per show: its most recent payout attempt.
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
    'applied_acl_grants', jsonb_build_object(
      -- Every public table is emitted, including the empty-grant rows, so a
      -- missing authenticated grant cannot disappear from the snapshot.
      'tables', (
        select coalesce(jsonb_agg(t order by t->>'name'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'name', c.relname,
            'privs', array_to_string(
              array(
                select p.privilege
                from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p(privilege)
                where has_table_privilege(
                  'authenticated', format('public.%I', c.relname), p.privilege
                )
              ), ','
            )
          ) as t
          from pg_class c
          where c.relnamespace = 'public'::regnamespace
            and c.relkind = 'r'
        ) sub
      ),
      -- These privileges are not constrained by RLS. Emit any occurrence for
      -- either API role; the runner turns it red regardless of CRUD status.
      'forbidden_tables', (
        select coalesce(jsonb_agg(x order by x->>'role', x->>'name'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'name', c.relname,
            'role', r.role_name,
            'privs', array_to_string(
              array(
                select p.privilege
                from unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p(privilege)
                where has_table_privilege(
                  r.role_name, format('public.%I', c.relname), p.privilege
                )
              ), ','
            )
          ) as x
          from pg_class c
          cross join (values ('anon'), ('authenticated')) as r(role_name)
          where c.relnamespace = 'public'::regnamespace
            and c.relkind = 'r'
            and exists (
              select 1
              from unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p(privilege)
              where has_table_privilege(
                r.role_name, format('public.%I', c.relname), p.privilege
              )
            )
        ) sub
      ),
      -- Include all three API roles for every public sequence. This captures
      -- service_role's intentional grants and authenticated's withheld UPDATE
      -- on registration_confirmation_seq as applied privileges, not text.
      'sequences', (
        select coalesce(jsonb_agg(s order by s->>'name', s->>'role'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'name', c.relname,
            'role', r.role_name,
            'privs', array_to_string(
              array(
                select p.privilege
                from unnest(array['SELECT', 'UPDATE', 'USAGE']) as p(privilege)
                where has_sequence_privilege(
                  r.role_name, format('public.%I', c.relname), p.privilege
                )
              ), ','
            )
          ) as s
          from pg_class c
          cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
          where c.relnamespace = 'public'::regnamespace
            and c.relkind = 'S'
        ) sub
      ),
      -- `supabase_admin` defaults are the known hosted-role exception. Any
      -- PUBLIC/anon/authenticated sequence default under another grantor means
      -- a revoked default has regrown and must fail the daily snapshot.
      'defaults', (
        select coalesce(jsonb_agg(d order by d->>'grantor', d->>'role'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'grantor', da.defaclrole::regrole::text,
            'role', coalesce(nullif(split_part(acl::text, '=', 1), ''), 'PUBLIC'),
            'objtype', da.defaclobjtype::text,
            'privs', split_part(split_part(acl::text, '=', 2), '/', 1)
          ) as d
          from pg_default_acl da
          join pg_namespace n on n.oid = da.defaclnamespace
          cross join lateral unnest(coalesce(da.defaclacl, '{}'::aclitem[])) as acl
          where n.nspname = 'public'
            and da.defaclobjtype = 'S'
            and coalesce(nullif(split_part(acl::text, '=', 1), ''), 'PUBLIC')
              in ('PUBLIC', 'anon', 'authenticated')
        ) sub
      )
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
        -- One pass over the run history for every job. A lateral lookup per job seq-scanned
        -- cron.job_run_details once per job (there is no usable index and the table belongs
        -- to supabase_admin), about 1 GB of reads per probe once the history reached 144k rows.
        -- The last 8 days only bounds the sort; every job runs at least daily, so its latest run is in it.
        left join (
          select distinct on (d.jobid) d.jobid, d.status, d.start_time, d.end_time, d.return_message
          from cron.job_run_details d
          where d.start_time > now() - interval '8 days' or d.start_time is null
          order by d.jobid, d.start_time desc nulls last, d.runid desc
        ) lr on lr.jobid = job.jobid
      ) sub
    )
  );
end;
$$;

comment on function public.system_health_probe() is
  'Read-only health facts (scheduled cron jobs + last-run outcome, newest applied migration, ringside OCC conflict counter, MYK9-115 containment breaker state, payout-ledger outcomes as the latest attempt per show, applied anon ACLs, and applied authenticated/table/sequence ACLs) for the cron-health-check runner. SECURITY DEFINER so service_role can read cron.* / supabase_migrations.* / pg_default_acl which PostgREST does not expose. Runs no health logic; the ok/warn/fail mapping lives in the runner.';

revoke all on function public.system_health_probe() from public;
revoke all on function public.system_health_probe() from anon;
revoke all on function public.system_health_probe() from authenticated;
grant execute on function public.system_health_probe() to service_role;

-- 1b.
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
        -- One pass over the run history for every job. A lateral lookup per job seq-scanned
        -- cron.job_run_details once per job (there is no usable index and the table belongs
        -- to supabase_admin), about 1 GB of reads per probe once the history reached 144k rows.
        -- The last 8 days only bounds the sort; every job runs at least daily, so its latest run is in it.
        left join (
          select distinct on (d.jobid) d.jobid, d.status, d.start_time, d.end_time, d.return_message
          from cron.job_run_details d
          where d.start_time > now() - interval '8 days' or d.start_time is null
          order by d.jobid, d.start_time desc nulls last, d.runid desc
        ) lr on lr.jobid = job.jobid
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

-- 2.
CREATE OR REPLACE FUNCTION public.class_results_push_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH stuck AS (
    SELECT p.class_id, p.status, p.attempts, p.created_at AS queued_at,
           p.last_attempt_at, p.last_error,
           c.name AS class_name, s.name AS show_name
    FROM private.class_results_push p
    LEFT JOIN public.classes c ON c.id = p.class_id
    LEFT JOIN public.trials t ON t.id = c.trial_id
    LEFT JOIN public.shows s ON s.id = t.show_id
    WHERE p.status = 'failed'
       OR (p.status = 'pending' AND p.created_at < now() - interval '20 minutes')
  ),
  job AS (
    SELECT j.jobid, j.active FROM cron.job j WHERE j.jobname = 'class-results-push-retry'
  ),
  -- This job's runs, read once: the three lookups below each seq-scanned the whole history.
  runs AS MATERIALIZED (
    SELECT d.runid, d.status, d.start_time, d.end_time, d.return_message
    FROM cron.job_run_details d
    WHERE d.jobid = (SELECT jobid FROM job)
  )
  SELECT jsonb_build_object(
    'stuck', (SELECT count(*) FROM stuck),
    'failed', (SELECT count(*) FROM stuck WHERE status = 'failed'),
    'pending', (SELECT count(*) FROM private.class_results_push WHERE status = 'pending'),
    'sample', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.status, x.queued_at), '[]'::jsonb)
      FROM (SELECT * FROM stuck ORDER BY status, queued_at LIMIT 10) x
    ),
    'retry_job', jsonb_build_object(
      'scheduled', EXISTS (SELECT 1 FROM job),
      'active', coalesce((SELECT active FROM job), false),
      'last_success_at', (
        SELECT max(r.end_time) FROM runs r WHERE r.status = 'succeeded'
      ),
      'last_status', (
        SELECT r.status FROM runs r ORDER BY r.start_time DESC NULLS LAST, r.runid DESC LIMIT 1
      ),
      'last_message', (
        SELECT left(r.return_message, 200) FROM runs r
        ORDER BY r.start_time DESC NULLS LAST, r.runid DESC LIMIT 1
      )
    )
  );
$$;

COMMENT ON FUNCTION public.class_results_push_health() IS
  'MYK9-737: facts for the /admin/health class_results_push check: failed pushes, pending pushes queued 20+ minutes ago, and the class-results-push-retry cron''s liveness. service_role only.';

REVOKE ALL ON FUNCTION public.class_results_push_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_results_push_health() TO service_role;

-- 3. Retention for pg_cron's run history (Supabase's recommended clean-up; pg_cron has none).
--    Hourly: the delete is small at 7 days of rows, and an hourly job never reads as overdue on the
--    health board's 13-hour background_jobs threshold. A run that never recorded an end time (crashed
--    or stuck) ages out by its start time. Unscheduled first, as the other cron migrations do.
select cron.unschedule(jobid) from cron.job where jobname = 'cron-run-history-retention';
select cron.schedule(
  'cron-run-history-retention',
  '23 * * * *',
  $$delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '7 days'$$
);

commit;

notify pgrst, 'reload schema';
