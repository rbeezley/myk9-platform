-- MYK9-691: authorize the narrow, style-only show presentation command.
-- The client must not update public.shows directly for this field: this RPC
-- keeps tenant authorization and account-Premium entitlement server-owned.

-- Keep the client-facing table grants from becoming an authorization bypass.
-- The RPC is SECURITY DEFINER and therefore runs this trigger as its owner
-- (postgres); every invoker-level style update is rejected before it can reach
-- the row. Direct inserts remain a supported creation path, so enforce the
-- same Premium entitlement there while allowing the Monogram default.
create or replace function public.enforce_show_style_write_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- SECURITY DEFINER writers execute as postgres, so current_user alone does
  -- not distinguish trusted maintenance from an authenticated caller. Keep the
  -- JWT identity visible to the trigger and enforce Premium for any
  -- user-originated privileged insert/update as well as ordinary table writes.
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.style is not null
         and new.style <> 'monogram'
         and not public.has_effective_premium_access(public.get_my_person_id(), now()) then
        raise exception 'Premium access is required for this show style'
          using errcode = '42501';
      end if;
    elsif current_user <> 'postgres'
          and new.style is distinct from old.style then
      raise exception 'Show style must be changed through update_show_style'
        using errcode = '42501';
    elsif tg_op = 'UPDATE'
          and new.style is distinct from old.style
          and new.style <> 'monogram'
          and not public.has_effective_premium_access(public.get_my_person_id(), now()) then
      raise exception 'Premium access is required for this show style'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shows_style_rpc_boundary on public.shows;
create trigger trg_shows_style_rpc_boundary
  before insert or update of style on public.shows
  for each row
  execute function public.enforce_show_style_write_boundary();

-- The trigger is an internal implementation detail, not a client RPC.
revoke all on function public.enforce_show_style_write_boundary() from public, anon, authenticated;

create or replace function public.update_show_style(
  p_show_id uuid,
  p_style text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_version integer;
begin
  if p_style is null or p_style not in (
    'monogram', 'banner', 'headline', 'magazine',
    'poster', 'gazette', 'fieldGuide', 'heritage'
  ) then
    raise exception 'Invalid show style' using errcode = '22023';
  end if;

  select s.club_id into v_club_id
  from public.shows s
  where s.id = p_show_id
    and s.deleted_at is null
  for update;

  if not found then
    raise exception 'Show not found' using errcode = '22023';
  end if;

  if not (
    public.is_site_admin()
    or (
      v_club_id is not null
      and (
        public.is_trial_secretary(v_club_id)
        or public.is_club_admin(v_club_id)
      )
    )
  ) then
    raise exception 'Not authorized to update this show style' using errcode = '42501';
  end if;

  if p_style <> 'monogram'
     and not public.has_effective_premium_access(public.get_my_person_id(), now()) then
    raise exception 'Premium access is required for this show style' using errcode = '42501';
  end if;

  update public.shows
  set style = p_style
  where id = p_show_id
  returning version into v_version;

  return v_version;
end;
$$;

comment on function public.update_show_style(uuid, text) is
  'Draft-only, style-only show presentation command. Authorizes the caller as a site admin or manager of the show club, then requires effective Premium access for every style except monogram; unrelated show fields remain untouched.';

revoke all on function public.update_show_style(uuid, text) from public, anon;
grant execute on function public.update_show_style(uuid, text) to authenticated;
