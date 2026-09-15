-- MYK9-577: entries_insert was the only unscoped policy on public.entries.
--
-- Write-path trace (see PR description / Linear MYK9-577 for the full table):
--   1. Exhibitor self-entry (online cart -> Stripe checkout) goes through the
--      SECURITY DEFINER RPC public.submit_show_entries (migration 151+),
--      which bypasses RLS entirely and enforces its own dog-ownership /
--      fee / payment-method checks. entries_insert never fires on this path.
--   2. Secretary desk/offline entry (OfflineEntryCreator ->
--      useEntryStore.createEntry -> replicatedEntriesTable.createEntry)
--      queues a mutation that packages/replication's executeMutation()
--      uploads via a plain `supabase.from('entries').insert(data)` as the
--      authenticated secretary -- no RPC, no SECURITY DEFINER hop. This is
--      the ONLY path where entries_insert is the sole authorization gate,
--      and it ran with a WITH CHECK that verified only "does this person
--      hold secretary/trial_secretary/club_admin/site_admin ANYWHERE",
--      never the inserted row's own show_id. A secretary appointed to Club
--      A could insert an offline entry onto a Club B show.
--
-- migration 151's own comment claimed the RPC performed "the show-scoped
-- check ... inside the RPC" and treated the unscoped table policy as safe
-- by construction. That reasoning does not hold for the direct-insert path
-- above, which never touches the RPC. This is not a deliberate approved
-- boundary; it is the gap this migration closes.
--
-- Fix: restate entries_insert using public.can_manage_show(entries.show_id),
-- the same row-scoped predicate already used by entries_select and
-- entries_update (20260604004045_restrict_entries_update_to_managers.sql),
-- so INSERT, SELECT and UPDATE agree on who may touch a given show's
-- entries. can_manage_show() already folds in is_platform_admin(), so a
-- site admin needs no separate clause.

begin;

drop policy if exists "entries_insert" on public.entries;

create policy "entries_insert" on public.entries
  for insert to authenticated
  with check ((select public.can_manage_show(entries.show_id)));

comment on policy "entries_insert" on public.entries is
  'Row-scoped to the inserted entry''s own show via can_manage_show(show_id) '
  '(club admin, club-scoped secretary/trial_secretary, or site admin for '
  'THAT show''s club -- matches entries_select/entries_update). Exhibitor '
  'self-entry never hits this policy: it goes through the SECURITY DEFINER '
  'submit_show_entries RPC, which bypasses RLS and does its own dog-ownership '
  'check. The only direct-INSERT caller is the secretary offline/desk-entry '
  'path (replicatedEntriesTable.createEntry -> executeMutation), which was '
  'previously authorized by an unscoped "holds secretary role ANYWHERE" '
  'check (migration 151) -- MYK9-577.';

notify pgrst, 'reload schema';

commit;
