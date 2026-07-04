-- =============================================================================
-- Migration: system_health_probe() — read-only facts probe for the daily
--            System Health check-runner (companion to
--            20260704120000_create_system_health_snapshots.sql / /admin/health).
--
-- The check-runner edge function (cron-health-check) runs as service_role and
-- reaches only the `public` schema through PostgREST. The facts it needs to
-- judge launch-morning health live in schemas it cannot query directly:
--   * cron.job / cron.job_run_details  (is the payout cron scheduled? did its
--     last run succeed? are the other scheduled jobs healthy?)  — runbook 5.4
--   * supabase_migrations.schema_migrations (newest applied migration)  — 5.2
--
-- This SECURITY DEFINER function is the single, auditable seam that exposes
-- exactly those read-only facts to service_role. It runs NO health logic — the
-- ok/warn/fail mapping and the worst-of overall_status live in the runner's
-- pure TS module (_shared/systemHealthChecks.ts) so they are unit-testable.
--
-- Access (per CLAUDE.md — REVOKE the default PUBLIC EXECUTE, then grant narrow):
--   * service_role may EXECUTE (the runner). No anon / authenticated / public.
--
-- New migration only. Rollback = a follow-up migration that DROPs the function.
-- =============================================================================

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
  'Read-only health facts (scheduled cron jobs + last-run outcome, newest applied migration) for the cron-health-check runner. SECURITY DEFINER so service_role can read cron.* / supabase_migrations.* which PostgREST does not expose. Runs no health logic; the ok/warn/fail mapping lives in the runner. Same monitoring family as the planned operator_alerts surface (MP-08).';

-- Functions default to EXECUTE for PUBLIC — revoke, then grant only the runner.
revoke all on function public.system_health_probe() from public;
grant execute on function public.system_health_probe() to service_role;

commit;

-- Reload PostgREST schema cache so rpc('system_health_probe') resolves.
notify pgrst, 'reload schema';
