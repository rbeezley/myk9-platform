alter table public.show_messages
  add column if not exists push_alert boolean not null default true;

create or replace function public.restrict_message_update_columns()
returns trigger as $$
begin
  if new.body is distinct from old.body
    or new.sender_id is distinct from old.sender_id
    or new.show_id is distinct from old.show_id
    or new.thread_id is distinct from old.thread_id
    or new.group_label is distinct from old.group_label
    or new.push_alert is distinct from old.push_alert
  then
    raise exception 'Only read_at may be updated on show_messages';
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
as $$
declare
  edge_function_base_url text;
  service_role_key text;
begin
  if new.push_alert is false then
    return new;
  end if;

  edge_function_base_url := current_setting('app.settings.edge_function_base_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);

  if edge_function_base_url is null
    or edge_function_base_url = ''
    or service_role_key is null
    or service_role_key = ''
  then
    raise notice 'notify_chat_message skipped because edge function config is not set';
    return new;
  end if;

  perform net.http_post(
    url := edge_function_base_url || '/push-trigger-chat-message',
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', new.id,
        'show_id', new.show_id,
        'thread_id', new.thread_id,
        'sender_id', new.sender_id,
        'body', new.body,
        'created_at', new.created_at
      )
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    )
  );

  return new;
end;
$$;
