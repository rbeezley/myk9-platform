-- Pin search_path on notify_announcement_push().
--
-- The Supabase database linter flags SECURITY DEFINER functions with a mutable
-- search_path (function_search_path_mutable advisory): a caller could shadow an
-- unqualified reference with an object earlier in their own search_path and run
-- it with the function owner's elevated privileges. notify_chat_message was
-- already hardened the same way (20260603085719); bring its sibling in line.
--
-- This is behavior-preserving hardening only. The body is byte-for-byte the
-- definition from 20260603074455 (reads Vault edge_function_base_url +
-- push_webhook_secret, guard-skips with a NOTICE + RETURN NEW when either is
-- missing, posts to push-trigger-announcement with a `Bearer <webhook_secret>`
-- header). Every reference is already schema-qualified (vault., net.) and the
-- built-ins (nullif, jsonb_build_object) resolve from the implicitly-searched
-- pg_catalog, so `set search_path = ''` changes nothing at runtime.
--
-- Announcement push is live and verified on a real device (2026-06-03); do not
-- change behavior here.

begin;

create extension if not exists supabase_vault with schema vault;

create or replace function public.notify_announcement_push()
returns trigger
language plpgsql
security definer
set search_path = ''
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
