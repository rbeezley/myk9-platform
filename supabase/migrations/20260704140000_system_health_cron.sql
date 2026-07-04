-- Daily System Health check-runner cron — schedule cron-health-check.
--
-- Runs the recurring, machine-checkable parts of the go-live runbook Phase 5
-- and writes one row to public.system_health_snapshots; /admin/health reads the
-- latest run. Depends on 20260704120000_create_system_health_snapshots.sql (the
-- store, from the admin-system-health-board change) and
-- 20260704130000_system_health_probe.sql (the facts probe).
--
-- ⚠ Shared-system change ⚠
-- Per CLAUDE.md Auto-Mode rules, `supabase db push` for this migration REQUIRES
-- explicit user confirmation in chat.
--
-- Vault-backed, mirroring 20260619130000_payout_cron_vault_secret.sql so secrets
-- stay out of migration history and rotations don't require committing values.
--
-- Required Vault secret names (reuses the payout cron's first two):
--   edge_function_base_url   e.g. https://<ref>.supabase.co/functions/v1
--   service_role_key         the project service-role key
--   health_cron_secret       matches the Edge Function HEALTH_CRON_SECRET
--
-- Cadence: 07:00 UTC daily. Once-daily keeps the board's 7-run history strip ≈
-- one week (the "did last week trend healthy?" intent) and is well under the
-- board's ~26h staleness window, so a healthy run is never flagged stale while a
-- genuinely missed run correctly trips the board to fail.
--
-- Rotation: write a NEW migration that unschedules + reschedules; do not edit
-- this one in place once applied. Update the Vault secret at the same time.

begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Idempotent: unschedule any existing job with this name first (jobid form is
-- safe when the job is absent, unlike unschedule(name)).
select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-health-check';

select
  cron.schedule(
    'daily-health-check',
    '0 7 * * *',
    $$
    do $daily_health_check$
    declare
      edge_function_base_url text;
      service_role_key text;
      health_cron_secret text;
    begin
      select decrypted_secret
      into edge_function_base_url
      from vault.decrypted_secrets
      where name = 'edge_function_base_url';

      select decrypted_secret
      into service_role_key
      from vault.decrypted_secrets
      where name = 'service_role_key';

      select decrypted_secret
      into health_cron_secret
      from vault.decrypted_secrets
      where name = 'health_cron_secret';

      if nullif(edge_function_base_url, '') is null then
        raise exception 'Missing Vault secret: edge_function_base_url';
      end if;

      if nullif(service_role_key, '') is null then
        raise exception 'Missing Vault secret: service_role_key';
      end if;

      if nullif(health_cron_secret, '') is null then
        raise exception 'Missing Vault secret: health_cron_secret';
      end if;

      perform net.http_post(
        url := edge_function_base_url || '/cron-health-check',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key,
          'x-function-secret', health_cron_secret
        ),
        body := '{}'::jsonb
      );
    end
    $daily_health_check$;
    $$
  );

commit;
