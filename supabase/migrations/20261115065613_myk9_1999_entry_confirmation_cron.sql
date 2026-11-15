-- MYK9-1999: the full confirmation goes as soon as an entry is accepted, not on a date the
-- secretary sets.
--
-- send-confirmation-email now sends one email per exhibitor per show for every accepted entry
-- (entry_status 'confirmed', armband assigned) that has not had its confirmation, on a show that
-- is published and not over. The daily 09:00 UTC job 'heritage-confirmation-emails' (body {})
-- stays as it is: it retries failed receipts, sends new confirmations and retries failed ones.
-- This job runs every 15 minutes with body {"scope":"new"}, which sends only confirmations never
-- tried, so an exhibitor hears within minutes of the secretary's Accept and a failure is retried
-- once a day rather than every run. The function waits for an accepted entry to go ten minutes
-- without a change before it emails it, so an Accept the secretary undoes is not sent.
--
-- No table, no grant: one cron job. It reads the same three Vault secrets as
-- 'heritage-confirmation-emails' (20260525160000_heritage_cron_vault.sql), so no new secret is
-- needed. The minutes are offset from the quarter hours other jobs use.

BEGIN;

SELECT cron.unschedule('entry-confirmation-emails')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'entry-confirmation-emails'
);

SELECT
  cron.schedule(
    'entry-confirmation-emails',
    '7,22,37,52 * * * *',
    $$
    do $entry_confirmation_cron$
    declare
      confirmation_email_url text;
      service_role_key text;
      function_secret text;
    begin
      select decrypted_secret
      into confirmation_email_url
      from vault.decrypted_secrets
      where name = 'heritage_confirmation_email_url';

      select decrypted_secret
      into service_role_key
      from vault.decrypted_secrets
      where name = 'heritage_confirmation_service_role_key';

      select decrypted_secret
      into function_secret
      from vault.decrypted_secrets
      where name = 'heritage_confirmation_secret';

      if nullif(confirmation_email_url, '') is null then
        raise exception 'Missing Vault secret: heritage_confirmation_email_url';
      end if;

      if nullif(service_role_key, '') is null then
        raise exception 'Missing Vault secret: heritage_confirmation_service_role_key';
      end if;

      if nullif(function_secret, '') is null then
        raise exception 'Missing Vault secret: heritage_confirmation_secret';
      end if;

      perform net.http_post(
        url := confirmation_email_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key,
          'x-function-secret', function_secret
        ),
        body := '{"scope":"new"}'::jsonb
      );
    end
    $entry_confirmation_cron$;
    $$
  );

COMMIT;
