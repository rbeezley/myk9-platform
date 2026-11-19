-- MYK9-2055: every show style is free (owner decision, recorded on MYK9-1952).
--
-- The paid tier gated exactly one thing on this path: `has_effective_premium_access` refused any
-- style but 'monogram' in update_show_style and in the shows write-boundary trigger (insert and
-- update). Both checks are removed; nothing else changes.
--
-- Deliberately left untouched: `has_effective_premium_access` itself and every other thing it
-- gates (the exhibitor dog-record and manual-result write policies in 20260724120000, AskQ quota
-- in 20260801210000). Tenant authorization (site admin, club secretary or club admin), style
-- validation and the "style changes only through update_show_style" boundary are kept as-is.
--
-- Both bodies are copied from 20260920130937_myk9_691_update_show_style.sql, the latest migration
-- defining them, with only the Premium branches removed.

create or replace function public.enforce_show_style_write_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- SECURITY DEFINER writers execute as postgres, so current_user alone does not distinguish
  -- trusted maintenance from an authenticated caller. Keep the JWT identity visible to the trigger:
  -- an authenticated caller may insert any style, but may change an existing show's style only
  -- through update_show_style.
  if auth.uid() is not null
     and tg_op = 'UPDATE'
     and current_user <> 'postgres'
     and new.style is distinct from old.style then
    raise exception 'Show style must be changed through update_show_style'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- CREATE OR REPLACE keeps the existing trigger binding; the grants are restated, not widened.
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

  update public.shows
  set style = p_style
  where id = p_show_id
  returning version into v_version;

  return v_version;
end;
$$;

comment on function public.update_show_style(uuid, text) is
  'Draft-only, style-only show presentation command. Authorizes the caller as a site admin or manager of the show club; every style is free (MYK9-2055); unrelated show fields remain untouched.';

revoke all on function public.update_show_style(uuid, text) from public, anon;
grant execute on function public.update_show_style(uuid, text) to authenticated;
