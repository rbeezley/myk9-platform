-- Add anon-grant facts to system_health_probe() — MYK9-93 compensating control.
--
-- Why this exists. MYK9-93 revoked the `postgres`-grantor ALTER DEFAULT PRIVILEGES
-- that were handing anon full CRUD on every new public table. The `supabase_admin`
-- grantor's equivalent defaults could NOT be revoked and cannot be: on a hosted
-- project `postgres` is neither a superuser nor a member of `supabase_admin`, and the
-- dashboard SQL editor also runs as `postgres`. Verified:
--   select rolsuper from pg_roles where rolname = 'postgres';            -- false
--   select pg_has_role('postgres', 'supabase_admin', 'MEMBER');          -- false
-- It is inert today (all 122 public tables are owned by `postgres`), but "inert"
-- is a fact about the present, not a guarantee.
--
-- More importantly, the migration-text contract test
-- (apps/myk9show/src/test/database/anonEntriesGrantContract.test.ts) can only see
-- what is WRITTEN in a migration. It cannot see a grant that arrives from a default
-- privilege, from the dashboard, or from any path that is not a committed .sql file
-- — which is exactly how `dog_favorites` shipped with anon holding full CRUD despite
-- a migration that deliberately granted it nothing.
--
-- So this probe reports the APPLIED ACLs and lets the daily runner judge them. Raw
-- facts only, no thresholds — the allowlist and the ok/warn/fail mapping live in the
-- runner's pure, unit-tested TS (_shared/systemHealthChecks.ts), matching the rest of
-- this function's design.
--
-- Recreates system_health_probe() wholesale per the established rotation convention
-- (a NEW migration, never an in-place edit). Body is unchanged from
-- 20260711150000_ringside_occ_conflict_containment.sql except the added
-- 'anon_grants' key.
--
-- Column-level ACLs matter as much as table-level ones here: `public.entries`
-- deliberately carries a 14-column anon allowlist with NO table-level SELECT, and
-- MYK9-93 briefly destroyed it with a blanket REVOKE that also drops column grants.
-- A table-level-only probe would have reported that as healthy.

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
  'Read-only health facts (scheduled cron jobs + last-run outcome, newest applied migration, ringside OCC conflict counter, applied anon table/column/default ACLs) for the cron-health-check runner. SECURITY DEFINER so service_role can read cron.* / supabase_migrations.* / pg_default_acl which PostgREST does not expose. Runs no health logic; the ok/warn/fail mapping lives in the runner. Same monitoring family as the operator_alerts surface (MP-08).';

-- Functions default to EXECUTE for PUBLIC — revoke, then grant only the runner.
revoke all on function public.system_health_probe() from public;
grant execute on function public.system_health_probe() to service_role;

commit;

-- Reload PostgREST schema cache so the updated RPCs resolve.
notify pgrst, 'reload schema';
