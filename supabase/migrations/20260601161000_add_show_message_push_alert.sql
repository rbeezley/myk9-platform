alter table public.show_messages
  add column if not exists push_alert boolean not null default true;

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
