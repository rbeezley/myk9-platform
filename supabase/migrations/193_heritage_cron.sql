-- Heritage Trial Pages — pg_cron schedule for the confirmation email send.
-- Plan: docs/plans/2026-05-07-heritage-trial-pages-plan.md §4.4 + §13.7
-- Depends on: 192_heritage_trial_pages.sql
--
-- ⚠ Project-level shared-system change ⚠
-- Enabling pg_cron is a one-time per-project operation. Pushing this migration
-- alters the global extension state of the linked Supabase project. Per
-- CLAUDE.md Auto-Mode rules, this push REQUIRES explicit user confirmation in
-- chat — do not run `supabase db push` for this migration without approval.
--
-- After push, set the two settings the cron job needs:
--   alter database postgres set "app.settings.confirmation_email_url" = 'https://<project>.functions.supabase.co/send-confirmation-email';
--   alter database postgres set "app.settings.service_role_key"       = '<service-role-jwt>';

begin;

-- pg_cron lives in the `extensions` schema by Supabase convention.
create extension if not exists pg_cron with schema extensions;

-- pg_net is needed for the cron job's HTTP call out to the edge function.
create extension if not exists pg_net with schema extensions;

-- Daily at 09:00 UTC, fire send-confirmation-email. The function itself
-- queries `trials` for confirmation_date <= today and iterates entries with
-- confirmation_email_sent_at IS NULL, so idempotency lives in code, not here.
select
  cron.schedule(
    'heritage-confirmation-emails',
    '0 9 * * *',
    $$
    select net.http_post(
      url     := current_setting('app.settings.confirmation_email_url', true),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body    := '{}'::jsonb
    );
    $$
  );

commit;
