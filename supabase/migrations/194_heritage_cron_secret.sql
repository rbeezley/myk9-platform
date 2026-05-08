-- Heritage confirmation email cron — add x-function-secret header.
-- Complements 193_heritage_cron.sql.  Now that HERITAGE_CONFIRMATION_SECRET
-- is set as an edge-function secret, the daily cron job must pass it so the
-- function's caller-auth guard accepts the request.
--
-- To rotate the secret: update the literal in this cron body, write a new
-- migration with cron.unschedule + cron.schedule, push, and update the edge
-- function secret in the Supabase dashboard.

begin;

-- Replace the existing schedule with an updated one that includes the secret
-- header.  cron.unschedule is a no-op if the job doesn't exist yet.
select cron.unschedule('heritage-confirmation-emails');

select
  cron.schedule(
    'heritage-confirmation-emails',
    '0 9 * * *',
    $$
    select net.http_post(
      url     := current_setting('app.settings.confirmation_email_url', true),
      headers := jsonb_build_object(
        'Content-Type',       'application/json',
        'Authorization',      'Bearer ' || current_setting('app.settings.service_role_key', true),
        'x-function-secret',  'ced772d6414245c9a8615af3bfdd8347d8f7bca4d3ac20a49ae1aee4dfaf7f9a'
      ),
      body    := '{}'::jsonb
    );
    $$
  );

commit;
