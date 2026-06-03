-- Send a dedicated webhook secret (not the service-role key) from
-- notify_announcement_push().
--
-- 20260602161813 sourced the bearer from Vault `service_role_key`, but the
-- project migrated to new JWT Signing Keys: the push-trigger-announcement
-- function's injected SUPABASE_SERVICE_ROLE_KEY no longer matches the legacy
-- service_role JWT that can be stored/sent from the DB, so the function 401'd.
--
-- Decouple the handshake: the trigger now sends Vault `push_webhook_secret`, and
-- the function validates against the PUSH_WEBHOOK_SECRET function secret (same
-- value). This is independent of Supabase key rotation. The function still uses
-- its own injected service-role key for DB access. Keeps guard-and-skip semantics
-- so a missing secret never aborts the INSERT.
--
-- Required Vault secret (must equal the PUSH_WEBHOOK_SECRET function secret):
--   push_webhook_secret

begin;

create extension if not exists supabase_vault with schema vault;

create or replace function public.notify_announcement_push()
returns trigger
language plpgsql
security definer
as $$
declare
  edge_function_base_url text;
  webhook_secret text;
begin
  select decrypted_secret
  into edge_function_base_url
  from vault.decrypted_secrets
  where name = 'edge_function_base_url';

  select decrypted_secret
  into webhook_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret';

  if nullif(edge_function_base_url, '') is null
    or nullif(webhook_secret, '') is null
  then
    raise notice 'notify_announcement_push skipped because edge function config is not set';
    return new;
  end if;

  perform net.http_post(
    url := edge_function_base_url || '/push-trigger-announcement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_secret
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
