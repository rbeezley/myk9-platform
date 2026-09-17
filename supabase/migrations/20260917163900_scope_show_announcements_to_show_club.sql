-- MYK9-636: public.show_announcements had NO show or club scoping on any of its
-- mutation policies.
--
-- The INSERT policy (089_security_sa022_announcements_rls.sql, last restated by
-- 20260727130000_rls_initplan_wrap_auth_calls.sql) was:
--
--   WITH CHECK (((SELECT auth.uid()) = author_id) OR (SELECT is_platform_admin()))
--
-- i.e. the only condition was "the row names me as its author". `show_id` was
-- unconstrained, table grants are `authenticated=arwd`, and the client writes
-- the table directly over PostgREST with a client-supplied `show_id`
-- (apps/myk9show/src/services/database/announcements/writes.ts), so RLS was the
-- only boundary and ANY authenticated account -- exhibitor, judge, a spectator
-- who signed up -- could post a show-wide announcement onto any club's show.
--
-- That is not merely a stray row: `on_announcement_insert_push` is
-- AFTER INSERT ... WHEN (new.priority IN ('high','urgent')) and fans the row out
-- as a web push to that show's subscribers, so the gap was a broadcast channel
-- into another club's event on show day.
--
-- UPDATE and DELETE were author-or-platform-admin only, so the affected show's
-- OWN secretary could not remove an announcement somebody else posted on their
-- show. Only the author or a platform admin could.
--
-- Fix: give all three policies the club predicate that `show_messages` -- the
-- targeted-message sibling in the same feature -- has carried since
-- 20260916015300 (MYK9-585):
--
--   EXISTS (SELECT 1 FROM shows s
--           WHERE s.id = <table>.show_id
--             AND s.club_id IS NOT NULL
--             AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)))
--
-- INSERT keeps `author_id = auth.uid()` as a conjunct (you may only post as
-- yourself) and gains the club predicate; UPDATE and DELETE keep author-or-admin
-- and gain the club predicate as an additional arm, which is a WIDENING for the
-- show's own secretary and club admin and a NARROWING for nobody.
--
-- The `s.club_id IS NOT NULL` guard is load-bearing and not decoration:
-- is_trial_secretary(NULL) / is_club_admin(NULL) mean "is this user a secretary
-- / club admin ANYWHERE", so a club-less show would match every active secretary
-- on the platform (MYK9-258 / MYK9-329 / MYK9-585). Two club-less `ZZ Audit`
-- shows are still live on staging. A club-less show therefore admits nobody here
-- but the platform admin, by design.
--
-- Same class as MYK9-577 (entries_insert), which this table was missed by.
--
-- No new table, so no GRANT changes: relacl on the linked database is
-- {postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}
-- -- `anon` holds no privilege at all on this table, so the anon role cannot
-- reach these policies regardless.

begin;

drop policy if exists "Authenticated users can create announcements" on public.show_announcements;
drop policy if exists "Author or admin can update announcements" on public.show_announcements;
drop policy if exists "Author or admin can delete announcements" on public.show_announcements;

-- INSERT: you may post only as yourself, and only onto a show whose club you run.
create policy "Authenticated users can create announcements" on public.show_announcements
  for insert to authenticated
  with check (
    (
      author_id = (select auth.uid())
      and exists (
        select 1
        from public.shows s
        where s.id = show_announcements.show_id
          and s.club_id is not null
          and (is_trial_secretary(s.club_id) or is_club_admin(s.club_id))
      )
    )
    or (select is_platform_admin())
  );

-- UPDATE: the author, the show's own secretary / club admin, or a platform
-- admin. No WITH CHECK clause, so Postgres applies USING to the new row too --
-- an update cannot move an announcement onto a show the caller does not run.
create policy "Author or admin can update announcements" on public.show_announcements
  for update to authenticated
  using (
    (select auth.uid()) = author_id
    or exists (
      select 1
      from public.shows s
      where s.id = show_announcements.show_id
        and s.club_id is not null
        and (is_trial_secretary(s.club_id) or is_club_admin(s.club_id))
    )
    or (select is_platform_admin())
  );

-- DELETE: same set. This is the arm that lets a secretary remove a stray
-- announcement on their own show, which MYK9-636 reported as impossible.
create policy "Author or admin can delete announcements" on public.show_announcements
  for delete to authenticated
  using (
    (select auth.uid()) = author_id
    or exists (
      select 1
      from public.shows s
      where s.id = show_announcements.show_id
        and s.club_id is not null
        and (is_trial_secretary(s.club_id) or is_club_admin(s.club_id))
    )
    or (select is_platform_admin())
  );

comment on table public.show_announcements is
  'Show-wide announcements. Mutation policies are row-scoped to the '
  'announcement''s own show via the shows.club_id predicate shared with '
  'show_messages: INSERT requires author_id = auth.uid() AND that the caller is '
  'the show''s trial secretary or club admin; UPDATE/DELETE allow the author, '
  'that same club pair, or a platform admin. A show with a NULL club_id admits '
  'nobody but the platform admin (MYK9-258 guard). MYK9-636.';

notify pgrst, 'reload schema';

commit;
