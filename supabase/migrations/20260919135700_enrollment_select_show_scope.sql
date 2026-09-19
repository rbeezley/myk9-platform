-- MYK9-663 follow-up: preserve exact-show scope for show-pinned club admins
-- across entry/enrollment reads and manager writes.
--
-- 20260918173900_scope_enrollments_select_to_show_club.sql is already applied,
-- so this correction must be a new migration. The shared
-- manageable_show_ids() helper intentionally treats club_admin as club-wide;
-- using it directly for enrollments also widened a permitted
-- {club_admin, club_id C, show_id S1} row to every show of C.

begin;

-- The shared manager predicates were also widening show-pinned club_admin rows:
-- is_club_admin(club_id) intentionally answers a club-wide question, while an
-- individual user_roles row may be pinned to one show. Keep the existing role
-- set and show-scoped secretary behavior, but make a pinned club_admin exact.
create or replace function public.can_manage_show(check_show_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shows s
    where s.id = check_show_id
      and (
        (select public.is_platform_admin())
        or (
          s.club_id is not null
          and exists (
            select 1
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id
            where ur.auth_user_id = (select auth.uid())
              and r.name = 'club_admin'
              and ur.club_id = s.club_id
              and (ur.show_id is null or ur.show_id = s.id)
              and ur.is_active = true
              and (ur.expires_at is null or ur.expires_at > now())
          )
        )
        or (s.club_id is not null and (select public.is_trial_secretary(s.club_id)))
      )
  );
$$;

create or replace function public.is_show_office_manager(check_show_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shows s
    where s.id = check_show_id
      and (
        (select public.is_site_admin())
        or (
          s.club_id is not null
          and exists (
            select 1
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id
            where ur.auth_user_id = (select auth.uid())
              and r.name = 'club_admin'
              and ur.club_id = s.club_id
              and (ur.show_id is null or ur.show_id = s.id)
              and ur.is_active = true
              and (ur.expires_at is null or ur.expires_at > now())
          )
        )
        or (s.club_id is not null and (select public.is_trial_secretary(s.club_id)))
        or exists (
          select 1
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.auth_user_id = (select auth.uid())
            and ur.is_active = true
            and (ur.expires_at is null or ur.expires_at > now())
            and r.name in ('secretary', 'trial_secretary')
            and ur.show_id = check_show_id
        )
      )
  );
$$;

create or replace function public.entry_enrollment_select_show_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Club-scoped managers retain club-wide access within their own club.
  select s.id
  from public.shows s
  where (select public.is_site_admin())
     or (
       s.club_id is not null
       and exists (
         select 1
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id
         where ur.auth_user_id = (select auth.uid())
           and r.name = 'club_admin'
           and ur.club_id = s.club_id
           and ur.show_id is null
           and ur.is_active = true
           and (ur.expires_at is null or ur.expires_at > now())
       )
     )
     or (s.club_id is not null and (select public.is_trial_secretary(s.club_id)))

  union

  -- A show-pinned club_admin is limited to the show named by that row.
  select ur.show_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.shows s on s.id = ur.show_id and s.club_id = ur.club_id
  where ur.auth_user_id = (select auth.uid())
    and r.name = 'club_admin'
    and ur.show_id is not null
    and ur.is_active = true
    and (ur.expires_at is null or ur.expires_at > now())

  -- Preserve the pre-existing show-scoped secretary read path.
  union
  select ur.show_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.auth_user_id = (select auth.uid())
    and r.name = 'secretary'
    and ur.show_id is not null
    and ur.is_active = true
    and (ur.expires_at is null or ur.expires_at > now());
$$;

comment on function public.entry_enrollment_select_show_ids() is
  'Entry/enrollment scope: club-scoped managers see their club shows; show-scoped secretaries retain their assigned show; a show-pinned club_admin sees only its assigned show; site admins see all shows.';

revoke all on function public.entry_enrollment_select_show_ids() from public, anon;
grant execute on function public.entry_enrollment_select_show_ids() to authenticated, service_role;

drop policy if exists "enrollments_select" on public.enrollments;

create policy "enrollments_select"
  on public.enrollments
  for select
  to public
  using (
    public.is_site_admin()
    or public.is_show_official(show_id)
    or public.is_platform_admin()
    or handler_id in (
      select p.id
      from public.people p
      where p.auth_user_id = (select auth.uid())
    )
    or show_id in (select public.entry_enrollment_select_show_ids())
  );

alter policy entries_select on public.entries
  using (
    entries.show_id in (select public.entry_enrollment_select_show_ids())
    or exists (
      select 1
      from public.people p
      where p.auth_user_id = (select auth.uid())
        and p.id = entries.handler_id
    )
    or exists (
      select 1
      from public.people p
      join public.dogs d on d.owner_id = p.id
      where p.auth_user_id = (select auth.uid())
        and d.id = entries.dog_id
    )
  );

comment on policy "enrollments_select" on public.enrollments is
  'Role arm is scoped by entry_enrollment_select_show_ids(): club-scoped managers see their own club, show-scoped secretaries retain their assigned show, and show-pinned club_admin rows remain exact-show. The is_show_official and handler_id arms preserve official and owner reads.';

comment on policy "entries_select" on public.entries is
  'Manager reads use entry_enrollment_select_show_ids(): club-scoped managers see their own club, show-scoped secretaries retain their assigned show, and show-pinned club_admin rows remain exact-show. Handler and dog-owner arms preserve exhibitor reads.';

notify pgrst, 'reload schema';

commit;
