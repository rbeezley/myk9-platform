# Plan: Tighten `dogs_select` / `people_select` RLS + dogs-replica tombstone cleanup

**Status:** implementing
**Owner:** Richard (owns the pre-launch RLS-simplification decision — direction confirmed 2026-06-11)
**Scope:** security follow-up surfaced during the replication watermark work. Closes a
cross-tenant read hole and an offline right-to-erasure gap.

## Problem (three linked issues)

1. **RLS wide open.** `dogs_select` and `people_select` both reduced to
   `deleted_at IS NULL AND auth.uid() IS NOT NULL`
   ([20260602040000](../supabase/migrations/20260602040000_simplify_dogs_select_rls.sql),
   [20260602010000](../supabase/migrations/20260602010000_simplify_people_select_rls.sql)).
   Any authenticated user can read **every** dog and every person's PII (email, phone)
   directly via PostgREST. The simplification was deliberate: the prior per-row
   `can_manage_show_dog(id)` / `can_manage_show_person(id)` helpers run an `EXISTS`
   over `entries` for **every row** → O(N×entries) → statement timeouts + a retry
   storm, and returned FALSE for a freshly-created dog with no entries (rolling back
   the `createDog` `return=representation` insert with 42501).

2. **Whole dogs table replicated to every client.** The dogs sync is
   `supabase.from('dogs').select('*')`; with `licenseKey=''` the adapter's
   `.eq('owner_id', scope.value)` is skipped, so every client's IndexedDB ingests the
   entire dogs table, and `loadOwnersMap` then fetches owner PII for every cached owner.
   Client-side `filterByOwnership` is the *only* thing preventing cross-tenant display.

3. **No tombstone cleanup.** Dogs sync is incremental (`.gt('updated_at', since)`).
   Soft-deleted dogs linger in every cached replica forever; right-to-erasure isn't
   honored on the offline copy.

## Key findings that shape the fix

- **`scope.value` is overloaded per table** (dogs→`owner_id`, entries→`show_id`,
  classes→`trial_id`, shows→`club_id`), but `ReplicationSyncProvider` passes one
  global `licenseKey` to every table's `sync()`. So option (b) — "pass a real
  owner-scoped licenseKey into the provider" — is architecturally broken: it would
  make entries/classes/shows/trials filter on `person_id` and sync empty. **Rejected.**

- **Tightening RLS subsumes the replica-scope fix for free.** The sync query is
  `select('*')`; it can only return RLS-permitted rows. Tighten `dogs_select` and the
  replica auto-scopes server-side — no replication-layer change, and client filtering
  becomes genuine defense-in-depth instead of the sole control.

- **Show-day identity is denormalized onto `entries`** (`dog_call_name`, `dog_breed`,
  `handler_name`, `armband_number`). Ringside/scoring/secretary day-of read dog identity
  from the *entries* replica, so scoping the *dogs* replica does not break offline show-day.

- **The read-back regression is real** (`day-of-operations/late-entry-dog.ts` does
  `createDog({ owner_id: exhibitor.id })` with `return=representation`). An owner-only
  policy reintroduces the 42501 rollback.

- **`is_show_manager()` as an uncorrelated `(SELECT …)` is an InitPlan — evaluated once
  per statement, not per row.** This is the linchpin: it lets staff read (fixing
  read-back and their job) with **zero per-row function calls**, and scopes exhibitors
  to their own dogs via the indexed `owner_id`/`co_owner_id` checks. No per-row
  `can_manage_show_dog` anywhere → the O(N) timeout is structurally gone.

- **`people` judge-assignment reads come from staff** (`getJudgesWithQualifications`
  is the secretary judge-assignment UI → covered by `is_show_manager`), and the
  pre-simplification accepted policy had no judge-visibility branch — so none is needed.

## The change

### Migration `20260611120000_tighten_dogs_people_select_rls.sql`

- New helper `public.is_show_manager()` — parameterless, SECURITY DEFINER, STABLE;
  composed as `is_site_admin() OR is_trial_secretary() OR is_club_admin()`. **All three
  MUST be the migration-156 denormalized helpers that read `user_roles.auth_user_id`
  and do NOT join `public.people`** — `has_role()` (mig 082) still joins `people` and
  would cause RLS recursion (error 42P17) under FORCE RLS when evaluated inside
  `people_select` (Codex P1, PR #633). `REVOKE ALL … FROM public; GRANT EXECUTE …
  TO authenticated`.
- `dogs_select` (TO authenticated): `deleted_at IS NULL AND ( owner_id =
  (SELECT get_my_person_id()) OR co_owner_id = (SELECT get_my_person_id()) OR
  (SELECT is_show_manager()) )`.
- `people_select` (TO authenticated): `deleted_at IS NULL AND ( auth_user_id =
  (SELECT auth.uid()) OR (SELECT is_show_manager()) )`. This mirrors the
  pre-simplification accepted policy (`self OR can_manage_show_person OR is_site_admin`)
  with the per-row `can_manage_show_person(people.id)` swapped for the InitPlan gate;
  that policy also had no judge branch (judge visibility lives on the dogs policy /
  denormalized `judge_assignments`), so none is added here.
- `NOTIFY pgrst, 'reload schema';`

### Replica: tombstone / right-to-erasure cleanup (`ReplicatedDogsTable`)

Because the tightened policy keeps `deleted_at IS NULL` in `USING`, RLS hides
soft-deleted dogs from the sync query — the client never receives the tombstone, so
incremental sync cannot observe the deletion. Fix = **reconciliation against the live
id set**, not "fetch-and-delete":

- New `reconcileDeleted(scopeValue?)`: cheap `select('id').is('deleted_at', null)`
  (RLS-scoped to what the user may see), **paginated via `.range()`** until a short
  page, then `removeStaleEntries(liveIds)`. Any non-dirty local dog not in the live
  set is dropped — soft-deleted, hard-deleted, or scoped-away. `removeStaleEntries`
  already preserves dirty rows (pending local creates/edits). If any page errors →
  return 0 (never prune against a partial result). **Pagination is required, not
  optional:** PostgREST caps a response at ~1000 rows and a staff user (is_show_manager
  → RLS exposes every dog) can exceed that; an unpaginated fetch would silently
  truncate and prune every valid cached dog past the first page (Codex P1, PR #633).
  The paged fetch also carries `.order('id', { ascending: true })` — offset pagination
  without a deterministic total order can skip/duplicate rows across pages, yielding an
  incomplete `liveIds` set that over-prunes (second Codex P1, PR #633).
- Call it from `sync()` after a successful download, fully guarded (never breaks the
  sync result). Side-effect only — does not alter `result.rowsAffected`.
- Bonus: on existing clients that already cached the whole table under the old open
  RLS, the first reconcile purges the now-unauthorized rows — remediating the leak
  in place.

## Residual risk / post-launch hardening (intentional, documented)

- **Staff see all dogs/people platform-wide**, not only their managed shows. Mirrors
  the existing `dogs_insert_secretary` breadth ("role in ANY show"). Show-scoping needs
  the per-row helper that caused the timeout; defer until a denormalized
  show-visibility index exists.
- **email/phone remain readable on people rows the viewer can already see.** Column-level
  masking for non-managers is a separate follow-up (the more sensitive but more invasive
  half — every `select('*')`/`email,phone` consumer would need a gated path).
- **Soft-deleted dog/people restore UI** (`getDeletedDogs`) already returns nothing
  under the current `deleted_at IS NULL` policy; this migration preserves that
  (not a new regression). Admin restore should move to a SECURITY DEFINER path later.
- **reconcileDeleted runs per sync** (one index-only `select('id')`). Negligible
  pre-launch; throttle to full/periodic syncs if it grows.

## Testing

- `ReplicatedDogsTable.test.ts`: new `reconcileDeleted` block — removes out-of-scope/
  deleted rows via `removeStaleEntries(liveIds)`, preserves dirty rows, skips on fetch
  error, scopes by `owner_id` when a key is given; and `sync()` invokes
  `reconcileDeleted` after a successful download.
- RLS itself isn't unit-testable in vitest — verify via `/security-audit` (diff mode),
  `migration-auditor`, and a manual psql check of the four role cases
  (exhibitor self / exhibitor cross-owner / secretary / anon). Run `/codex:review` on
  the migration per CLAUDE.md (RLS = high-stakes).

## Out of scope (this PR)

- `people` column masking, show-scoped staff visibility, admin soft-delete restore path,
  replication-scope (`licenseKey`) refactor. Tracked as post-launch hardening above.
