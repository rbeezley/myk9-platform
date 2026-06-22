-- Nightly show payout cron: resolve runtime secrets from Supabase Vault.
--
-- 20260618130000_payout_cron_schedule.sql accidentally scheduled the job with
-- a literal placeholder x-function-secret value.
-- That makes cron-process-payouts return 403 and prevents nightly club payouts.
--
-- This follow-up replaces the job with a Vault-backed definition so secrets stay
-- out of migration history and rotations do not require committing secret values.
--
-- Required Vault secret names:
--   edge_function_base_url   e.g. https://<ref>.supabase.co/functions/v1
--   service_role_key         the project service-role key
--   payout_cron_secret       matches the Edge Function PAYOUT_CRON_SECRET

begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Unschedule every existing payout job with this name, including the placeholder
-- schedule from 20260618130000. The jobid form is safe when the job is absent.
select cron.unschedule(jobid)
from cron.job
where jobname = 'nightly-show-payouts';

select
  cron.schedule(
    'nightly-show-payouts',
    '0 2 * * *',
    $$
    do $nightly_show_payouts$
    declare
      edge_function_base_url text;
      service_role_key text;
      payout_cron_secret text;
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
      into payout_cron_secret
      from vault.decrypted_secrets
      where name = 'payout_cron_secret';

      if nullif(edge_function_base_url, '') is null then
        raise exception 'Missing Vault secret: edge_function_base_url';
      end if;

      if nullif(service_role_key, '') is null then
        raise exception 'Missing Vault secret: service_role_key';
      end if;

      if nullif(payout_cron_secret, '') is null then
        raise exception 'Missing Vault secret: payout_cron_secret';
      end if;

      perform net.http_post(
        url := edge_function_base_url || '/cron-process-payouts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key,
          'x-function-secret', payout_cron_secret
        ),
        body := '{}'::jsonb
      );
    end
    $nightly_show_payouts$;
    $$
  );

commit;
