-- Phase 3 (Unify myK9Show + myK9Q) — ringside recipient identity,
-- durable presence, and write-path RPCs.

begin;

create extension if not exists pg_cron with schema extensions;

create table if not exists public.ringside_sessions (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  show_passcode_id uuid null references public.show_passcodes(id) on delete set null,
  role text not null check (role in ('exhibitor', 'steward', 'judge', 'admin')),
  favorited_armbands text[] not null default '{}'::text[],
  last_seen_at timestamptz,
  last_seen_route text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subscription_id, show_id)
);

create index if not exists ringside_sessions_show_role_idx
  on public.ringside_sessions (show_id, role);

create index if not exists ringside_sessions_show_seen_idx
  on public.ringside_sessions (show_id, last_seen_at);

create index if not exists ringside_sessions_favorited_armbands_idx
  on public.ringside_sessions using gin (favorited_armbands);

comment on table public.ringside_sessions is
  'Per-(push subscription, show) ringside presence, role, and exhibitor favorite state for unified at-show push routing.';

alter table public.ringside_sessions enable row level security;
alter table public.ringside_sessions force row level security;

revoke all on public.ringside_sessions from anon, authenticated;
grant select on public.ringside_sessions to authenticated, service_role;

drop policy if exists "ringside_sessions_site_admin_select" on public.ringside_sessions;
create policy "ringside_sessions_site_admin_select"
  on public.ringside_sessions
  for select
  to authenticated
  using ((select public.is_site_admin()));

create or replace function public._extract_at_show_route_show_id(p_route text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_match text;
begin
  if p_route is null then
    return null;
  end if;

  v_match := substring(
    p_route from '/at-show/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
  );

  if v_match is null then
    return null;
  end if;

  return v_match::uuid;
exception
  when invalid_text_representation then
    return null;
end
$$;

revoke all on function public._extract_at_show_route_show_id(text) from public;

create or replace function public._account_ringside_show_id(p_route text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_route_show_id uuid;
  v_person_id uuid;
  v_show_id uuid;
  v_show_count int;
begin
  if auth.uid() is null then
    return null;
  end if;

  select p.id
    into v_person_id
    from public.people p
   where p.auth_user_id = auth.uid()
   limit 1;

  if v_person_id is null then
    return null;
  end if;

  v_route_show_id := public._extract_at_show_route_show_id(p_route);

  if v_route_show_id is not null then
    select e.show_id
      into v_show_id
      from public.entries e
      left join public.dogs d on d.id = e.dog_id
      join public.shows s on s.id = e.show_id
     where e.show_id = v_route_show_id
       and s.start_date <= current_date
       and s.end_date >= current_date
       and (
         e.handler_id = v_person_id
         or d.owner_id = v_person_id
         or d.co_owner_id = v_person_id
       )
     limit 1;

    if v_show_id is not null then
      return v_show_id;
    end if;
  end if;

  select min(candidate.show_id), count(distinct candidate.show_id)
    into v_show_id, v_show_count
    from (
      select e.show_id
        from public.entries e
        left join public.dogs d on d.id = e.dog_id
        join public.shows s on s.id = e.show_id
       where s.start_date <= current_date
         and s.end_date >= current_date
         and (
           e.handler_id = v_person_id
           or d.owner_id = v_person_id
           or d.co_owner_id = v_person_id
         )
    ) candidate;

  if v_show_count = 1 then
    return v_show_id;
  end if;

  return null;
end
$$;

revoke all on function public._account_ringside_show_id(text) from public;

create or replace function public.upsert_ringside_session(
  p_passcode_or_null text,
  p_subscription_endpoint text,
  p_favorited_armbands text[] default '{}'::text[],
  p_route text default null
)
returns table (show_id uuid, role text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_subscription_user_id uuid;
  v_show_id uuid;
  v_role text;
  v_show_passcode_id uuid;
  v_hash text;
begin
  if nullif(trim(coalesce(p_subscription_endpoint, '')), '') is null then
    raise exception 'push subscription is required' using errcode = '22023';
  end if;

  select ps.id, ps.user_id
    into v_subscription_id, v_subscription_user_id
    from public.push_subscriptions ps
   where ps.endpoint = p_subscription_endpoint
   limit 1;

  if v_subscription_id is null then
    raise exception 'push subscription is required' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_passcode_or_null, '')), '') is not null then
    select vp.show_id, vp.role
      into v_show_id, v_role
      from public.validate_passcode(p_passcode_or_null) vp
      limit 1;

    if v_show_id is null or v_role is null then
      raise exception 'credential not recognized' using errcode = '28000';
    end if;

    if auth.uid() is not null and v_subscription_user_id is distinct from auth.uid() then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    if auth.uid() is null and v_subscription_user_id is not null then
      raise exception 'subscription does not belong to anonymous session' using errcode = '42501';
    end if;

    v_hash := public._hash_passcode(p_passcode_or_null);
    select sp.id
      into v_show_passcode_id
      from public.show_passcodes sp
     where sp.show_id = v_show_id
       and sp.role = v_role
       and sp.passcode_hash = v_hash
     limit 1;
  else
    if auth.uid() is null then
      raise exception 'credential not recognized' using errcode = '28000';
    end if;

    if v_subscription_user_id is distinct from auth.uid() then
      raise exception 'subscription does not belong to caller' using errcode = '42501';
    end if;

    v_show_id := public._account_ringside_show_id(p_route);
    if v_show_id is null then
      raise exception 'account is not entered in exactly one active ringside show' using errcode = '42501';
    end if;

    v_role := 'exhibitor';
  end if;

  insert into public.ringside_sessions (
    subscription_id,
    show_id,
    show_passcode_id,
    role,
    favorited_armbands,
    last_seen_at,
    last_seen_route,
    updated_at
  )
  values (
    v_subscription_id,
    v_show_id,
    v_show_passcode_id,
    v_role,
    coalesce(p_favorited_armbands, '{}'::text[]),
    now(),
    p_route,
    now()
  )
  on conflict (subscription_id, show_id) do update
    set show_passcode_id = excluded.show_passcode_id,
        role = excluded.role,
        favorited_armbands = excluded.favorited_armbands,
        last_seen_at = excluded.last_seen_at,
        last_seen_route = excluded.last_seen_route,
        updated_at = excluded.updated_at;

  show_id := v_show_id;
  role := v_role;
  return next;
end
$$;

revoke all on function public.upsert_ringside_session(text, text, text[], text) from public;
grant execute on function public.upsert_ringside_session(text, text, text[], text) to anon, authenticated;

create or replace function public.clear_ringside_session_presence(
  p_subscription_endpoint text,
  p_show_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_subscription_user_id uuid;
begin
  select ps.id, ps.user_id
    into v_subscription_id, v_subscription_user_id
    from public.push_subscriptions ps
   where ps.endpoint = p_subscription_endpoint
   limit 1;

  if v_subscription_id is null then
    return;
  end if;

  if auth.uid() is not null and v_subscription_user_id is distinct from auth.uid() then
    raise exception 'subscription does not belong to caller' using errcode = '42501';
  end if;

  if auth.uid() is null and v_subscription_user_id is not null then
    raise exception 'subscription does not belong to anonymous session' using errcode = '42501';
  end if;

  update public.ringside_sessions
     set last_seen_at = null,
         last_seen_route = null,
         updated_at = now()
   where subscription_id = v_subscription_id
     and show_id = p_show_id;
end
$$;

revoke all on function public.clear_ringside_session_presence(text, uuid) from public;
grant execute on function public.clear_ringside_session_presence(text, uuid) to anon, authenticated;

create or replace function public.prune_stale_ringside_sessions()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from public.ringside_sessions rs
  using public.shows s
  where s.id = rs.show_id
    and (
      s.end_date < current_date - 7
      or (
        s.end_date < current_date
        and (rs.last_seen_at is null or rs.last_seen_at < now() - interval '24 hours')
      )
    );

  get diagnostics v_deleted = row_count;
  raise notice 'prune_stale_ringside_sessions deleted % rows', v_deleted;
  return v_deleted;
end
$$;

revoke all on function public.prune_stale_ringside_sessions() from public;
grant execute on function public.prune_stale_ringside_sessions() to service_role;

select cron.unschedule('prune-stale-ringside-sessions')
where exists (
  select 1 from cron.job where jobname = 'prune-stale-ringside-sessions'
);

select cron.schedule(
  'prune-stale-ringside-sessions',
  '17 8 * * *',
  $$select public.prune_stale_ringside_sessions();$$
);

commit;
