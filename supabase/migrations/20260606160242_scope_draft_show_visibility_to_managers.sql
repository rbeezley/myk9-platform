-- Scope draft show visibility to users who can manage the show.
--
-- Root cause: migration 120 made every draft visible to any trial secretary via
-- unscoped is_trial_secretary(). That exposed orphan admin/E2E drafts with
-- club_id NULL to secretaries who could view them but could not delete them,
-- producing a confusing delete failure.

drop policy if exists "shows_select" on public.shows;

create policy "shows_select" on public.shows
  for select
  using (
    deleted_at is null
    and (
      status in ('published', 'upcoming', 'in_progress', 'completed')
      or (
        club_id is not null
        and (
          (select public.is_club_admin(club_id))
          or (select public.is_trial_secretary(club_id))
        )
      )
      or (select public.is_site_admin())
    )
  );

comment on policy "shows_select" on public.shows is
  'Published/upcoming/in-progress/completed shows are visible broadly; drafts are visible only to users who can manage the show or site admins.';
