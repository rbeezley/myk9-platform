-- Security advisor follow-up: close remaining app-owned always-true RLS
-- warnings without changing active show-day flows.
--
-- The legacy `announcements` / `announcement_reads` tables came from the old
-- myK9Q surface and are empty in the linked project. myK9Show uses
-- `show_announcements` / `show_announcement_reads`, which have scoped policies.
drop policy if exists "announcements_all" on public.announcements;
drop policy if exists "announcements_select" on public.announcements;
drop policy if exists "announcements_site_admin_select" on public.announcements;
drop policy if exists "announcement_reads_insert" on public.announcement_reads;
drop policy if exists "announcement_reads_select" on public.announcement_reads;
drop policy if exists "announcement_reads_site_admin_select" on public.announcement_reads;

revoke all on table public.announcements from anon, authenticated;
revoke all on table public.announcement_reads from anon, authenticated;

grant select on table public.announcements to authenticated;
grant select on table public.announcement_reads to authenticated;

create policy "announcements_site_admin_select"
  on public.announcements
  for select
  to authenticated
  using (public.is_site_admin());

create policy "announcement_reads_site_admin_select"
  on public.announcement_reads
  for select
  to authenticated
  using (public.is_site_admin());

-- `entry_status_history` is retained as a read-only audit table. No current app
-- code inserts rows directly, and broad public reads/inserts are unnecessary.
drop policy if exists "entry_status_history_select" on public.entry_status_history;
drop policy if exists "entry_status_history_insert" on public.entry_status_history;

revoke all on table public.entry_status_history from anon, authenticated;
grant select on table public.entry_status_history to authenticated;

create policy "entry_status_history_select"
  on public.entry_status_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.entries
      where entries.id = entry_status_history.entry_id
    )
  );

-- `platform_waitlist` intentionally remains public insert-only, but the
-- advisor correctly flags `WITH CHECK (true)`. Keep anonymous signup working
-- while asserting the minimum row shape the landing form requires.
drop policy if exists "Anyone can join the waitlist" on public.platform_waitlist;
drop policy if exists "Site admins can read the waitlist" on public.platform_waitlist;
drop policy if exists "Site admins can update waitlist entries" on public.platform_waitlist;
drop policy if exists "Site admins can delete waitlist entries" on public.platform_waitlist;
drop policy if exists "anon_can_insert_waitlist" on public.platform_waitlist;
drop policy if exists "site_admins_read_waitlist" on public.platform_waitlist;

revoke all on table public.platform_waitlist from anon, authenticated;
grant insert on table public.platform_waitlist to anon, authenticated;
grant select on table public.platform_waitlist to authenticated;

create policy "anon_can_insert_waitlist"
  on public.platform_waitlist
  for insert
  to anon, authenticated
  with check (
    email is not null
    and length(btrim(email)) between 3 and 320
    and position('@' in email) > 1
    and source is not null
    and length(btrim(source)) > 0
  );

create policy "site_admins_read_waitlist"
  on public.platform_waitlist
  for select
  to authenticated
  using (public.is_site_admin());
