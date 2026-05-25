-- Heritage confirmation email cron — read runtime config from Supabase Vault.
--
-- The previous cron definitions used current_setting('app.settings.*'), but
-- those database settings are NULL in the linked Supabase project and ALTER
-- DATABASE SET is no longer available to the postgres role. Keep secret values
-- out of migration history and resolve them from vault.decrypted_secrets at
-- execution time instead.
--
-- Required Vault secret names:
--   heritage_confirmation_email_url
--   heritage_confirmation_service_role_key
--   heritage_confirmation_secret
--
-- Seed/rotate values with vault.create_secret(...) or vault.update_secret(...)
-- before expecting the cron job to succeed.

begin;

create extension if not exists supabase_vault with schema vault;

select cron.unschedule('heritage-confirmation-emails')
where exists (
  select 1
  from cron.job
  where jobname = 'heritage-confirmation-emails'
);

select
  cron.schedule(
    'heritage-confirmation-emails',
    '0 9 * * *',
    $$
    do $heritage_confirmation_cron$
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
        body := '{}'::jsonb
      );
    end
    $heritage_confirmation_cron$;
    $$
  );

commit;
