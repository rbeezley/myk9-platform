# Plan: Fix person soft-delete (RLS WITH-CHECK block)

> **Status:** Active

**Found:** 2026-06-17, manual delete walk. Deactivating a person (admin Users
table) and the People-detail-page "Delete Person" both failed with *"new row
violates row-level security policy for table people"*.

## Root cause
PostgreSQL enforces a table's **SELECT policy as an implicit WITH CHECK on an
UPDATE's new row** (you can't update a row into a state you can't see).
`people_select` requires `deleted_at IS NULL`, so the moment a soft-delete sets
`deleted_at`, the new row fails that check and the UPDATE is rejected. Verified by
opening `people_select` to `USING (true)` in a rollback — the soft-delete then
succeeded. Pre-existing; unrelated to the owns-dogs guard (PR #793).

dogs/shows/classes don't hit this because their soft-delete already runs through
`soft_delete_dog/show/class` SECURITY DEFINER RPCs. **`people` was the only entity
soft-deleting via a direct client `.update()`** (`deleteUser`), so it was the only
one broken.

## Fix
Add `soft_delete_person(p_person_id)` SECURITY DEFINER RPC (migration
`20260617140000`), mirroring the sibling soft_delete_* functions. SECURITY DEFINER
runs as `postgres` (superuser), bypassing RLS incl. FORCE RLS. Gated on
`is_site_admin() OR can_manage_show_person()`. Rewire the `deleteUser` service to
call it — both delete surfaces (admin Users table, People detail page) converge on
that one service, so both are fixed at once. The owns-dogs guard trigger still
fires on the UPDATE inside the RPC (MK001 preserved). Permanent delete already
worked (edge fn runs as service_role).

## Phases
1. **RPC + migration** — `20260617140000_soft_delete_person_rpc.sql`.
2. **Rewire** — `deleteUser` → `supabase.rpc('soft_delete_person', …)`; type the RPC
   in `database.types.ts`; drop the now-unused `TablesUpdate` import.
3. **Tests** — source-pin (RPC name/param, migration gate/grants); live-validated
   in a `BEGIN…ROLLBACK` (E2E Personalpha soft-deletes; Test Secretary raises MK001
   through the RPC).
4. **Deploy** — `supabase db push`.

## Out of scope
- Reassign-owner flow (still none; delete-dogs-first is the escape — see PR #793).
