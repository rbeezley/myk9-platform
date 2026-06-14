# Shared MutationManager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract myK9Q's MutationManager into `@myk9/replication` so both apps can upload local mutations to Supabase, fixing myK9Show's read-only replication.

**Architecture:** MutationManager moves to the shared package with Supabase client injected via constructor. ReplicatedTable base class gains `queueMutation()`. myK9Show's ReplicationSyncProvider wires it all together. myK9Q swaps to the shared import.

**Tech Stack:** TypeScript, IndexedDB (idb), Supabase JS client, @myk9/replication package

---

### Task 1: Add mutation-utils.ts to @myk9/replication

**Files:**
- Create: `packages/replication/src/mutation-utils.ts`

**Step 1: Create the utility file**

Extract network/retry utilities from `apps/myk9q/src/utils/networkUtils.ts` into the shared package. Only include what MutationManager needs: `isRetryableError`, `backoffDelay`, `TimeoutError`, `withTimeout`, and `TIMEOUT_PRESETS`.

```typescript
// packages/replication/src/mutation-utils.ts
//
// Copy these functions from apps/myk9q/src/utils/networkUtils.ts:
// - TimeoutError class
// - withTimeout()
// - calculateBackoffDelay()
// - backoffDelay() (remove logger.log dependency — use optional logger param or silent)
// - isRetryableError() + isSupabaseError() helper
// - TIMEOUT_PRESETS object
//
// Changes from myK9Q version:
// - Remove import of myK9Q's logger (use console.log or accept logger param)
// - backoffDelay() should accept optional Logger from ../dependencies
// - All else stays identical
```

**Step 2: Export from package index**

Modify: `packages/replication/src/index.ts` — add exports:
```typescript
// Mutation utilities
export {
  MutationManager,
  type MutationManagerOptions,
} from './MutationManager';

export {
  isRetryableError,
  backoffDelay,
  withTimeout,
  TimeoutError,
  TIMEOUT_PRESETS,
} from './mutation-utils';
```

**Step 3: Run typecheck**

Run: `cd packages/replication && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/replication/src/mutation-utils.ts packages/replication/src/index.ts
git commit -m "feat(replication): add mutation utilities (retry, backoff, timeout)"
```

---

### Task 2: Add MutationManager to @myk9/replication

**Files:**
- Create: `packages/replication/src/MutationManager.ts`

**Step 1: Create MutationManager with injected Supabase client**

Port from `apps/myk9q/src/services/replication/MutationManager.ts` (475 lines). Key changes:

```typescript
// packages/replication/src/MutationManager.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PendingMutation } from './types';
import type { Logger } from './dependencies';
import { noopLogger } from './dependencies';
import { REPLICATION_STORES, databaseManager } from './core/DatabaseManager';
import { isRetryableError, backoffDelay, withTimeout, TIMEOUT_PRESETS } from './mutation-utils';

export interface MutationManagerOptions {
  maxRetries?: number;
  retryBackoffBase?: number;
  logger?: Logger;
}

export class MutationManager {
  private supabase: SupabaseClient;
  private maxRetries: number;
  private retryBackoffBase: number;
  private logger: Logger;
  private backupDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isBackupInProgress = false;

  constructor(
    supabaseClient: SupabaseClient,
    options: MutationManagerOptions = {}
  ) {
    this.supabase = supabaseClient;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBackoffBase = options.retryBackoffBase ?? 1000;
    this.logger = options.logger ?? noopLogger;
  }

  // Port these methods from myK9Q's MutationManager:
  // - uploadPendingMutations() — main upload loop
  // - executeMutation() — supabase.from(table).upsert(data) / .delete()
  // - topologicalSortMutations() — Kahn's algorithm
  // - backupMutationsToLocalStorage()
  // - restoreMutationsFromLocalStorage()
  // - notifyUserOfSyncFailure() — dispatches CustomEvent
  // - getPendingCount() — returns count of pending mutations
  //
  // Changes from myK9Q version:
  // - Constructor takes SupabaseClient instead of importing global
  // - Use databaseManager.getDb() from shared package instead of local this.getDb()
  // - Use this.logger instead of imported logger
  // - Remove myK9Q-specific imports (logger, networkUtils)
  // - Use REPLICATION_STORES from shared DatabaseManager
}
```

**Step 2: Add queueMutation static helper**

Add to MutationManager class:
```typescript
  /**
   * Queue a mutation for later upload.
   * Called by ReplicatedTable subclasses after set().
   */
  async queueMutation(
    tableName: string,
    operation: PendingMutation['operation'],
    rowId: string,
    data: Record<string, unknown>,
    dependsOn?: string[]
  ): Promise<string> {
    // [ADDED] Queue overflow protection
    const pendingCount = await this.getPendingCount();
    if (pendingCount >= 1000) {
      this.logger.error(`[MutationManager] Queue overflow: ${pendingCount} pending mutations, rejecting new mutation`);
      window.dispatchEvent(new CustomEvent('replication:queue-overflow', { detail: { count: pendingCount } }));
      throw new Error(`Mutation queue overflow: ${pendingCount} pending`);
    }
    if (pendingCount >= 500) {
      this.logger.warn(`[MutationManager] Queue warning: ${pendingCount} pending mutations`);
    }

    const db = await databaseManager.getDb();
    const id = crypto.randomUUID();
    const mutation: PendingMutation = {
      id,
      tableName,
      operation,
      rowId,
      data,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      dependsOn,
    };
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
    this.logger.log(`[MutationManager] Queued ${operation} for ${tableName}/${rowId}`);
    await this.backupMutationsToLocalStorage();
    return id;
  }
```

**Step 3: Run typecheck**

Run: `cd packages/replication && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/replication/src/MutationManager.ts packages/replication/src/index.ts
git commit -m "feat(replication): add shared MutationManager with upload, retry, and dependency sorting"
```

---

### Task 3: Add queueMutation support to ReplicatedTable base class

**Files:**
- Modify: `packages/replication/src/core/ReplicatedTable.ts`

**Step 1: Add MutationManager reference to base class**

Add after the constructor:
```typescript
  // Mutation manager reference (set by app at startup)
  private mutationManager: MutationManager | null = null;

  /**
   * Connect this table to a MutationManager for mutation upload.
   * Must be called once at app startup before any writes.
   */
  setMutationManager(manager: MutationManager): void {
    this.mutationManager = manager;
  }

  /**
   * Queue a mutation for upload to Supabase.
   * Subclasses call this after set() with the Supabase-format payload.
   */
  protected async queueMutation(
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    rowId: string,
    supabasePayload: Record<string, unknown>,
    dependsOn?: string[]
  ): Promise<string | null> {
    if (!this.mutationManager) {
      this.logger.warn(`[${this.tableName}] No MutationManager set — mutation not queued`);
      return null;
    }
    return this.mutationManager.queueMutation(
      this.tableName,
      operation,
      rowId,
      supabasePayload,
      dependsOn
    );
  }
```

Import MutationManager at top of file (use type-only import to avoid circular deps):
```typescript
import type { MutationManager } from '../MutationManager';
```

**Step 2: Export MutationManager from package index**

Already done in Task 1 Step 2.

**Step 3: Run typecheck and tests**

Run: `cd packages/replication && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/replication/src/core/ReplicatedTable.ts
git commit -m "feat(replication): add queueMutation() and setMutationManager() to ReplicatedTable base"
```

---

### Task 4: Build the replication package

**Step 1: Build package**

Run: `cd packages/replication && pnpm build`
Expected: PASS — new exports are available to apps

**Step 2: Run full monorepo typecheck**

Run: `pnpm typecheck`
Expected: PASS — no breakage in consuming apps (additive changes only)

**Step 3: Commit if any build output changed**

---

### Task 5: Wire MutationManager into myK9Show's ReplicationSyncProvider

**Files:**
- Modify: `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`

**Step 1: Create MutationManager instance and connect to tables**

At the top of the provider, after table imports:
```typescript
import { MutationManager } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';
```

In the provider initialization (inside useEffect or at module level):
```typescript
// Create shared MutationManager
const mutationManager = new MutationManager(supabase, { logger });

// Connect all replicated tables
replicatedShowsTable.setMutationManager(mutationManager);
replicatedTrialsTable.setMutationManager(mutationManager);
replicatedClassesTable.setMutationManager(mutationManager);
replicatedEntriesTable.setMutationManager(mutationManager);
replicatedDogsTable.setMutationManager(mutationManager);
replicatedClubsTable.setMutationManager(mutationManager);
```

**Step 2: Add Phase 1 upload before Phase 2 download in triggerSync()**

Modify `triggerSync()` (or `syncAllTables()`):
```typescript
const triggerSync = async () => {
  if (!isOnline) return;

  // Phase 1: Upload pending mutations
  try {
    const uploadResults = await mutationManager.uploadPendingMutations();
    const succeeded = uploadResults.filter(r => r.success).length;
    if (uploadResults.length > 0) {
      logger.info(`[Sync] Phase 1: Uploaded ${succeeded}/${uploadResults.length} mutations`);
    }
  } catch (error) {
    logger.error('[Sync] Phase 1 upload failed:', error);
    // Continue to Phase 2 even if upload fails
  }

  // Phase 2: Download sync (existing code)
  for (const tableConfig of tables) {
    await tableConfig.table.sync(licenseKey);
  }
};
```

**Step 3: Add network reconnect handler and startup upload [EXPANDED]**

```typescript
useEffect(() => {
  const handleOnline = async () => {
    await mutationManager.restoreMutationsFromLocalStorage();
    triggerSync();
  };
  window.addEventListener('online', handleOnline);

  // [ADDED] Startup upload: flush any pending mutations from previous session
  const startupUpload = async () => {
    await mutationManager.restoreMutationsFromLocalStorage();
    const pendingCount = await mutationManager.getPendingCount();
    if (pendingCount > 0) {
      logger.info(`[Sync] Startup: ${pendingCount} pending mutations from previous session`);
      triggerSync();
    }
  };
  const startupTimer = setTimeout(startupUpload, 2000);

  return () => {
    window.removeEventListener('online', handleOnline);
    clearTimeout(startupTimer);
  };
}, []);
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/providers/ReplicationSyncProvider.tsx
git commit -m "feat(show): wire MutationManager into ReplicationSyncProvider for bidirectional sync"
```

---

### Task 6: Add queueMutation calls to ReplicatedShowsTable

**Files:**
- Modify: `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts`

**Step 1: Add Supabase column mapping helper**

Add a private method that converts a `ReplicatedShow` to Supabase row format:
```typescript
  private toSupabaseRow(show: ReplicatedShow): Record<string, unknown> {
    return {
      id: show.id,
      name: show.name,
      type: show.type || 'AKC',
      status: show.status || 'draft',
      start_date: show.startDate || null,
      end_date: show.endDate || null,
      location: show.location || null,
      description: show.description || null,
      host_club_id: show.hostClubId || null,
      chairman: show.chairman || null,
      secretary: show.secretary || null,
      entry_open_date: show.entryOpenDate || null,
      entry_close_date: show.entryCloseDate || null,
      pre_entry_fee: show.preEntryFee || 0,
      day_of_show_fee: show.dayOfShowFee || 0,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  }
```

Note: Check actual `ReplicatedShow` interface fields and Supabase `shows` table columns. Adjust mapping to match actual schema.

**Step 2: Queue mutation in createShow()**

After the existing `await this.set(id, newShow, true)` line, add:
```typescript
    await this.queueMutation('INSERT', id, this.toSupabaseRow(newShow));
```

**Step 3: Queue mutation in updateShow()**

After the existing `await this.set(showId, updatedShow, true)` line, add:
```typescript
    await this.queueMutation('UPDATE', showId, this.toSupabaseRow(updatedShow));
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/services/replication/ReplicatedShowsTable.ts
git commit -m "feat(show): queue show mutations for Supabase upload"
```

---

### Task 7: Add queueMutation calls to ReplicatedTrialsTable

**Files:**
- Modify: `apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts`

**Step 1: Add Supabase column mapping helper**

```typescript
  private toSupabaseRow(trial: ReplicatedTrial): Record<string, unknown> {
    return {
      id: trial.id,
      show_id: trial.showId || null,
      name: trial.name,
      date: trial.date,
      trial_number: trial.trialNumber || null,
      status: trial.status || 'Upcoming',
      max_entries_per_dog: trial.maxEntriesPerDog || null,
      max_total_entries: trial.maxTotalEntries || null,
      max_entries_per_handler: trial.maxEntriesPerHandler || null,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  }
```

Note: Check actual `ReplicatedTrial` interface and `trials` table columns. Adjust mapping.

**Step 2: Queue mutations in write methods**

The trial store's `addTrial()` calls `replicatedTrialsTable.set(id, replicatedTrial, true)` directly. Since the base class `set()` doesn't auto-queue, we need to either:
- Add a `createTrial()` helper method (like shows have `createShow()`) that calls `set()` + `queueMutation()`, OR
- Have the trial store call `queueMutation()` after `set()`

Preferred: Add `createTrial()` and `updateTrial()` helpers if they don't exist, following the same pattern as `ReplicatedShowsTable.createShow()`.

The show mutation ID should be passed as `dependsOn` so trials upload after shows:
```typescript
  async createTrial(trial: ReplicatedTrial, showMutationId?: string): Promise<string> {
    await this.set(trial.id, trial, true);
    const mutationId = await this.queueMutation(
      'INSERT', trial.id, this.toSupabaseRow(trial),
      showMutationId ? [showMutationId] : undefined
    );
    return mutationId || '';
  }
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`

**Step 4: Commit**

```bash
git add apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts
git commit -m "feat(show): queue trial mutations for Supabase upload with show dependency"
```

---

### Task 8: Add queueMutation calls to ReplicatedClassesTable

**Files:**
- Modify: `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts`

Same pattern as Tasks 6-7. Add `toSupabaseRow()`, `createClass()`, `updateClass()` helpers that call `set()` + `queueMutation()`. Class mutations depend on trial mutations.

**Step 1: Add Supabase column mapping and write helpers**

Map `ReplicatedClass` fields to `classes` table columns (trial_id, name, level, element, etc.).

**Step 2: Run typecheck**

**Step 3: Commit**

```bash
git commit -m "feat(show): queue class mutations for Supabase upload with trial dependency"
```

---

### Task 9: Add queueMutation calls to remaining tables

**Files:**
- Modify: `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts`
- Modify: `apps/myk9show/src/services/replication/ReplicatedDogsTable.ts`
- Modify: `apps/myk9show/src/services/replication/ReplicatedClubsTable.ts`

Same pattern: add `toSupabaseRow()` + queue mutations in write helpers. Entries depend on classes. Dogs and clubs have no FK dependencies (they can upload independently).

**Step 1: Add mapping and queueMutation calls to each table**

**Step 2: Run typecheck**

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
git commit -m "feat(show): queue mutations for entries, dogs, and clubs tables"
```

---

### Task 10: Update wizard to use ReplicatedClassesTable instead of direct Supabase

**Files:**
- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`

**Step 1: Change createClasses() to use replicated table**

Replace the `useClassStoreCompat` approach with `replicatedClassesTable`. [EXPANDED] Thread mutation IDs through the full show→trial→class dependency chain:

```typescript
import { replicatedShowsTable, replicatedTrialsTable, replicatedClassesTable } from '@/services/replication';

// In saveShow(), capture mutation IDs for dependency chain:
const saveShow = async () => {
  // 1. Create show — returns mutation ID
  const showMutationId = await replicatedShowsTable.createShow(showData);

  // 2. Create trials — each depends on show mutation
  const trialMutationIds: Record<string, string> = {};
  for (const trial of trialsToCreate) {
    const trialMutationId = await replicatedTrialsTable.createTrial(trialData, showMutationId);
    trialMutationIds[trial.tempId] = trialMutationId;
  }

  // 3. Create classes — each depends on its trial's mutation
  for (const classData of classesToCreate) {
    const trialMutationId = trialMutationIds[classData.trialTempId];
    const replicatedClass = mapClassInputToReplicated(classData);
    await replicatedClassesTable.createClass(replicatedClass, trialMutationId);
  }
};
```

**[ADDED] Key detail:** The `createShow()`, `createTrial()`, and `createClass()` methods must all return the mutation ID (string) from `queueMutation()` so callers can thread `dependsOn` through the chain. This is what makes the topological sort produce FK-safe ordering (shows upload before trials, trials before classes).

Key changes:
- Make `createClasses` async
- Replace `forEach` + `addClass()` (fire-and-forget) with `for...of` + `await`
- Use `replicatedClassesTable.createClass()` instead of `useClassStoreCompat.addClass()`
- **[ADDED]** Thread mutation IDs: `showMutationId` → `trialMutationId` → class `dependsOn`
- Remove `useClassStoreCompat` import if no longer needed here

**Step 2: Await createClasses in saveShow()**

Change line 154 from:
```typescript
createClasses(realShowId, trialIdMap);
```
To:
```typescript
await createClasses(realShowId, trialIdMap);
```

**Step 3: Optionally trigger immediate sync after publish**

After classes are created, trigger a sync so data reaches Supabase before the user navigates:
```typescript
// Trigger immediate sync to upload show/trial/class data
window.dispatchEvent(new CustomEvent('replication:sync-requested'));
```

(ReplicationSyncProvider listens for this event and calls triggerSync.)

**Step 4: Run typecheck**

Run: `pnpm typecheck`

**Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts
git commit -m "fix(show): wizard createClasses uses replicated table instead of direct Supabase"
```

---

### Task 11: Update myK9Q to use shared MutationManager

**Files:**
- Modify: `apps/myk9q/src/services/replication/MutationManager.ts` → delete or keep as re-export
- Modify: `apps/myk9q/src/services/replication/SyncEngine.ts` → import from package

**Step 1: Replace local MutationManager import**

In SyncEngine.ts or wherever MutationManager is instantiated:
```typescript
// Before
import { MutationManager } from './MutationManager';

// After
import { MutationManager } from '@myk9/replication';
```

**Step 2: Delete or thin out local MutationManager.ts**

Either delete the file entirely, or reduce it to a re-export for backward compatibility:
```typescript
// apps/myk9q/src/services/replication/MutationManager.ts
export { MutationManager } from '@myk9/replication';
```

**Step 3: Same for networkUtils functions if they were moved**

If `isRetryableError`, `backoffDelay`, etc. are still imported from `@/utils/networkUtils` elsewhere in myK9Q, keep that file. The shared package has its own copy — no need to delete myK9Q's.

**Step 4: Run myK9Q tests**

Run: `cd apps/myk9q && pnpm test`
Expected: PASS — behavior unchanged

**Step 5: Run full monorepo typecheck**

Run: `pnpm typecheck`

**Step 6: Commit**

```bash
git commit -m "refactor(q): use shared MutationManager from @myk9/replication"
```

---

### Task 12: End-to-end verification

**Step 1: Run full quality gate**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

**Step 2: Manual test — create and publish a show via wizard**

1. Open myK9Show dev server (`pnpm dev:show`)
2. Navigate to Secretary → Create Show → Wizard
3. Fill in all 4 steps and click "Create & Publish"
4. Check browser console — should see MutationManager upload logs, no unhandled promise rejections
5. Check Supabase tables — `shows`, `trials`, `classes` should have rows

**Step 3: Manual test — verify myK9Q still works**

1. Open myK9Q dev server
2. Verify existing scoring/sync functionality is unchanged

**Step 4: Commit any final fixes**

**Step 5: Final commit**

```bash
git commit -m "feat: bidirectional replication — shared MutationManager uploads mutations to Supabase"
```
