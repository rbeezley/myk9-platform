# RLS Fix & Store Migration Design

**Date:** 2026-04-07
**Status:** Approved
**Migrations:** 120 (RLS fixes)
**Depends on:** Migration 119 (people SELECT restriction, already written)

## Problem

Direct Supabase PostgREST queries return 0 rows for authenticated users on several pages, while the replication layer (service role) sees the data correctly.

**Broken pages:**

- BrowseShowsPage — "No shows found" (0 shows)
- ShowDetailsPage — "We couldn't load this show"
- Dog pages — "No dogs yet"

**Working pages (replication store):**

- Calendar — shows 1 show
- Reports dropdown — shows the show
- Secretary dashboard — works via store

**Root cause:** Two compounding issues:

1. Pending migrations (108+) may not be pushed to the live DB, so RLS policies are stale
2. Broken pages use direct PostgREST queries instead of the replication store, making them subject to RLS filtering that the store bypasses

## Decision

Fix both layers:

1. Correct RLS SELECT policies so the security boundary is right
2. Migrate broken pages to read from the replication store for consistency with offline-first architecture

## Part 1: RLS Policy Fixes (Migration 120)

### shows — Add secretary/admin visibility for draft shows

Current policy (migration 108) hides draft shows from everyone except platform admins. Secretaries need to see their draft shows.

```sql
DROP POLICY IF EXISTS "shows_select" ON shows;

CREATE POLICY "shows_select" ON shows
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (SELECT is_trial_secretary())
      OR (SELECT is_platform_admin())
    )
  );
```

### dogs — Restrict to own dogs for regular users

Current policy (migration 016) allows any user to see all non-deleted dogs. Exhibitors should only see dogs they own or co-own.

```sql
DROP POLICY IF EXISTS "dogs_select" ON dogs;

CREATE POLICY "dogs_select" ON dogs
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      owner_id = (SELECT get_my_person_id())
      OR co_owner_id = (SELECT get_my_person_id())
      OR (SELECT is_trial_secretary())
      OR (SELECT has_role('judge'))
      OR (SELECT is_platform_admin())
    )
  );
```

### Access Matrix — dogs

| Role           | Own dogs | All dogs | Soft-deleted |
| -------------- | -------- | -------- | ------------ |
| Exhibitor      | Yes      | No       | No           |
| Secretary      | Yes      | Yes      | No           |
| Judge          | Yes      | Yes      | No           |
| Platform admin | Yes      | Yes      | No\*         |

\*Platform admin soft-deleted visibility could be added later if needed.

### people — Migration 119 (already written)

Restricts to own record + secretary + platform admin. See `2026-04-06-people-select-rls-design.md`.

### No changes needed

| Table     | Current policy                   | Why no change                                       |
| --------- | -------------------------------- | --------------------------------------------------- |
| `trials`  | Inherits show status             | Correct — visible if parent show is visible         |
| `classes` | Inherits trial→show              | Correct — visible if parent show is visible         |
| `entries` | `USING (true)` for authenticated | Intentional — semi-public data (scores, run orders) |
| `clubs`   | `USING (true)`                   | Correct — club info is public                       |

## Part 2: Migrate Broken Pages to Store Reads

### BrowseShowsPage

**Current:** `useShowsQuery()` → `getAllShows()` → PostgREST
**Target:** Read from `useShowStore` (same source as calendar)

The `useBrowseShowsData` hook already imports `useShowsQuery`. Replace with store read. The store is populated by `ReplicatedShowsTable` which syncs via service role.

### ShowDetailsPage

**Current:** `useShowQuery(id)` → `getShowById(id)` → PostgREST
**Target:** Find show by ID in `useShowStore`, with data already available from replication sync

### Dog pages

**Current:** React Query hooks → `dogQueries.ts` → PostgREST
**Target:** Read from `ReplicatedDogsTable` / `useDogStoreCompat`

Note: Dog store is partially deprecated (UI state only), with data migrated to React Query. The migration here should use `ReplicatedDogsTable` directly or create a store-backed hook.

## Part 3: Push Pending Migrations

All migrations from 108 onward must be verified as pushed to the live database:

- 108: TV display anon access + status fixes
- 109–118: Various hardening migrations
- 119: People SELECT restriction
- 120: Shows + dogs SELECT fixes (new)

Command: `supabase db push` (with password from `supabase/.env`)

## Impact Analysis

- **TV/spectator views** — Use entries + anon policies. Unaffected.
- **Run order display** — Uses entries data. Unaffected.
- **Registration wizard** — Secretary flow, covered by `is_trial_secretary()`. Unaffected.
- **CSV export** — Uses `get_entries_for_export` RPC (SECURITY DEFINER). Bypasses RLS. Unaffected.
- **Calendar** — Already reads from store. Unaffected.
- **Reports** — Already migrated to store reads (commit 4a91fca1). Unaffected.
- **Dog queries joining entries** — Entries SELECT is open; dog join from entry perspective only shows dogs the user can see. Exhibitors viewing their own entries will see their own dogs. Secretaries see all.
- **Show queries joining judge_assignments→people** — After migration 119, exhibitors can't see judge people records through the join. This is fine because BrowseShowsPage will read from the store (bypasses RLS), and the store already has judge data.

## Testing

1. Push migrations, verify no errors
2. As exhibitor: BrowseShowsPage shows published shows, ShowDetailsPage loads, dog pages show own dogs only
3. As secretary: all shows visible (including draft), all dogs visible, all people visible
4. As platform admin: all data visible including soft-deleted
5. Existing test suites pass
