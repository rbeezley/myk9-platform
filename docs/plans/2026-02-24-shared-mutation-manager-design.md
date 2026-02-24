# Shared MutationManager for Bidirectional Replication

**Date:** 2026-02-24
**Status:** Approved
**Problem:** myK9Show's replication layer is read-only. Data written via `ReplicatedTable.set()` goes to IndexedDB but never syncs to Supabase. All Supabase tables have 0 rows. Show data is local-only and will be lost if the browser cache is cleared. The Show Creation Wizard fails to persist classes (52 unhandled promise rejections) due to a storage layer mismatch between IndexedDB-only trials and direct-Supabase class inserts.

## Approach

Extract myK9Q's `MutationManager` into the shared `@myk9/replication` package so both apps can use it. The MutationManager queues local mutations in IndexedDB, topologically sorts them to respect FK ordering, and uploads them to Supabase with retry logic.

## Architecture

### Mutation Flow

```
User action (create show, add trial, etc.)
  -> Store calls replicatedTable.createXxx()
  -> replicatedTable.set(id, data, isDirty=true)  // IndexedDB write
  -> replicatedTable.queueMutation('INSERT', id, supabasePayload, dependsOn?)
  -> PendingMutation record written to IndexedDB

ReplicationSyncProvider.triggerSync()
  -> Phase 1: mutationManager.uploadPendingMutations()
     -> topological sort (shows -> trials -> classes -> entries)
     -> for each mutation: supabase.from(table).upsert(data)
     -> on success: delete from pending queue, mark isDirty=false
     -> on failure: retry with exponential backoff (3 retries, 1s/2s/4s)
  -> Phase 2: for each table -> table.sync(licenseKey)  // download updates
```

### Dependency Tracking

Mutations include `dependsOn` arrays pointing to parent mutation IDs:
- Trial mutation depends on its show mutation
- Class mutation depends on its trial mutation
- Entry mutation depends on its class mutation

Kahn's topological sort algorithm ensures FK-safe ordering. Circular dependencies fall back to timestamp ordering.

## Changes by Location

### `packages/replication/src/` (shared package)

**New files:**
- `MutationManager.ts` — extracted from myK9Q, Supabase client injected via constructor
- `mutation-utils.ts` — `isRetryableError()`, `backoffDelay()`, topological sort

**Modified files:**
- `ReplicatedTable.ts` — add `queueMutation(operation, rowId, data, dependsOn?)` and `setMutationManager(manager)`
- `types.ts` — `PendingMutation` already exists, verify schema matches
- `index.ts` — export `MutationManager` and utilities

**Constructor:**
```typescript
class MutationManager {
  constructor(
    supabaseClient: SupabaseClient,
    options?: { maxRetries?: number; retryBackoffBase?: number; logger?: Logger }
  )
}
```

### `apps/myk9show/src/services/replication/` (table subclasses)

Each table's write helpers (`createShow()`, `updateShow()`, etc.) call `this.queueMutation()` after `this.set()`. The payload is in Supabase column format (snake_case), built by the helper that already knows the mapping.

Tables affected: `ReplicatedShowsTable`, `ReplicatedTrialsTable`, `ReplicatedClassesTable`, `ReplicatedEntriesTable`, `ReplicatedDogsTable`, `ReplicatedClubsTable`.

### `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`

- Create `MutationManager` instance with myK9Show's Supabase client
- Call `setMutationManager()` on all replicated tables at startup
- Add Phase 1 upload before Phase 2 download in `triggerSync()`
- Add network reconnect handler to restore localStorage backup and trigger sync

### `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`

- Change `createClasses()` to use `replicatedClassesTable` instead of direct Supabase via `useClassStoreCompat`
- Make `createClasses()` async and await class additions
- Optionally trigger immediate sync after publish

### `apps/myk9q/` (myK9Q — minimal changes)

- Replace local `MutationManager` import with `import { MutationManager } from '@myk9/replication'`
- Delete local `MutationManager.ts` and `mutation-utils.ts`
- Behavior unchanged

## Error Handling

- **Retry:** 3 attempts with exponential backoff (1s, 2s, 4s). Non-retryable errors (400, 403) fail immediately.
- **Conflict resolution:** Server-wins (same as current download sync).
- **localStorage backup:** Debounced backup after each successful upload. Restores on page reload.
- **Queue overflow:** Warning at 500 pending, hard cap at 1000 with user notification event.
- **Session expiry:** Mutations stay pending, retry on next authenticated session.
- **Wizard edge case:** If user closes browser immediately after publish, mutations survive in IndexedDB and upload on next visit via the 2-second startup sync.

## Bugs Resolved

Once implemented, this fixes:
1. **CRITICAL: Classes not persisted after publish** — classes queue as mutations with trial dependencies, upload in FK order
2. **CRITICAL: Replication layer not syncing to Supabase** — all tables get bidirectional sync
3. **CRITICAL: Data local-only** — all show/trial/class/entry/dog/club data reaches Supabase

## Not in Scope

- The 5 non-critical wizard bugs (Unknown Club, dropdown refresh, Trial 2 date default, Escape key, Select warnings) — separate fixes
- `useClassStoreCompat` refactor — stays as-is for non-wizard class operations (edit/delete from UI go direct to Supabase, which works once trials exist in Supabase)
- myK9Q migration to shared MutationManager — import swap only, no behavior change
