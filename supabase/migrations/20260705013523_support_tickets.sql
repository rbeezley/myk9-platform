begin;

create extension if not exists pg_net with schema net;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (length(trim(subject)) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'waiting', 'resolved')),
  is_show_day_priority boolean not null default false,
  diagnostics jsonb not null default '{}'::jsonb,
  show_id uuid null references public.shows(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_tickets_owner_created
  on public.support_tickets (owner_id, created_at desc);

create index if not exists idx_support_tickets_status_priority
  on public.support_tickets (status, is_show_day_priority desc, created_at desc);

create index if not exists idx_support_tickets_show
  on public.support_tickets (show_id)
  where show_id is not null;

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  is_from_operator boolean not null default false,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_messages_ticket_created
  on public.support_ticket_messages (ticket_id, created_at);

create index if not exists idx_support_ticket_messages_unread
  on public.support_ticket_messages (ticket_id, sender_id, read_at)
  where read_at is null;

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

grant select, insert, update on public.support_tickets to authenticated;
grant select, insert, update on public.support_ticket_messages to authenticated;
grant select, insert, update on public.support_tickets to service_role;
grant select, insert, update on public.support_ticket_messages to service_role;
revoke all on public.support_tickets from anon;
revoke all on public.support_ticket_messages from anon;

drop policy if exists "support_tickets_select_owner_or_site_admin" on public.support_tickets;
create policy "support_tickets_select_owner_or_site_admin"
  on public.support_tickets
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (select public.is_site_admin())
  );

drop policy if exists "support_tickets_insert_owner_or_site_admin" on public.support_tickets;
create policy "support_tickets_insert_owner_or_site_admin"
  on public.support_tickets
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    or (select public.is_site_admin())
  );

drop policy if exists "support_tickets_update_owner_or_site_admin" on public.support_tickets;
create policy "support_tickets_update_owner_or_site_admin"
  on public.support_tickets
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (select public.is_site_admin())
  )
  with check (
    owner_id = (select auth.uid())
    or (select public.is_site_admin())
  );

drop policy if exists "support_ticket_messages_select_owner_or_site_admin" on public.support_ticket_messages;
create policy "support_ticket_messages_select_owner_or_site_admin"
  on public.support_ticket_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (
          t.owner_id = (select auth.uid())
          or (select public.is_site_admin())
        )
    )
  );

drop policy if exists "support_ticket_messages_insert_owner_or_site_admin" on public.support_ticket_messages;
create policy "support_ticket_messages_insert_owner_or_site_admin"
  on public.support_ticket_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and is_from_operator = (select public.is_site_admin())
    and exists (
      select 1
      from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (
          t.owner_id = (select auth.uid())
          or (select public.is_site_admin())
        )
    )
  );

drop policy if exists "support_ticket_messages_update_owner_or_site_admin" on public.support_ticket_messages;
create policy "support_ticket_messages_update_owner_or_site_admin"
  on public.support_ticket_messages
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (
          t.owner_id = (select auth.uid())
          or (select public.is_site_admin())
        )
    )
  )
  with check (
    exists (
      select 1
      from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (
          t.owner_id = (select auth.uid())
          or (select public.is_site_admin())
        )
    )
  );

create or replace function public.set_support_ticket_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_support_ticket_updated_at() from public;

drop trigger if exists trg_set_support_ticket_updated_at on public.support_tickets;
create trigger trg_set_support_ticket_updated_at
  before update on public.support_tickets
  for each row
  execute function public.set_support_ticket_updated_at();

create or replace function public.restrict_support_ticket_update_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_site_admin()) then
    if old.owner_id is distinct from new.owner_id
      or old.subject is distinct from new.subject
      or old.diagnostics is distinct from new.diagnostics
      or old.show_id is distinct from new.show_id
      or old.is_show_day_priority is distinct from new.is_show_day_priority
      or old.created_at is distinct from new.created_at
    then
      raise exception 'Only status may be updated on support_tickets';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.restrict_support_ticket_update_columns() from public;

drop trigger if exists trg_restrict_support_ticket_update_columns on public.support_tickets;
create trigger trg_restrict_support_ticket_update_columns
  before update on public.support_tickets
  for each row
  execute function public.restrict_support_ticket_update_columns();

create or replace function public.restrict_support_message_update_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.ticket_id is distinct from new.ticket_id
    or old.sender_id is distinct from new.sender_id
    or old.body is distinct from new.body
    or old.is_from_operator is distinct from new.is_from_operator
    or old.created_at is distinct from new.created_at
  then
    raise exception 'Only read_at may be updated on support_ticket_messages';
  end if;

  return new;
end;
$$;

revoke all on function public.restrict_support_message_update_columns() from public;

drop trigger if exists trg_restrict_support_message_update_columns on public.support_ticket_messages;
create trigger trg_restrict_support_message_update_columns
  before update on public.support_ticket_messages
  for each row
  execute function public.restrict_support_message_update_columns();

create or replace function public.notify_support_message()
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
    raise notice 'notify_support_message skipped because edge function config is not set';
    return new;
  end if;

  perform net.http_post(
    url := edge_function_base_url || '/push-trigger-support-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_secret
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', new.id,
        'ticket_id', new.ticket_id,
        'sender_id', new.sender_id,
        'body', new.body,
        'is_from_operator', new.is_from_operator,
        'created_at', new.created_at
      )
    )
  );

  return new;
end;
$$;

revoke all on function public.notify_support_message() from public;

drop trigger if exists trg_notify_support_message on public.support_ticket_messages;
create trigger trg_notify_support_message
  after insert on public.support_ticket_messages
  for each row
  execute function public.notify_support_message();

comment on table public.support_tickets is
  'In-app myK9Show support tickets. Owner and sender ids use auth.users.id; site-admin access is checked through public.is_site_admin().';

comment on table public.support_ticket_messages is
  'Threaded in-app support replies attached to support_tickets; no inbound email ingestion.';

notify pgrst, 'reload schema';

commit;
