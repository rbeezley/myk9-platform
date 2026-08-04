-- MYK9-129 — extend the daily applied ACL probe beyond anon.
--
-- The migration contract test checks a migrations-only rebuild. This companion
-- fact block reads the applied catalog so grants or defaults introduced by a
-- restore, dashboard edit, or historical default privilege cannot drift unseen.

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
  'Read-only health facts (scheduled cron jobs + last-run outcome, newest applied migration, ringside OCC conflict counter, MYK9-115 containment breaker state, payout-ledger outcomes as the latest attempt per show, applied anon ACLs, and applied authenticated/table/sequence ACLs) for the cron-health-check runner. SECURITY DEFINER so service_role can read cron.* / supabase_migrations.* / pg_default_acl which PostgREST does not expose. Runs no health logic; the ok/warn/fail mapping lives in the runner.';

revoke all on function public.system_health_probe() from public;
revoke all on function public.system_health_probe() from anon;
revoke all on function public.system_health_probe() from authenticated;
grant execute on function public.system_health_probe() to service_role;

commit;

notify pgrst, 'reload schema';
