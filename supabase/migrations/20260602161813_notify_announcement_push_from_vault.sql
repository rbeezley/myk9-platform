-- Source notify_announcement_push() runtime config from Supabase Vault.
--
-- 20260602153923 guarded this trigger against an unset app.settings.* GUC so a
-- high/urgent all-show broadcast no longer aborts the INSERT. But those GUCs are
-- unset and ALTER DATABASE SET is no longer available to the postgres role on the
-- linked project (see 20260525160000_heritage_cron_vault.sql), so the guard always
-- skipped — announcements saved but push never fired.
--
-- Resolve config from vault.decrypted_secrets at execution time instead, mirroring
-- the heritage cron. Unlike that cron (a standalone job that may RAISE on missing
-- secrets), this is an AFTER INSERT trigger: it must GUARD-AND-SKIP, never raise,
-- or it would re-break the broadcast save. Push fires once the Vault secrets exist.
--
-- Required Vault secret names (seed with vault.create_secret before push works):
--   edge_function_base_url   e.g. https://<ref>.supabase.co/functions/v1
--   service_role_key         the project service-role key

begin;

create extension if not exists supabase_vault with schema vault;

create or replace function public.notify_announcement_push()
returns trigger
language plpgsql
security definer
as $$
declare
  edge_function_base_url text;
  service_role_key text;
begin
  select decrypted_secret
  into edge_function_base_url
  from vault.decrypted_secrets
  where name = 'edge_function_base_url';

  select decrypted_secret
  into service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if nullif(edge_function_base_url, '') is null
    or nullif(service_role_key, '') is null
  then
    raise notice 'notify_announcement_push skipped because edge function config is not set';
    return new;
  end if;

  perform net.http_post(
    url := edge_function_base_url || '/push-trigger-announcement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'show_announcements',
      'record', jsonb_build_object(
        'id', new.id,
        'show_id', new.show_id,
        'author_id', new.author_id,
        'author_role', new.author_role,
        'title', new.title,
        'content', new.content,
        'priority', new.priority
      )
    )
  );

  return new;
end;
$$;

commit;
