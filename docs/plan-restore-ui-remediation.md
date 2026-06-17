# Plan: Fix the Deleted Entities (restore) UI

> **Status:** Active

**Found:** 2026-06-16, during a manual restore walk (deleting Dog 1 then trying to restore it).

## Problem
The admin restore UI (`/admin/data-lifecycle` → Deleted Entities) works for only
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

Restore **writes** are fine: `dogs_update`/`shows_update`/`classes_update` carry no
`deleted_at` block, so admins can restore once a row is listed. Only the **read**
side is broken.

This also makes PR #781's dialog copy ("can be restored by an administrator from
Admin → Data Lifecycle") currently **false for dogs**.

## Approach
Two surgical fixes, no change to normal (non-deleted) read paths:

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
   surface "Data Lifecycle" in the admin sidebar (currently URL-only / parked).

## Out of scope
- Sidebar discoverability of the Data Lifecycle page (parked by config) — a
  separate IA decision, noted in Phase 4.
- Cascade-restore (restoring a dog also restoring its cascade-deleted entries) —
  entries restore independently; revisit only if the manual two-step proves painful.
