-- Include show-scoped secretaries in draft show visibility.
--
-- The previous shows_select policy scoped draft visibility to club-level
-- secretary/admin grants. That still hid draft shows from users who were
-- assigned as secretary directly on the show, even though is_show_secretary(id)
-- already recognizes both show-scoped and club-scoped secretary rows.

drop policy if exists "shows_select" on public.shows;

create policy "shows_select" on public.shows
  for select
  using (
    deleted_at is null
    and (
      status in ('published', 'upcoming', 'in_progress', 'completed')
      or (
        club_id is not null
        and (select public.is_club_admin(club_id))
      )
      or (select public.is_show_secretary(id))
      or (select public.is_site_admin())
    )
  );

comment on policy "shows_select" on public.shows is
  'Published/upcoming/in-progress/completed shows are visible broadly; drafts are visible to site admins, club admins for the club, and show/club-scoped secretaries for the show.';
