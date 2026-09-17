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
-- only boundary and ANY authenticated account -- exhibitor, a spectator who
-- signed up -- could post a show-wide announcement onto any club's show.
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
-- WHO MAY POST, after this migration. Two arms, both row-scoped to the
-- announcement's own show:
--
--   CLUB arm -- the predicate `show_messages`, the targeted-message sibling in
--   the same feature, has carried since 20260916015300 (MYK9-585):
--
--     EXISTS (SELECT 1 FROM shows s
--             WHERE s.id = <table>.show_id
--               AND s.club_id IS NOT NULL
--               AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)))
--
--   JUDGE arm -- `ANNOUNCEMENT_OFFICIAL_ROLES` in
--   apps/myk9show/src/types/announcement-types.ts has always included 'judge',
--   and the Message Center composer offers the capability to any show official.
--   The live database holds judge accounts with no secretary or club_admin role,
--   so a club-only predicate would have turned a working UI path into a 42501
--   and a generic error toast. The arm is the assignment join the entry-results
--   caller context uses (private.entry_results_caller_context's judge_context:
--   judge_assignments by the caller's people row, status IN ('confirmed',
--   'invited')), scoped to the show by `ja.show_id`, which is how
--   public.get_show_judges resolves the same question. All 18 live assignment
--   rows carry a show_id.
--
--   Judges get INSERT on shows they are assigned to, and UPDATE of their OWN
--   rows. Deleting somebody ELSE's announcement stays a secretary / club-admin /
--   platform-admin power; a judge reaches only their own row, through the
--   pre-existing author arm.
--
-- The `s.club_id IS NOT NULL` guard is load-bearing and not decoration:
-- is_trial_secretary(NULL) / is_club_admin(NULL) mean "is this user a secretary
-- / club admin ANYWHERE", so a club-less show would match every active secretary
-- on the platform (MYK9-258 / MYK9-329 / MYK9-585). Two club-less `ZZ Audit`
-- shows are still live on staging. A club-less show therefore admits nobody here
-- but the platform admin and a judge assigned to it, by design.
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

-- INSERT: you may post only as yourself, and only onto a show you run (club arm)
-- or are judging (judge arm).
create policy "Authenticated users can create announcements" on public.show_announcements
  for insert to authenticated
  with check (
    (
      author_id = (select auth.uid())
      and (
        exists (
          select 1
          from public.shows s
          where s.id = show_announcements.show_id
            and s.club_id is not null
            and (is_trial_secretary(s.club_id) or is_club_admin(s.club_id))
        )
        or exists (
          select 1
          from public.judge_assignments ja
          join public.people p on p.id = ja.person_id
          where ja.show_id = show_announcements.show_id
            and p.auth_user_id = (select auth.uid())
            and p.deleted_at is null
            and ja.status in ('confirmed', 'invited')
        )
      )
    )
    or (select is_platform_admin())
  );

-- UPDATE. USING says which rows you may reach; WITH CHECK says what the row may
-- become, and it is NOT optional here.
--
-- Omitting WITH CHECK makes Postgres reuse USING for the new row -- which sounds
-- equivalent and is not, because USING is a DISJUNCTION with a show-INDEPENDENT
-- arm. `(select auth.uid()) = author_id` holds for the new row no matter what
-- `show_id` the caller sets, so an author could
-- `UPDATE ... SET show_id = <another club's show>, priority = 'urgent'` on their
-- own row and relocate it -- push fan-out and all -- onto a show they have
-- nothing to do with. Caught in review of this migration, and reproduced
-- (UPDATE 1) before the WITH CHECK below was added.
--
-- So the NEW row must satisfy a SHOW-SCOPED arm: the club arm (a secretary or
-- club admin may edit anyone's announcement on their own show), the judge arm on
-- their OWN row, or platform admin. There is deliberately no bare author arm:
-- a policy cannot see OLD from WITH CHECK, so "author, as long as show_id did
-- not change" is not expressible -- and an author who is neither this show's
-- official nor its judge can no longer create such a row in the first place.
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
  )
  with check (
    exists (
      select 1
      from public.shows s
      where s.id = show_announcements.show_id
        and s.club_id is not null
        and (is_trial_secretary(s.club_id) or is_club_admin(s.club_id))
    )
    or (
      author_id = (select auth.uid())
      and exists (
        select 1
        from public.judge_assignments ja
        join public.people p on p.id = ja.person_id
        where ja.show_id = show_announcements.show_id
          and p.auth_user_id = (select auth.uid())
          and p.deleted_at is null
          and ja.status in ('confirmed', 'invited')
      )
    )
    or (select is_platform_admin())
  );

-- DELETE: the author (their own row, including a judge's), the show's own
-- secretary / club admin (any row on their show -- the arm MYK9-636 reported as
-- missing), or a platform admin. A judge deleting SOMEBODY ELSE's announcement
-- matches no arm, so the row is simply not reachable and the DELETE removes
-- nothing.
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
  'announcement''s own show. INSERT requires author_id = auth.uid() AND either '
  'the shows.club_id predicate shared with show_messages (trial secretary or '
  'club admin of THAT show''s club) or a confirmed/invited judge_assignments row '
  'for that show. UPDATE carries an explicit WITH CHECK so the NEW row must also '
  'satisfy a show-scoped arm -- without it the author arm of USING would let an '
  'author relocate their own announcement onto another club''s show. DELETE '
  'allows the author, that same club pair, or a platform admin. A show with a '
  'NULL club_id reaches nobody through the club arm (MYK9-258 guard). MYK9-636.';

notify pgrst, 'reload schema';

commit;
