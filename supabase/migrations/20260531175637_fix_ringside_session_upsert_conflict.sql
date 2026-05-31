-- Fix the Phase 3 heartbeat RPC: in a RETURNS TABLE function, the output
-- column `show_id` is also a PL/pgSQL variable, so `on conflict
-- (subscription_id, show_id)` is ambiguous at runtime. Target the table's
-- primary-key constraint directly.

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
  on conflict on constraint ringside_sessions_pkey do update
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
