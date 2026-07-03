-- Route class-status and scoring push triggers through the same Vault-backed
-- PUSH_WEBHOOK_SECRET handshake already used by announcement/chat push.

begin;

create extension if not exists supabase_vault with schema vault;

create or replace function public.notify_entry_scoring_push()
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
    raise notice 'notify_entry_scoring_push skipped because edge function config is not set';
    return new;
  end if;

  perform net.http_post(
    url := edge_function_base_url || '/push-trigger-scoring',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'entries',
      'record', jsonb_build_object(
        'id', new.id,
        'dog_id', new.dog_id,
        'class_id', new.class_id,
        'show_id', new.show_id,
        'handler_id', new.handler_id,
        'scoring_completed_at', new.scoring_completed_at
      ),
      'old_record', jsonb_build_object(
        'id', old.id,
        'scoring_completed_at', old.scoring_completed_at
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_entry_scoring_push on public.entries;
create trigger trg_notify_entry_scoring_push
  after update of scoring_completed_at on public.entries
  for each row
  when (
    old.scoring_completed_at is null
    and new.scoring_completed_at is not null
  )
  execute function public.notify_entry_scoring_push();

create or replace function public.notify_class_status_push()
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
    raise notice 'notify_class_status_push skipped because edge function config is not set';
    return new;
  end if;

  perform net.http_post(
    url := edge_function_base_url || '/push-trigger-class-status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'classes',
      'record', jsonb_build_object(
        'id', new.id,
        'name', new.name,
        'status', new.status
      ),
      'old_record', jsonb_build_object(
        'id', old.id,
        'status', old.status
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_class_status_push on public.classes;
create trigger trg_notify_class_status_push
  after update of status on public.classes
  for each row
  when (
    new.status = 'in_progress'
    and old.status is distinct from 'in_progress'
  )
  execute function public.notify_class_status_push();

commit;
