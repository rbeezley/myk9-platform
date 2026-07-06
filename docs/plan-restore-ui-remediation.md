# Plan: Fix the Deleted Entities (restore) UI

> **Status:** Active

**Found:** 2026-06-16, during a manual restore walk (deleting Dog 1 then trying to restore it).

## Problem
The admin restore UI (`/admin/deleted-items` → Deleted Items) works for only
**1 of 7** entity types (Clubs). Two independent root causes:

- **A — RLS-blocked reads (dogs, shows, classes, people).** Their `*_select`
  policies hard-code `deleted_at IS NULL` for *every* role, so not even a
  `site_admin` can SELECT a soft-deleted row. The count badge (a head-count) and
  the list both return 0 → the section never appears. Verified: as the admin JWT,
  `SELECT count(*) ... WHERE deleted_at IS NOT NULL` returns 0 for all four.
- **B — broken relational embeds (trials, entries, users).** The list reads embed
  `deleted_by_user:deleted_by(...)` selecting `first_name/last_name`, but
  `deleted_by` FKs **`auth.users`** (which lacks those columns and isn't exposed
  to the Data API). PostgREST errors → the list returns empty *even though* the
  count (no embed) correctly shows 24 trials / 8 entries.

- **C — RLS-blocked restore *writes* (dogs, shows, classes, people).** _(Found
  2026-06-17, during the live restore walk — corrects an earlier wrong assumption
  that "writes are fine.")_ The restore services issue a direct
  `UPDATE <t> SET deleted_at = NULL WHERE id = X RETURNING ...`. That matches **0
  rows**: PostgreSQL applies the table's SELECT policy during the UPDATE's
  row-location step (the `WHERE`/`RETURNING` read columns), and the same
  `deleted_at IS NULL` block from (A) makes the tombstone unlocatable. The
  `*_update` policies never get a chance to run. Verified as the admin JWT:
  `UPDATE ... WHERE deleted_at IS NOT NULL` returns `UPDATE 0` for shows (and the
  restore toast fails), but `UPDATE 24` for trials — whose SELECT policy keys off
  the parent show's `deleted_at`, not its own, so admins can see/update tombstones.
  `clubs`/`entries` have no SELECT block either, so their restore keeps working.

This also made PR #781's dialog copy ("can be restored by an administrator from
Admin → Deleted Items") false for dogs before the restore RPC work.

## Approach
Three surgical fixes, no change to normal (non-deleted) read paths:

- **Embeds (B):** drop the invalid `deleted_by → auth.users` embed from the
  deleted-list reads. The "deleted by" name is non-essential for a restore list;
  removing it lets the query succeed. Keep valid embeds (`show:shows`,
  `dog:dog_id`) where RLS permits.
- **RLS-blocked reads (A):** add admin-gated `SECURITY DEFINER` read RPCs
  (`get_deleted_dogs/shows/classes/people`) that return base deleted rows,
  bypassing RLS. Chosen over loosening the `*_select` policies because those
  tables hide deleted rows via RLS *by design* (normal lists rely on it) — an RPC
  has zero leak risk into normal views and mirrors the existing `soft_delete_dog`
  SECURITY DEFINER pattern. Each RPC raises/returns empty unless
  `is_platform_admin()`.
- **RLS-blocked restore writes (C):** add admin-gated `SECURITY DEFINER` write RPCs
  (`restore_dog/show/class/person`) that clear `deleted_at`/`deleted_by`, bypassing
  the SELECT policy that blocks row location. Re-point `restoreDog/Show/Class/User`
  to call them (`restoreTrial/Entry/Club` keep their direct `.update()` — their
  tables aren't SELECT-blocked). Each RPC **cascade-restores** exactly the rows the
  matching `soft_delete_*` cascade tombstoned, identified by an identical
  `deleted_at` timestamp (a cascade stamps every row with one transaction-frozen
  `NOW()`), so delete/restore are true inverses without disturbing
  independently-deleted rows.

## Phases
1. **Embed fix** — repair `getDeletedTrials`, `getDeletedEntries`,
   `getDeletedUsers` (remove the `auth.users` deleted_by embed). Trials + Entries
   lists populate immediately (RLS already allows).
2. **Admin read RPCs** — migration adding `get_deleted_dogs/shows/classes/people`
   (SECURITY DEFINER, `is_platform_admin()`-gated, `GRANT EXECUTE` to
   authenticated). Wire `getDeletedDogs/Shows/Classes/getDeletedUsers` to call
   them; drop their now-unnecessary/over-reaching embeds.
3. **Tests** — RPC permission gate (admin vs non-admin), deleted-list column-set,
   and a transactional restore round-trip per type. Unit-test the read wiring.
4. **Verify** — walk all 7 types in the restore UI (list shows rows → restore →
   row returns). Reconcile #781 copy (now accurate). Decide separately whether to
   surface "Deleted Items" in the admin sidebar.
5. **Restore write RPCs (C)** — migration `20260617120000_restore_entity_rpcs.sql`
   adding `restore_dog/show/class/person` (SECURITY DEFINER, `is_platform_admin()`
   gate, `REVOKE … FROM PUBLIC` + `GRANT EXECUTE` to authenticated, cascade-restore
   by timestamp match). Re-point the four restore services. Source-pinning tests for
   the RPC wiring + migration contract. Logic validated against the live Alpha 1
   tombstone in a `BEGIN … ROLLBACK` (dog + both entries restored, zero persistence).

## Out of scope
- Sidebar discoverability of the Deleted Items page — a
  separate IA decision, noted in Phase 4.
