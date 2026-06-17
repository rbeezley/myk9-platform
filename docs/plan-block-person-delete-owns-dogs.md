# Plan: Block deleting a person who still owns dogs

> **Status:** Active

**Found:** 2026-06-17, follow-up to the restore-UI work (PR #790). While confirming
cascade behavior we asked: *what happens to a dog (and its entries) when its owner
is deleted?*

## Problem
Deleting a person **orphans their dogs** — under both delete modes:

- **Soft delete ("Deactivate", `deleteUser`):** sets `people.deleted_at` only. No
  cascade. The dog stays live with `owner_id` still pointing at the now-tombstoned
  person. Verified live (Test Secretary → "Bravo", 80 entries: dog + entries
  untouched).
- **Permanent delete (`admin-delete-user` edge fn):** the FKs back to `people`
  (`dogs.owner_id/co_owner_id/breeder_id`, `entries.handler_id`) are
  `ON DELETE SET NULL`, so the dog/entries **survive but become ownerless**.

Either way the dog is never removed — it lingers as an orphan. `OrphanedRecordsCleaner`
already has a `dogs_without_owners` category, confirming orphans are unwanted cruft.

There is **no reassign-owner UI** today (`updateDog` doesn't expose `owner_id`; the
dog hero doesn't show the owner), so the only way to avoid the orphan is to delete
the dogs first.

Secondary bug: `AdminDeleteUserDialog`'s permanent-delete warning claims it removes
"all related records (**dogs, entries**, registrations)" — false. Dogs/entries are
`SET NULL`, not cascaded.

## Decision (user, 2026-06-17)
**Hard block**, not warn. Escape hatch = **delete the dogs first** (no reassign flow —
out of scope). Block on **primary `owner_id` only** (a co-owned dog keeps its primary
owner, so it isn't orphaned; the dangling `co_owner_id` is minor untidiness).

## Approach
The rule is an **invariant** ("a person who owns ≥1 live dog cannot be deleted"), so
enforce it with a **DB trigger** — path-independent, covers the service, the edge
function, the cleaner, and any future caller with zero changes to the 7 `deleteUser`
callers. The UI dialog adds a friendly pre-check so the admin never hits the raw error.

## Phases
1. **DB invariant** — migration `20260617130000_block_person_delete_with_dogs.sql`:
   one trigger function `prevent_orphaning_dogs_on_person_delete()` wired to both
   `BEFORE DELETE` and `BEFORE UPDATE OF deleted_at` on `public.people`. Raises
   (ERRCODE `23503`-style, custom message) when `EXISTS (SELECT 1 FROM dogs WHERE
   owner_id = OLD.id AND deleted_at IS NULL)`. The UPDATE arm fires only on the
   `deleted_at` NULL→NOT NULL transition (so restore/other updates pass).
2. **Count service** — `countOwnedLiveDogsByPerson(personId)` (direct PostgREST head
   count, mirrors `countActiveEntriesByDog` from #780) + a light list (names/ids) for
   the dialog.
3. **UI block** — `AdminDeleteUserDialog` pre-checks owned-dog count on open; if >0,
   replaces the mode chooser with a block panel ("Can't delete — owns N dogs: …
   Delete those dogs first."), disables both delete buttons. Fix the misleading
   permanent-delete "related records" copy (drop dogs/entries; it's roles, club
   memberships, judge data, notifications, stripe customer).
4. **Tests** — migration source contract (trigger on both ops, owner_id-only,
   deleted_at-transition guard); dialog block behavior (renders block + buttons
   disabled when count>0; normal when 0); count service.

## Out of scope
- Reassign-owner flow (no UI exists; deliberately not built).
- Co-owner / breeder dangling references (don't orphan; leave as-is).
- Bulk-delete UI pre-check — the trigger still protects integrity; friendly bulk
  messaging is a follow-up.
