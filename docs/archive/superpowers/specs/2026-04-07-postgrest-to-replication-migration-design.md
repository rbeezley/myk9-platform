# Migrate Direct PostgREST Queries to Replication Store

**Date:** 2026-04-07
**Status:** Design approved

## Problem

175+ direct `supabase.from('table').select(...)` queries exist across myK9Show, violating the offline-first architecture. Direct PostgREST queries bypass the replication layer, break offline mode, and are subject to RLS policy mismatches (e.g. the BrowseShowsPage "0 shows" bug where RLS blocked exhibitor reads).

## Decision

**Approach C: Thin Query Layer Over Replication Store.** Rewrite the internals of query functions to read from the replication store instead of PostgREST, while keeping function signatures and return types unchanged. Hooks and components don't change.

## Scope

### Tables (9 total)

**Existing replicated tables (7):** shows, trials, classes, entries, dogs, clubs, judge_assignments

**New replicated tables (2):** armbands, waitlist_entries

### Query Files Migrated

| Phase | File                                               | SELECTs | Tables Read                                 |
| ----- | -------------------------------------------------- | ------- | ------------------------------------------- |
| 1     | `showQueries.ts`                                   | ~11     | shows, clubs, trials, judge_assignments     |
| 2     | `trialQueries.ts`                                  | ~8      | trials, shows                               |
| 3     | `classQueries.ts`                                  | ~6      | classes, trials, entries                    |
| 4     | `entry-query-lookups.ts` + `entry-query-search.ts` | ~10     | entries, dogs, classes, shows               |
| 5     | `dogQueries.ts`                                    | ~7      | dogs, people (PostgREST fallback for joins) |
| 6     | `armbandQueries.ts`                                | ~3      | armbands (new), dogs, entries               |
| 7     | `waitlistQueries.ts`                               | ~5      | waitlist_entries (new), classes, dogs       |

### Out of Scope

- **Mutation functions** -- INSERT/UPDATE/DELETE stay on PostgREST / mutation manager
- **RPC calls** -- `assign_armband`, `soft_delete_dog`, `increment_promo_usage` stay as PostgREST RPCs
- **People/user queries** -- `userQueries.ts` stays fully PostgREST (no replicated table, auth-adjacent)
- **Health/training/pedigree queries** -- ancillary features, not core flows
- **Promo code queries** -- online-only checkout, low offline value
- **Secretary entry queries** -- mostly mutations; reads go through entries replication
- **Inline `.from()` calls** in components/hooks -- separate follow-up effort
- **Existing three-tier fallback** on BrowseShowsPage/ShowDetailsPage -- stays as-is
- **Zustand store changes** -- stores already subscribe to replicated tables
- **New Zustand stores** for armbands/waitlist -- direct replicated table access is sufficient

## Architecture

### Layer Stack

```
Component -> Hook (useShowsQuery, etc.) -> Query Function (getShowById, etc.) -> Replication Store
                                                                                  |
                                                                                  v (fallback for people joins only)
                                                                              PostgREST
```

### Migration Pattern

Each SELECT function in the query files gets rewritten to read from the replicated table singleton:

```typescript
// BEFORE (showQueries.ts)
export async function getShowById(id: string) {
  const { data, error } = await supabase
    .from('shows')
    .select('*, clubs(*), trials(*)')
    .eq('id', id)
    .single();
  return { data, error };
}

// AFTER
export async function getShowById(id: string) {
  const show = await replicatedShowsTable.get(id);
  if (!show) return { data: null, error: null };
  const club = await replicatedClubsTable.get(show.clubId);
  const trials = await replicatedTrialsTable.queryByField('show_id', id);
  return { data: mapToShowRow(show, club, trials), error: null };
}
```

### Mapper Functions

Each table gets a mapper that converts camelCase replicated types back to the snake_case row shape that existing hooks/components expect. One mapper per table, co-located in the query file or a shared `mappers/` module.

### Joins Become JS-Side Lookups

PostgREST joins (e.g. `select('*, clubs(*)')`) become parallel reads from multiple replicated tables, joined in JS via foreign key. Since all data is local (IndexedDB), this is fast.

### Complex Queries Become Array Operations

- `.order('start_date')` -> `results.sort((a, b) => ...)`
- `.eq('status', 'published')` -> `results.filter(r => r.status === 'published')`
- `.or('owner_id.eq.X, co_owner_id.eq.X')` -> `results.filter(r => r.ownerId === X || r.coOwnerId === X)`
- `.in('trial_id', ids)` -> `results.filter(r => ids.includes(r.trialId))`

### Error Handling

Replicated table calls don't produce Supabase errors, so the `{ data, error }` return shape wraps results with `error: null`. If the replicated table has no data yet (sync hasn't run), the function returns empty results.

### People Joins

`people` has no replicated table and is auth-adjacent. Two strategies:

1. **Prefer denormalized data** -- most replicated types already include person names (e.g. `ReplicatedEntry.handler_name`, judge names via `judge_assignments`)
2. **PostgREST fallback** for cases needing full owner details (e.g. `dogQueries.getDogById()` with owner address)

## New Replicated Tables

### ReplicatedArmbandTable

- **Backs:** `armbands` table
- **Key columns:** `id`, `show_id`, `dog_id`, `armband_number`, `assigned_at`
- **Indexes:** `show_id`, `dog_id`
- **Sync scope:** shows the user is participating in or managing
- **Conflict resolution:** server-authoritative (secretary assigns armbands)
- **No Zustand store** -- direct table access from query functions

### ReplicatedWaitlistEntriesTable

- **Backs:** `waitlist_entries` table
- **Key columns:** `id`, `class_id`, `dog_id`, `handler_id`, `position`, `status`, `offered_at`, `expires_at`, `created_at`
- **Indexes:** `class_id`, `dog_id`
- **Sync scope:** shows the user is registered for or managing
- **Conflict resolution:** server-authoritative (position/status managed by secretary)
- **No Zustand store** -- waitlist queries are infrequent and class-scoped

Both follow the existing singleton pattern, get registered in `ReplicationSyncProvider.tsx` with the shared `MutationManager`, and sync on the same interval as other tables.

## Testing

Each phase gets unit tests verifying the rewritten query functions return the same shape as before. The existing hook/component tests serve as integration verification.

## Key Files

- Query files: `apps/myk9show/src/services/database/queries/`
- Replication tables: `apps/myk9show/src/services/replication/`
- Replication core: `packages/replication/src/`
- Sync provider: `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`
- Existing mappers: `apps/myk9show/src/services/mappers/`
