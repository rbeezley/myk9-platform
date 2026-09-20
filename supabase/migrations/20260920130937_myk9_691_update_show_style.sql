-- MYK9-691: authorize the narrow, style-only show presentation command.
-- The client must not update public.shows directly for this field: this RPC
-- keeps tenant authorization and account-Premium entitlement server-owned.

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
