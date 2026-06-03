-- Bring notify_chat_message to the same Vault + webhook-secret model as
-- notify_announcement_push, and scope it to individual messages so it never
-- double-pushes targeted broadcasts.
--
-- Two problems with the prior definition (20260601161000):
--   1. It read config from app.settings.* GUCs, which are UNSET and can't be set
--      on this project, and authed with the service-role key, which the function
--      can no longer match after the JWT signing-key migration (same 401 the
--      announcement function hit). So chat push silently never fired.
--   2. The trigger had no WHEN clause, so it fired on EVERY show_messages insert,
--      including targeted broadcasts from send-targeted-message — which already
--      push directly. Enabling chat push would double-push those.
--
-- Fixes:
--   - Source edge_function_base_url + push_webhook_secret from Vault (guard-skip,
--     never raise). The push-trigger-chat-message function validates the same
--     PUSH_WEBHOOK_SECRET shared secret — independent of Supabase key rotation.
--   - Recreate the trigger WHEN (new.group_label IS NULL): individual 1:1 chat
--     messages (messageStore sets group_label=null) fire it; targeted broadcasts
--     (send-targeted-message always sets a non-null group_label) do not.
--
-- Reuses the secrets already seeded for announcement push:
--   Vault push_webhook_secret  ==  PUSH_WEBHOOK_SECRET (function secret)

begin;

create extension if not exists supabase_vault with schema vault;

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  edge_function_base_url text;
  webhook_secret text;
begin
  if new.push_alert is false then
    return new;
  end if;

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
    raise notice 'notify_chat_message skipped because edge function config is not set';
    return new;
  end if;

  perform net.http_post(
    url := edge_function_base_url || '/push-trigger-chat-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_secret
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', new.id,
        'show_id', new.show_id,
        'thread_id', new.thread_id,
        'sender_id', new.sender_id,
        'body', new.body,
        'created_at', new.created_at
      )
    )
  );

  return new;
end;
$$;

-- Scope to individual chat messages only. Targeted broadcasts set group_label
-- (non-null) and are pushed directly by send-targeted-message; firing this
-- trigger for them would double-push.
drop trigger if exists trg_notify_chat_message on public.show_messages;
create trigger trg_notify_chat_message
  after insert on public.show_messages
  for each row
  when (new.group_label is null)
  execute function public.notify_chat_message();

commit;
