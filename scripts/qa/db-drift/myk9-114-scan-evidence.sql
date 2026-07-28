-- MYK9-114 read-only scan evidence.
--
-- Required psql variables:
--   evidence_mode: snapshot | read | plans
--   show_id, class_id, auth_user_id, jwt_claims
--
-- Optional:
--   watermark (default 1970-01-01T00:00:00Z)
--
-- This script has no statistics-reset path. It is safe to run against linked
-- environments after the normal shared-system read approval. For attributable
-- scan deltas, use myk9-114-scan-evidence.ts, which runs snapshot/read/snapshot
-- in three separate backend sessions.

\set ON_ERROR_STOP on

\if :{?evidence_mode}
\else
  \echo 'Missing required variable: evidence_mode (snapshot | read | plans)'
  \quit 2
\endif

\if :{?show_id}
\else
  \echo 'Missing required variable: show_id'
  \quit 2
\endif

\if :{?class_id}
\else
  \echo 'Missing required variable: class_id'
  \quit 2
\endif

\if :{?auth_user_id}
\else
  \echo 'Missing required variable: auth_user_id'
  \quit 2
\endif

\if :{?jwt_claims}
\else
  \echo 'Missing required variable: jwt_claims'
  \quit 2
\endif

\if :{?watermark}
\else
  \set watermark '1970-01-01T00:00:00Z'
\endif

select :'evidence_mode' = 'snapshot' as is_snapshot,
       :'evidence_mode' = 'read' as is_read,
       :'evidence_mode' = 'plans' as is_plans
\gset

\if :is_snapshot
  select jsonb_build_object(
    'database', current_database(),
    'captured_at', clock_timestamp(),
    'stats_reset', (
      select stats_reset
      from pg_stat_database
      where datname = current_database()
    ),
    'relations', coalesce(
      jsonb_object_agg(
        relname,
        jsonb_build_object('seq_scan', seq_scan, 'idx_scan', idx_scan)
        order by relname
      ),
      '{}'::jsonb
    )
  )::text
  from pg_stat_user_tables
  where schemaname = 'public'
    and relname in ('user_roles', 'judge_assignments', 'show_passcodes');
  \quit
\endif

select set_config('request.jwt.claim.sub', :'auth_user_id', false)
\g /dev/null
select set_config('request.jwt.claims', :'jwt_claims', false)
\g /dev/null

\if :is_read
  -- Force every projected field exactly once without printing protected rows.
  select count(*) as projected_rows
  from (
    select to_jsonb(v) as projected_row
    from public.view_authenticated_entry_results v
    where v.show_id = :'show_id'::uuid
  ) evaluated
  where projected_row is not null;
  \quit
\endif

\if :is_plans
  \echo 'Global full-projection plan'
  explain (analyze, buffers, verbose, format text)
  select *
  from public.view_authenticated_entry_results;

  \echo 'Representative full-row show-scoped plan'
  explain (analyze, buffers, verbose, format text)
  select *
  from public.view_authenticated_entry_results
  where show_id = :'show_id'::uuid;

  \echo 'Class-scoped plan'
  explain (analyze, buffers, verbose, format text)
  select *
  from public.view_authenticated_entry_results
  where class_id = :'class_id'::uuid;

  \echo 'Watermark-scoped plan'
  explain (analyze, buffers, verbose, format text)
  select *
  from public.view_authenticated_entry_results
  where show_id = :'show_id'::uuid
    and updated_at > :'watermark'::timestamptz;
  \quit
\endif

\echo 'Invalid evidence_mode: expected snapshot, read, or plans'
\quit 2
