-- Nightly show payout cron — schedule cron-process-payouts edge function.
-- This runs after the 3-day show-close delay, transferring online entry fees
-- to each club's Stripe Express account.
--
-- ⚠ Shared-system change ⚠
-- Per CLAUDE.md Auto-Mode rules, `supabase db push` for this migration
-- REQUIRES explicit user confirmation in chat.
--
-- Pre-flight (run once per environment; skip if already present):
--   create extension if not exists pg_cron with schema extensions;
--   create extension if not exists pg_net  with schema extensions;
-- Both were created by 193_heritage_cron.sql, so staging already has them.
-- Confirm live project has them before pushing there.
--
-- ⚠ BEFORE PUSHING: replace the placeholder below with the actual
-- PAYOUT_CRON_SECRET value from `supabase secrets list` output.
-- The cron body is SQL that runs as the postgres role — the secret is a
-- literal string in the scheduled SQL, not injected at push time.
--
-- Rotation procedure: when the secret changes, write a new migration that
-- calls cron.unschedule('nightly-show-payouts') then cron.schedule(...) with
-- the new literal. Do NOT edit this migration in-place (already applied).
-- Update the secret in Supabase dashboard secrets at the same time.

begin;

-- pg_cron and pg_net must be present (created by 193_heritage_cron.sql).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Idempotent: unschedule first so re-applying this migration (e.g. after a
-- reset) doesn't create a duplicate job. Uses the jobid-based form to avoid
-- the XX000 error that cron.unschedule(name) raises when the job doesn't exist.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nightly-show-payouts';

-- 02:00 UTC daily. The function applies a 3-day show-end delay internally
-- so shows that closed today are NOT paid tonight — this just ensures the
-- nightly window is always covered. Runs outside show hours globally.
select
  cron.schedule(
    'nightly-show-payouts',
    '0 2 * * *',
    $$
    select net.http_post(
      url     := 'https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/cron-process-payouts',
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'Authorization',      'Bearer ' || current_setting('app.settings.service_role_key', true),
        'x-function-secret',  'REPLACE_WITH_PAYOUT_CRON_SECRET'
      ),
      body    := '{}'::jsonb
    );
    $$
  );

commit;
