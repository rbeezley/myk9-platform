# useMyEntries: Offline-First Read Path

**Date:** 2026-03-18
**Status:** Approved

## Problem

`useMyEntries` queries Supabase directly (`supabase.from('entries').eq('handler_id', personId)`), bypassing the local Zustand entry store. Entries created during registration via the replication layer exist in the local store but never appear in the My Entries tab because the hook only reads from Supabase.

This violates the app's offline-first architecture. The read path must use local stores.

## Design

### Data Sources

`useMyEntries(showId)` reads from three local stores via `useMemo`:

| Store                 | Data                 | Lookup                                        |
| --------------------- | -------------------- | --------------------------------------------- |
| `useEntryStore`       | Entries for the show | `getEntriesByShow(showId)`                    |
| `useClassStoreCompat` | Class names          | `classes` array, keyed by `classId`           |
| `useDogStoreCompat`   | Dog names            | `dogs` array, keyed by `dogId` for `callName` |

**Note on offline availability:** `useClassStoreCompat` and `useDogStoreCompat` are React Query-backed. Their data is cached from the initial page load and available within the session. For true cold-start offline scenarios, class/dog names may be unavailable — the hook falls back to `'Unknown Class'` / `'Unknown Dog'`. This is acceptable for the current use case.

### Filtering by Role

Uses `useAuthContext()`:

- **Exhibitors (default):** Filter entries where `dogId` is in the set of the current user's dog IDs (dogs where `ownerId === databaseUserId`). If `databaseUserId` is undefined, returns empty results.
- **Site admins / Secretaries / Club admins:** No filter — return all entries for the show.
- **All other roles (judge, steward, chairman):** Default to exhibitor filtering.

### `dogsAhead` Computation

The entry store's `getEntriesByShow(showId)` returns ALL entries for the show (from the replication layer sync), not just the current user's. Role-based filtering happens AFTER `dogsAhead` is computed. For each entry, `dogsAhead` counts entries in the same class with a lower `runOrder` that are not scored. This works because the full set of entries is available locally via replication.

### Derived Fields

| Field       | Source                                                                     |
| ----------- | -------------------------------------------------------------------------- |
| `classId`   | `entry.classId`                                                            |
| `className` | Class store lookup by `entry.classId` → `name`, fallback `'Unknown Class'` |
| `dogName`   | Dog store lookup by `entry.dogId` → `callName`, fallback `'Unknown Dog'`   |
| `armband`   | `entry.registrationData.armband ?? ''`                                     |
| `runOrder`  | `entry.registrationData.runOrder ?? 0`                                     |
| `scored`    | `entry.status === 'completed' \|\| !!entry.competitionData`                |
| `dogsAhead` | Count of entries in same class with lower `runOrder` that are not scored   |

**Behavioral change:** `scored` was previously `is_scored` from Supabase. The new derivation uses local entry status/competition data. These should be equivalent once scoring is recorded locally.

### `showId` Handling

The hook signature stays `useMyEntries(showId: string | undefined)`. When `showId` is undefined, the hook returns empty arrays and `isLoading: false`, matching current behavior.

### Return Type

Unchanged — `UseMyEntriesResult` stays the same so `MyEntriesTab` needs no changes.

- `entries`: `Array<{ id, showId }>` — flat list of entry IDs
- `entriesByClass`: `MyEntryByClass[]` — enriched per-class data
- `isLoading`: From entry store's `isLoading`
- `isError`: From entry store's `error` field (non-null → true)

### Filtering Semantics Change

The current query filters by `handler_id` (the person handling the dog). The new filter uses dog ownership (`dogId` in user's dogs). This means an exhibitor handling someone else's dog will NOT see those entries. This is the accepted design per user direction. Handler-based visibility can be added later if needed.

## Files Changed

| File                                                | Change                                                     |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `apps/myk9show/src/hooks/useMyEntries.ts`           | Rewrite: remove Supabase query, read from stores + useMemo |
| `apps/myk9show/src/test/hooks/useMyEntries.test.ts` | Update: mock stores instead of Supabase                    |

## Files Not Changed

- `MyEntriesTab.tsx` — consumer, no interface changes
- `MyEntriesPage/useMyEntriesData.ts` — separate follow-up (also queries Supabase directly)
- Entry store, class store, dog store — no changes
- Replication layer — no changes

## Out of Scope

- Fixing `MyEntriesPage/useMyEntriesData.ts` (separate TODO)
- Mutation sync debugging (the write path works; entries land in IndexedDB and sync via MutationManager)
- Supabase `handler_id` population (secondary concern — entries may still sync with null `handler_id` if no handler assigned, but the read path no longer depends on it)
