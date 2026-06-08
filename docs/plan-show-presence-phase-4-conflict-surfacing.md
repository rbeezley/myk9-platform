# Show Presence Phase 4 Conflict Surfacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect same-field offline-first write collisions at the shared replication chokepoint and surface them for calm human resolution instead of silently resolving last-write-wins.

**Architecture:** Add persisted base/conflict metadata to `@myk9/replication` rows, detect dirty-row same-field collisions in `syncReplicatedTable`, hold queued mutations while a row is conflicted, and emit one typed `replication:conflict` event. myK9Show listens globally, shows a quiet conflict notification, and lets the user keep local data or take the server version without adding a new page.

**Tech Stack:** TypeScript, Vitest, IndexedDB via `idb`, React, shadcn/ui, Sonner notifications, Playwright.

---

## Validation Profile

- Risk: high
- Validation: full
- Rationale: Phase 4 touches the shared offline replication chokepoint and mutation queue used by every replicated table, so package tests, app tests, typecheck, lint, and opt-in two-context E2E validation are required before enablement.

## Source Context

- Primary plan: `docs/plan-show-presence.md` sections 2.5, 6 Phase 4, 7, 8, 11, 12.
- Handoff: `docs/handoffs/2026-06-08-presence-edit-awareness-followups.md`.
- UX intent: `docs/INTENT.md`.
- Shared chokepoint: `packages/replication/src/syncReplicatedTable.ts`.
- Existing shared conflict primitives: `packages/replication/src/conflict/ConflictResolver.ts`, `packages/replication/src/conflict/ConflictManager.ts`.
- Existing myK9Show conflict UI to reuse or adapt: `apps/myk9show/src/components/sync/ConflictResolutionDialog.tsx`.
- Existing sync shell: `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`.

## Duplication Check

Does this duplicate an existing page? No. Phase 4 is not a new page or workflow surface. The app already has conflict components, but they are not wired to `syncReplicatedTable` and include older generic conflict assumptions. This plan reuses the existing app shell, notification system, and conflict dialog where practical, while making the authoritative detection mechanism live once in `@myk9/replication`.

## File Map

- Modify `packages/replication/src/types.ts`: add conflict event/detail types and persisted dirty-row base metadata.
- Modify `packages/replication/src/core/ReplicatedTable.ts`: preserve the clean base snapshot when a row first becomes dirty, clear conflict metadata on clean server replacement, and add conflict resolution helpers.
- Create `packages/replication/src/conflict/detectDirtyRowConflict.ts`: pure same-field detector.
- Create `packages/replication/src/conflict/detectDirtyRowConflict.test.ts`: red-first detector coverage.
- Modify `packages/replication/src/syncReplicatedTable.ts`: gate the new dirty-row conflict branch with `conflictSurfacingEnabled`.
- Modify `packages/replication/src/syncReplicatedTable.test.ts`: assertion-first same-field, different-field, offline reconnect, flag-off, and cross-table coverage.
- Modify `packages/replication/src/MutationManager.ts`: skip upload for pending mutations whose local row is in `syncStatus: 'conflict'`.
- Modify `packages/replication/src/MutationManager.test.ts`: prove conflicted rows hold mutations without retries or deletion.
- Modify `packages/replication/src/index.ts`: export the new public types and helpers.
- Modify `apps/myk9show/src/config/features.ts`: add `showConflictSurfacing: false` as the Phase 4 kill switch.
- Create `apps/myk9show/src/features/replication-conflicts/conflictSurfacingFlag.ts`: env override helper for `VITE_SHOW_CONFLICT_SURFACING`.
- Create `apps/myk9show/src/features/replication-conflicts/ReplicationConflictListener.tsx`: global event listener and quiet notification.
- Create `apps/myk9show/src/features/replication-conflicts/ReplicationConflictReviewDialog.tsx`: adapter around the existing conflict-dialog pattern for keep-local and take-server actions.
- Create `apps/myk9show/src/features/replication-conflicts/replicationConflictRegistry.ts`: maps table names to table singletons for resolution actions.
- Create `apps/myk9show/src/features/replication-conflicts/__tests__/ReplicationConflictListener.test.tsx`: UI listener coverage using custom render utilities.
- Modify `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`: mount the listener and expose conflict diagnostics.
- Modify myK9Show replicated table sync calls under `apps/myk9show/src/services/replication/*.ts`: pass `conflictSurfacingEnabled: showConflictSurfacingEnabled()` to `syncReplicatedTable`.
- Modify `apps/myk9show/src/test/e2e/show-presence.spec.ts` or create `apps/myk9show/src/test/e2e/show-conflicts.spec.ts`: opt-in two-context conflict surfacing smoke.

## Data Contract

Add these package-level types:

```typescript
export interface ReplicationConflictSnapshot<T = Record<string, unknown>> {
  tableName: string;
  rowId: string;
  fields: string[];
  localData: T;
  remoteData: T;
  baseData: T;
  baseVersion: number;
  localVersion: number;
  detectedAt: number;
}

export interface ReplicationConflictEventDetail<T = Record<string, unknown>>
  extends ReplicationConflictSnapshot<T> {}

export type ReplicationConflictResolution = 'keep-local' | 'take-remote';
```

Extend `ReplicatedRow<T>`:

```typescript
baseData?: T;
baseVersion?: number;
conflict?: ReplicationConflictSnapshot<T>;
```

Base snapshot rules:

- First clean-to-dirty local edit: store `baseData = existingRow.data` and `baseVersion = existingRow.version`.
- Dirty-to-dirty local edits: preserve the original `baseData` and `baseVersion`.
- Clean server replacement: clear `baseData`, `baseVersion`, and `conflict`.
- Conflict detection: compare `baseData`, current dirty local data, and incoming remote data. A conflict exists when the same field differs from base on both sides and local differs from remote.
- If `baseData` is missing while the flag is on, keep existing behavior and log a warning; do not synthesize a conflict from only timestamps.
- [EXPANDED] `version`/`baseVersion` is the causal guardrail; `updated_at` is ignored by the detector and may only be displayed as informational context. Do not add timestamp-only conflict detection because client clocks can skew.
- [EXPANDED] Conflict event payloads stay browser-local (`window.dispatchEvent`) and must not be sent to logs, Realtime, or analytics with full row payloads. Observability logs table name, row id, and field names only.
- [ADDED] A row in `syncStatus: 'conflict'` is sticky until resolution. It is not overwritten by download sync, not uploaded by `MutationManager`, not evicted as a clean row, and must be rediscovered on app/provider mount so navigation does not hide the conflict.

## Task 1: Package Conflict Detector

**Files:**

- Create `packages/replication/src/conflict/detectDirtyRowConflict.ts`
- Create `packages/replication/src/conflict/detectDirtyRowConflict.test.ts`
- Modify `packages/replication/src/index.ts`

- [ ] **Step 1: Write failing detector tests**

```typescript
import { describe, expect, it } from 'vitest';
import { detectDirtyRowConflict } from './detectDirtyRowConflict';

describe('detectDirtyRowConflict', () => {
  it('returns changed fields when local and remote changed the same field from base', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', checkInStatus: 'no-status', resultStatus: 'pending' },
      local: { id: '1', checkInStatus: 'checked-in', resultStatus: 'pending' },
      remote: { id: '1', checkInStatus: 'absent', resultStatus: 'pending' },
    });

    expect(result).toEqual({ hasConflict: true, fields: ['checkInStatus'] });
  });

  it('does not conflict when local and remote changed different fields', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', checkInStatus: 'no-status', resultStatus: 'pending' },
      local: { id: '1', checkInStatus: 'checked-in', resultStatus: 'pending' },
      remote: { id: '1', checkInStatus: 'no-status', resultStatus: 'qualified' },
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
  });

  it('ignores replication bookkeeping fields', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', updated_at: 'a', _syncStatus: 'synced' },
      local: { id: '1', updated_at: 'b', _syncStatus: 'pending' },
      remote: { id: '1', updated_at: 'c', _syncStatus: 'synced' },
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
  });
});
```

- [ ] **Step 2: Run detector tests red**

Run:

```bash
cd packages/replication && pnpm test src/conflict/detectDirtyRowConflict.test.ts
```

Expected: FAIL because `detectDirtyRowConflict.ts` does not exist.

- [ ] **Step 3: Implement detector**

```typescript
const DEFAULT_IGNORED_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  '_version',
  '_lastModified',
  '_lastModifiedBy',
  '_syncStatus',
  '_localOnly',
]);

export interface DirtyRowConflictInput<T extends Record<string, unknown>> {
  base: T;
  local: T;
  remote: T;
  ignoredFields?: Iterable<string>;
}

export interface DirtyRowConflictResult {
  hasConflict: boolean;
  fields: string[];
}

export function detectDirtyRowConflict<T extends Record<string, unknown>>({
  base,
  local,
  remote,
  ignoredFields = DEFAULT_IGNORED_FIELDS,
}: DirtyRowConflictInput<T>): DirtyRowConflictResult {
  const ignored = new Set(ignoredFields);
  const fields = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const conflicts: string[] = [];

  for (const field of fields) {
    if (ignored.has(field)) continue;

    const baseValue = base[field];
    const localValue = local[field];
    const remoteValue = remote[field];
    const localChanged = !deepEqual(localValue, baseValue);
    const remoteChanged = !deepEqual(remoteValue, baseValue);
    const sidesDiffer = !deepEqual(localValue, remoteValue);

    if (localChanged && remoteChanged && sidesDiffer) {
      conflicts.push(field);
    }
  }

  return { hasConflict: conflicts.length > 0, fields: conflicts.sort() };
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}
```

- [ ] **Step 4: Export detector and run green**

Modify `packages/replication/src/index.ts`:

```typescript
export {
  detectDirtyRowConflict,
  type DirtyRowConflictInput,
  type DirtyRowConflictResult,
} from './conflict/detectDirtyRowConflict';
```

Run:

```bash
cd packages/replication && pnpm test src/conflict/detectDirtyRowConflict.test.ts
```

Expected: PASS.

## Task 2: Persist Dirty Base and Conflict Metadata

**Files:**

- Modify `packages/replication/src/types.ts`
- Modify `packages/replication/src/core/ReplicatedTable.ts`
- Modify `packages/replication/src/core/ReplicatedTable.test.ts`

- [ ] **Step 1: Write failing base-snapshot tests**

Add tests to `packages/replication/src/core/ReplicatedTable.test.ts`:

```typescript
it('stores the clean base row when a row first becomes dirty', async () => {
  await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
  const clean = await table.getReplicatedRow('1');

  await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);

  await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
    isDirty: true,
    syncStatus: 'pending',
    baseVersion: clean?.version,
    baseData: { id: '1', name: 'Rex', status: 'ready' },
  });
});

it('preserves the original base when an already dirty row changes again', async () => {
  await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
  await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
  await table.set('1', { id: '1', name: 'Rex', status: 'absent' }, true);

  await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
    baseData: { id: '1', name: 'Rex', status: 'ready' },
  });
});

it('clears base and conflict metadata when a clean server row is stored', async () => {
  await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
  await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
  await table.markConflict('1', {
    tableName: table.getTableName(),
    rowId: '1',
    fields: ['status'],
    localData: { id: '1', name: 'Rex', status: 'checked-in' },
    remoteData: { id: '1', name: 'Rex', status: 'absent' },
    baseData: { id: '1', name: 'Rex', status: 'ready' },
    baseVersion: 1,
    localVersion: 2,
    detectedAt: 1,
  });

  await table.replaceFromRemote('1', { id: '1', name: 'Rex', status: 'absent' });

  await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
    isDirty: false,
    syncStatus: 'synced',
    baseData: undefined,
    baseVersion: undefined,
    conflict: undefined,
  });
});
```

- [ ] **Step 2: Run row metadata tests red**

Run:

```bash
cd packages/replication && pnpm test src/core/ReplicatedTable.test.ts -t "base"
```

Expected: FAIL because `markConflict`, `replaceFromRemote`, and the new metadata fields do not exist.

- [ ] **Step 3: Add metadata types**

Add to `packages/replication/src/types.ts`:

```typescript
export interface ReplicationConflictSnapshot<T = Record<string, unknown>> {
  tableName: string;
  rowId: string;
  fields: string[];
  localData: T;
  remoteData: T;
  baseData: T;
  baseVersion: number;
  localVersion: number;
  detectedAt: number;
}

export interface ReplicationConflictEventDetail<T = Record<string, unknown>>
  extends ReplicationConflictSnapshot<T> {}

export type ReplicationConflictResolution = 'keep-local' | 'take-remote';
```

Extend `ReplicatedRow<T>`:

```typescript
baseData?: T;
baseVersion?: number;
conflict?: ReplicationConflictSnapshot<T>;
```

- [ ] **Step 4: Update `ReplicatedTable.set` base handling**

In `packages/replication/src/core/ReplicatedTable.ts`, set metadata in the row object:

```typescript
const shouldCaptureBase = isDirty && existingRow && !existingRow.isDirty;
const baseData = isDirty
  ? existingRow?.baseData ?? (shouldCaptureBase ? existingRow.data : undefined)
  : undefined;
const baseVersion = isDirty
  ? existingRow?.baseVersion ?? (shouldCaptureBase ? existingRow.version : undefined)
  : undefined;

const row: ReplicatedRow<T> = {
  tableName: this.tableName,
  id: normalizedId,
  data: normalizedData,
  version: existingRow ? existingRow.version + 1 : 1,
  lastSyncedAt: Date.now(),
  lastAccessedAt: Date.now(),
  accessCount: existingRow?.accessCount || 0,
  lastModifiedAt: Date.now(),
  isDirty,
  syncStatus: isDirty ? 'pending' : 'synced',
  ...(baseData !== undefined && { baseData }),
  ...(baseVersion !== undefined && { baseVersion }),
};
```

- [ ] **Step 5: Add metadata helpers**

Add public methods to `ReplicatedTable<T>`:

```typescript
async markConflict(id: string, conflict: ReplicationConflictSnapshot<T>): Promise<void> {
  const db = await this.init();
  const normalizedId = String(id);
  const key = [this.tableName, normalizedId];
  const existingRow = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, key)) as
    | ReplicatedRow<T>
    | undefined;

  if (!existingRow) return;

  await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
    ...existingRow,
    isDirty: true,
    syncStatus: 'conflict',
    conflict,
  });

  this.notifyListeners();
}

async replaceFromRemote(id: string, remoteData: T): Promise<void> {
  const db = await this.init();
  const normalizedId = String(id);
  const key = [this.tableName, normalizedId];
  const existingRow = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, key)) as
    | ReplicatedRow<T>
    | undefined;

  const row: ReplicatedRow<T> = {
    tableName: this.tableName,
    id: normalizedId,
    data: { ...remoteData, id: normalizedId },
    version: existingRow ? existingRow.version + 1 : 1,
    lastSyncedAt: Date.now(),
    lastAccessedAt: Date.now(),
    accessCount: existingRow?.accessCount || 0,
    lastModifiedAt: Date.now(),
    isDirty: false,
    syncStatus: 'synced',
  };

  await db.put(REPLICATION_STORES.REPLICATED_TABLES, row);
  this.notifyListeners();
}
```

- [ ] **Step 6: Export new types and run green**

Run:

```bash
cd packages/replication && pnpm test src/core/ReplicatedTable.test.ts -t "base"
cd packages/replication && pnpm typecheck
```

Expected: PASS.

## Task 3: Chokepoint Conflict Surfacing

**Files:**

- Modify `packages/replication/src/syncReplicatedTable.ts`
- Modify `packages/replication/src/syncReplicatedTable.test.ts`
- Modify `packages/replication/src/types.ts`

- [ ] **Step 1: Add assertion-first sync tests**

Add tests to `packages/replication/src/syncReplicatedTable.test.ts`:

```typescript
it('marks a dirty row conflict and emits replication:conflict for same-field changes', async () => {
  const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
  await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
  const adapter = makeAdapter([{ id: 1, name: 'Rex', status: 'absent' }]);

  const result = await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: true });

  expect(result.conflictsResolved).toBe(1);
  await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
    isDirty: true,
    syncStatus: 'conflict',
    conflict: {
      tableName: table.getTableName(),
      rowId: '1',
      fields: ['status'],
    },
  });
  expect(dispatchSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'replication:conflict',
      detail: expect.objectContaining({
        tableName: table.getTableName(),
        rowId: '1',
        fields: ['status'],
      }),
    })
  );
});

it('keeps dirty-row merge behavior for different-field changes', async () => {
  await table.set('1', { id: '1', name: 'Rex', status: 'ready', resultStatus: 'pending' });
  await table.set('1', { id: '1', name: 'Rex', status: 'checked-in', resultStatus: 'pending' }, true);
  const adapter = makeAdapter([{ id: 1, name: 'Rex', status: 'ready', result_status: 'qualified' }]);
  adapter.mergeDirtyRow = (local, remote) => ({ ...local, resultStatus: remote.resultStatus });

  await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: true });

  await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
    isDirty: true,
    syncStatus: 'pending',
    data: { status: 'checked-in', resultStatus: 'qualified' },
  });
});

it('keeps existing dirty-row behavior when conflict surfacing is off', async () => {
  await table.set('1', { id: '1', name: 'Local Rex', status: 'checked-in' }, true);
  const adapter = makeAdapter([{ id: 1, name: 'Server Rex', status: 'absent' }]);
  adapter.mergeDirtyRow = (local, remote) => ({ ...local, status: remote.status });

  await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: false });

  await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
    isDirty: true,
    syncStatus: 'pending',
    data: { status: 'absent' },
    conflict: undefined,
  });
});
```

- [ ] **Step 2: Run sync tests red**

Run:

```bash
cd packages/replication && pnpm test src/syncReplicatedTable.test.ts -t "dirty row"
```

Expected: FAIL because the option and conflict branch do not exist.

- [ ] **Step 3: Add option and event emitter**

Extend `SyncReplicatedTableOptions`:

```typescript
conflictSurfacingEnabled?: boolean;
```

Add local helper:

```typescript
function emitReplicationConflict<T>(detail: ReplicationConflictEventDetail<T>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('replication:conflict', { detail }));
}
```

- [ ] **Step 4: Add dirty-row conflict branch**

In the `existing?.isDirty` branch, before `mergeDirtyRow`:

```typescript
if (options.conflictSurfacingEnabled && existing.baseData && existing.baseVersion !== undefined) {
  const conflict = detectDirtyRowConflict({
    base: existing.baseData as Record<string, unknown>,
    local: existing.data as Record<string, unknown>,
    remote: remoteLocal as Record<string, unknown>,
  });

  if (conflict.hasConflict) {
    const detail: ReplicationConflictEventDetail<TLocal> = {
      tableName: table.getTableName(),
      rowId: id,
      fields: conflict.fields,
      localData: existing.data,
      remoteData: remoteLocal,
      baseData: existing.baseData,
      baseVersion: existing.baseVersion,
      localVersion: existing.version,
      detectedAt: Date.now(),
    };

    await table.markConflict(id, detail);
    emitReplicationConflict(detail);
    rowsAffected++;
    conflictsResolved++;
    continue;
  }
}
```

- [ ] **Step 5: Run package sync tests green**

Run:

```bash
cd packages/replication && pnpm test src/syncReplicatedTable.test.ts
cd packages/replication && pnpm typecheck
```

Expected: PASS.

## Task 4: Hold Pending Mutations for Conflicted Rows

**Files:**

- Modify `packages/replication/src/MutationManager.ts`
- Modify `packages/replication/src/MutationManager.test.ts`

- [ ] **Step 1: Write failing hold test**

Add to `packages/replication/src/MutationManager.test.ts`:

```typescript
it('holds pending mutations for rows marked conflict', async () => {
  const manager = new MutationManager(mockSupabase, { logger: testLogger });
  const db = await databaseManager.getDatabase('MutationManager');

  await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
    tableName: 'entries',
    id: 'entry-1',
    data: { id: 'entry-1', check_in_status: 'checked-in' },
    version: 2,
    lastSyncedAt: 1,
    lastAccessedAt: 1,
    isDirty: true,
    syncStatus: 'conflict',
  });
  await manager.queueMutation('entries', 'UPDATE', 'entry-1', {
    id: 'entry-1',
    check_in_status: 'checked-in',
  });

  const results = await manager.uploadPendingMutations();

  expect(results).toEqual([]);
  expect(mockSupabase.from).not.toHaveBeenCalled();
  await expect(db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toHaveLength(1);
});

it('continues uploading unrelated rows while one row is held in conflict', async () => {
  const manager = new MutationManager(mockSupabase, { logger: testLogger });
  const db = await databaseManager.getDatabase('MutationManager');

  await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
    tableName: 'entries',
    id: 'conflicted-entry',
    data: { id: 'conflicted-entry', check_in_status: 'checked-in' },
    version: 2,
    lastSyncedAt: 1,
    lastAccessedAt: 1,
    isDirty: true,
    syncStatus: 'conflict',
  });
  await manager.queueMutation('entries', 'UPDATE', 'conflicted-entry', {
    id: 'conflicted-entry',
    check_in_status: 'checked-in',
  });
  await manager.queueMutation('entries', 'UPDATE', 'clean-entry', {
    id: 'clean-entry',
    check_in_status: 'checked-in',
  });

  const results = await manager.uploadPendingMutations();

  expect(results).toEqual([
    expect.objectContaining({ tableName: 'entries', operation: 'UPDATE', success: true }),
  ]);
  const remaining = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
  expect(remaining).toEqual([expect.objectContaining({ rowId: 'conflicted-entry' })]);
});
```

- [ ] **Step 2: Run mutation test red**

Run:

```bash
cd packages/replication && pnpm test src/MutationManager.test.ts -t "holds pending mutations"
```

Expected: FAIL because the manager still attempts upload.

- [ ] **Step 3: Add conflict-row skip**

In `MutationManager`, before `executeMutation(mutation)`:

```typescript
if (await this.isRowInConflict(db, mutation)) {
  this.logger.warn(
    `[MutationManager] Holding ${mutation.id} for ${mutation.tableName}/${mutation.rowId} because the row is in conflict`
  );
  continue;
}
```

Add helper:

```typescript
private async isRowInConflict(
  db: Awaited<ReturnType<typeof databaseManager.getDatabase>>,
  mutation: PendingMutation
): Promise<boolean> {
  const row = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
    mutation.tableName,
    String(mutation.rowId),
  ])) as ReplicatedRow<unknown> | undefined;

  return row?.syncStatus === 'conflict';
}
```

- [ ] **Step 4: Run mutation tests green**

Run:

```bash
cd packages/replication && pnpm test src/MutationManager.test.ts -t "holds pending mutations"
cd packages/replication && pnpm test src/MutationManager.test.ts -t "continues uploading unrelated rows"
cd packages/replication && pnpm typecheck
```

Expected: PASS.

## Task 5: Resolution Helpers

**Files:**

- Modify `packages/replication/src/core/ReplicatedTable.ts`
- Modify `packages/replication/src/core/ReplicatedTable.test.ts`
- Modify `packages/replication/src/MutationManager.ts`
- Modify `packages/replication/src/MutationManager.test.ts`

- [ ] **Step 1: Write failing resolution tests**

Add to `ReplicatedTable.test.ts`:

```typescript
it('resolves a conflict by keeping local data pending for upload', async () => {
  await seedConflictRow(table);

  await table.resolveReplicationConflict('1', 'keep-local');

  await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
    isDirty: true,
    syncStatus: 'pending',
    conflict: undefined,
  });
});

it('resolves a conflict by taking the remote data as clean', async () => {
  await seedConflictRow(table);

  await table.resolveReplicationConflict('1', 'take-remote');

  await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
    isDirty: false,
    syncStatus: 'synced',
    data: { id: '1', name: 'Rex', status: 'absent' },
    conflict: undefined,
  });
});

it('returns persisted conflicted rows so the app can re-prompt after navigation', async () => {
  await seedConflictRow(table);

  await expect(table.getConflictedRows()).resolves.toEqual([
    expect.objectContaining({
      id: '1',
      syncStatus: 'conflict',
      conflict: expect.objectContaining({ fields: ['status'] }),
    }),
  ]);
});
```

Add to `MutationManager.test.ts`:

```typescript
it('deletes pending mutations for a row when instructed by table and row id', async () => {
  const manager = new MutationManager(mockSupabase, { logger: testLogger });
  await manager.queueMutation('entries', 'UPDATE', 'entry-1', { id: 'entry-1', status: 'local' });

  await manager.discardPendingMutationsForRow('entries', 'entry-1');

  const db = await databaseManager.getDatabase('MutationManager');
  await expect(db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toEqual([]);
});
```

- [ ] **Step 2: Run resolution tests red**

Run:

```bash
cd packages/replication && pnpm test src/core/ReplicatedTable.test.ts -t "resolves a conflict"
cd packages/replication && pnpm test src/MutationManager.test.ts -t "deletes pending mutations"
```

Expected: FAIL because resolution APIs do not exist.

- [ ] **Step 3: Add table resolution API**

Add to `ReplicatedTable<T>`:

```typescript
async resolveReplicationConflict(
  id: string,
  resolution: ReplicationConflictResolution
): Promise<void> {
  const existing = await this.getReplicatedRow(id);
  if (!existing?.conflict) return;

  if (resolution === 'keep-local') {
    await this.set(id, existing.conflict.localData as T, true);
    return;
  }

  await this.replaceFromRemote(id, existing.conflict.remoteData as T);
}

async getConflictedRows(): Promise<Array<ReplicatedRow<T>>> {
  const db = await this.init();
  const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
  const index = tx.store.index('tableName');
  const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];
  return rows.filter(row => row.syncStatus === 'conflict');
}
```

- [ ] **Step 4: Add mutation discard API**

Add to `MutationManager`:

```typescript
async discardPendingMutationsForRow(tableName: string, rowId: string): Promise<number> {
  const db = await databaseManager.getDatabase('MutationManager');
  const mutations = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
  const matches = mutations.filter(
    mutation => mutation.tableName === tableName && String(mutation.rowId) === String(rowId)
  );

  for (const mutation of matches) {
    await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, mutation.id);
  }

  await this.writeCurrentMutationsBackup();
  return matches.length;
}
```

- [ ] **Step 5: Wire remote resolution to discard mutations**

In myK9Show, the `take-remote` action must call both:

```typescript
await table.resolveReplicationConflict(rowId, 'take-remote');
await mutationManager.discardPendingMutationsForRow(tableName, rowId);
```

Expose the app's `mutationManager` from `ReplicationSyncProvider.tsx` or a sibling module so the conflict listener can call the same singleton.

- [ ] **Step 6: Run resolution tests green**

Run:

```bash
cd packages/replication && pnpm test src/core/ReplicatedTable.test.ts -t "resolves a conflict"
cd packages/replication && pnpm test src/core/ReplicatedTable.test.ts -t "persisted conflicted rows"
cd packages/replication && pnpm test src/MutationManager.test.ts -t "deletes pending mutations"
cd packages/replication && pnpm typecheck
```

Expected: PASS.

## Task 6: myK9Show Flag and Sync Options

**Files:**

- Modify `apps/myk9show/src/config/features.ts`
- Create `apps/myk9show/src/features/replication-conflicts/conflictSurfacingFlag.ts`
- Modify `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts`
- Modify `apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts`
- Modify `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts`
- Modify `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts`
- Modify `apps/myk9show/src/services/replication/ReplicatedDogsTable.ts`
- Modify `apps/myk9show/src/services/replication/ReplicatedClubsTable.ts`
- Modify `apps/myk9show/src/services/replication/ReplicatedJudgeAssignmentsTable.ts`
- Modify `apps/myk9show/src/services/replication/ReplicatedArmbandsTable.ts`
- Modify `apps/myk9show/src/services/replication/ReplicatedWaitlistEntriesTable.ts`

- [ ] **Step 1: Add flag helper**

Add `features.showConflictSurfacing: false` with this comment:

```typescript
// Show-day conflict surfacing (Phase 4, docs/plan-show-presence.md §6).
// KILL SWITCH. When on, the shared replication dirty-row path detects same-field
// local/server collisions, marks the row conflict, holds pending mutations, and
// surfaces a calm review prompt. Flip to false to restore the pre-Phase-4
// dirty-row merge/LWW behavior. Env override: VITE_SHOW_CONFLICT_SURFACING=true.
showConflictSurfacing: false,
```

Create helper:

```typescript
import { features } from '@/config/features';

export function showConflictSurfacingEnabled(): boolean {
  const override = import.meta.env.VITE_SHOW_CONFLICT_SURFACING;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return features.showConflictSurfacing;
}
```

- [ ] **Step 2: Pass flag to every myK9Show replicated sync call**

In each table's `sync()` call:

```typescript
const result = await syncReplicatedTable(this, adapter, { value: licenseKey }, {
  conflictSurfacingEnabled: showConflictSurfacingEnabled(),
});
```

- [ ] **Step 3: Run app typecheck for flag wiring**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

## Task 7: Calm Global Conflict UI

**Files:**

- Create `apps/myk9show/src/features/replication-conflicts/ReplicationConflictListener.tsx`
- Create `apps/myk9show/src/features/replication-conflicts/ReplicationConflictReviewDialog.tsx`
- Create `apps/myk9show/src/features/replication-conflicts/replicationConflictRegistry.ts`
- Create `apps/myk9show/src/features/replication-conflicts/__tests__/ReplicationConflictListener.test.tsx`
- Modify `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`

- [ ] **Step 1: Write failing listener tests**

```typescript
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ReplicationConflictListener } from '../ReplicationConflictListener';

describe('ReplicationConflictListener', () => {
  it('shows a calm conflict notification when replication emits a conflict', async () => {
    render(<ReplicationConflictListener />);

    window.dispatchEvent(
      new CustomEvent('replication:conflict', {
        detail: {
          tableName: 'entries',
          rowId: 'entry-1',
          fields: ['checkInStatus'],
          localData: { id: 'entry-1', checkInStatus: 'checked-in' },
          remoteData: { id: 'entry-1', checkInStatus: 'absent' },
          baseData: { id: 'entry-1', checkInStatus: 'no-status' },
          baseVersion: 1,
          localVersion: 2,
          detectedAt: 1,
        },
      })
    );

    expect(await screen.findByText('This changed while you were editing')).toBeVisible();
    expect(screen.getByRole('button', { name: /review/i })).toBeVisible();
  });

  it('does not modal-block until the user chooses review', async () => {
    const user = userEvent.setup();
    render(<ReplicationConflictListener />);

    window.dispatchEvent(new CustomEvent('replication:conflict', { detail: makeEntryConflict() }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /review/i }));
    expect(await screen.findByRole('dialog')).toBeVisible();
  });

  it('re-prompts for persisted conflicts on mount', async () => {
    mockEntriesTable.getConflictedRows.mockResolvedValue([makePersistedEntryConflictRow()]);

    render(<ReplicationConflictListener />);

    expect(await screen.findByText('This changed while you were editing')).toBeVisible();
  });

  it('keeps the dialog open and shows an error when resolution fails', async () => {
    const user = userEvent.setup();
    mockEntriesTable.resolveReplicationConflict.mockRejectedValue(new Error('IndexedDB failed'));

    render(<ReplicationConflictListener />);
    window.dispatchEvent(new CustomEvent('replication:conflict', { detail: makeEntryConflict() }));
    await user.click(await screen.findByRole('button', { name: /review/i }));
    await user.click(await screen.findByRole('button', { name: /keep mine/i }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(await screen.findByText(/couldn't resolve/i)).toBeVisible();
  });

  it('uses accessible dialog semantics and keyboard-reachable actions', async () => {
    const user = userEvent.setup();
    render(<ReplicationConflictListener />);

    window.dispatchEvent(new CustomEvent('replication:conflict', { detail: makeEntryConflict() }));
    await user.click(await screen.findByRole('button', { name: /review/i }));

    const dialog = await screen.findByRole('dialog', {
      name: /this changed while you were editing/i,
    });
    expect(dialog).toBeVisible();
    await user.tab();
    expect(screen.getByRole('button', { name: /keep mine/i })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run listener tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/replication-conflicts/__tests__/ReplicationConflictListener.test.tsx
```

Expected: FAIL because the feature files do not exist.

- [ ] **Step 3: Implement listener behavior**

`ReplicationConflictListener` behavior:

- Listen for `replication:conflict`.
- [EXPANDED] On mount, call `getConflictedRows()` for each table in `replicationConflictTables`; show the same notification for any persisted conflicts so navigating away or refreshing never hides an unresolved conflict.
- Deduplicate by `${tableName}:${rowId}:${fields.join(',')}`.
- Call `notifications.warning('This changed while you were editing', { description, action: { label: 'Review', onClick } })`.
- Keep no modal open by default. This protects judge rhythm.
- On Review, open `ReplicationConflictReviewDialog`.
- If `tableName === 'entries'` and scoring fields are involved (`resultStatus`, `resultText`, `searchTimeSeconds`, `totalPoints`, `totalFaults`, `judgeNotes`, `finalPlacement`, `scoringCompletedAt`), keep the same non-blocking notification pattern. Do not auto-open a dialog.
- [ADDED] If persisted-conflict loading fails for one table, log `{ tableName, error }` and continue checking the remaining tables; do not block rendering or show a scary page-level error.

- [ ] **Step 4: Implement resolution registry**

`replicationConflictRegistry.ts`:

```typescript
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedClubsTable } from '@/services/replication/ReplicatedClubsTable';
import { replicatedJudgeAssignmentsTable } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import { replicatedArmbandsTable } from '@/services/replication/ReplicatedArmbandsTable';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';

export const replicationConflictTables = {
  shows: replicatedShowsTable,
  trials: replicatedTrialsTable,
  classes: replicatedClassesTable,
  entries: replicatedEntriesTable,
  dogs: replicatedDogsTable,
  clubs: replicatedClubsTable,
  judge_assignments: replicatedJudgeAssignmentsTable,
  armbands: replicatedArmbandsTable,
  waitlist_entries: replicatedWaitlistEntriesTable,
} as const;
```

- [ ] **Step 5: Implement dialog actions**

Dialog actions:

- `Keep mine`: `table.resolveReplicationConflict(rowId, 'keep-local')`, then dispatch `replication:sync-requested`.
- `Take server`: `table.resolveReplicationConflict(rowId, 'take-remote')`, `mutationManager.discardPendingMutationsForRow(tableName, rowId)`, then invalidate sync via `replication:sync-requested`.
- [EXPANDED] If either action fails, keep the dialog open, show inline text `We couldn't resolve this yet. Your change is still saved on this device.`, and log only table name, row id, action, and error message.
- [ADDED] The dialog must use shadcn `Dialog` semantics with an accessible title, initial focus on `Keep mine`, keyboard-reachable actions, and no focus trap escape bug. The notification/toast is advisory; only the user opening Review creates a modal.
- Copy text:
  - Title: `This changed while you were editing`
  - Body: `Your change is safe. Choose which version to keep before sync continues for this item.`
  - Keep button: `Keep mine`
  - Server button: `Take server`

- [ ] **Step 6: Mount listener once**

In `ReplicationSyncProvider.tsx`:

```tsx
return (
  <ReplicationSyncContext.Provider value={contextValue}>
    <ReplicationConflictListener />
    {children}
  </ReplicationSyncContext.Provider>
);
```

Gate it internally with `showConflictSurfacingEnabled()` so flag off means no listener and no prompt.

- [ ] **Step 7: Run UI tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/replication-conflicts/__tests__/ReplicationConflictListener.test.tsx
pnpm typecheck
```

Expected: PASS.

## Task 8: Cross-Table and App Integration Tests

**Files:**

- Modify `packages/replication/src/syncReplicatedTable.test.ts`
- Modify app replicated-table tests under `apps/myk9show/src/services/replication/__tests__/`
- Create `apps/myk9show/src/test/e2e/show-conflicts.spec.ts`

- [ ] **Step 1: Add entries and shows/classes package fixtures**

Add two tests in `syncReplicatedTable.test.ts` using concrete field names:

```typescript
it('surfaces entry check-in collisions', async () => {
  await table.set('entry-1', { id: 'entry-1', name: 'Rex', checkInStatus: 'no-status' });
  await table.set('entry-1', { id: 'entry-1', name: 'Rex', checkInStatus: 'checked-in' }, true);
  const adapter = makeAdapter([{ id: 'entry-1', name: 'Rex', status: undefined }]);
  adapter.toLocalRow = remote => ({
    id: String(remote.id),
    name: remote.name,
    checkInStatus: 'absent',
  } as LocalEntry);

  await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: true });

  await expect(table.getReplicatedRow('entry-1')).resolves.toMatchObject({
    syncStatus: 'conflict',
    conflict: { fields: ['checkInStatus'] },
  });
});

it('surfaces setup-table collisions such as show name changes', async () => {
  await table.set('show-1', { id: 'show-1', name: 'June Trial' });
  await table.set('show-1', { id: 'show-1', name: 'June Trial Updated Locally' }, true);
  const adapter = makeAdapter([{ id: 'show-1', name: 'June Trial Updated Remotely' }]);

  await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: true });

  await expect(table.getReplicatedRow('show-1')).resolves.toMatchObject({
    syncStatus: 'conflict',
    conflict: { fields: ['name'] },
  });
});
```

- [ ] **Step 2: Add app service tests for flag pass-through**

For `ReplicatedEntriesTable` and one setup table, mock `showConflictSurfacingEnabled()` true, run sync, and assert `syncReplicatedTable` receives `{ conflictSurfacingEnabled: true }`.

- [ ] **Step 3: Add already-uploaded ordering coverage**

Add a package-level regression test for the ordering called out in `docs/plan-show-presence.md`: when a local mutation has already uploaded and the next download returns a different same-field server value, the row is clean and should take the server value through the existing `resolveConflict` path, not create a stale local conflict or resurrect a deleted pending mutation.

```typescript
it('does not resurrect a conflict after the local mutation already uploaded and the row is clean', async () => {
  await table.set('1', { id: '1', name: 'Rex', status: 'ready' });
  await table.set('1', { id: '1', name: 'Rex', status: 'checked-in' }, true);
  await table.markAsSynced('1');
  const adapter = makeAdapter([{ id: 1, name: 'Rex', status: 'absent' }]);

  await syncReplicatedTable(table, adapter, {}, { conflictSurfacingEnabled: true });

  await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
    isDirty: false,
    syncStatus: 'synced',
    data: { status: 'absent' },
    conflict: undefined,
  });
});
```

If this test exposes that `markAsSynced()` leaves stale `baseData` or `conflict` metadata behind, patch `markAsSynced()` to clear conflict metadata when the upload succeeds.

- [ ] **Step 4: Add opt-in Playwright smoke**

Create `apps/myk9show/src/test/e2e/show-conflicts.spec.ts`:

```typescript
test.describe('Show conflicts - live Realtime/replication smoke', () => {
  test.describe.configure({ timeout: 120_000 });

  test('two contexts editing the same entry field surface a conflict prompt', async ({ browser }) => {
    test.skip(
      process.env.RUN_CONFLICT_E2E !== '1',
      'Opt-in: VITE_SHOW_CONFLICT_SURFACING=true + RUN_CONFLICT_E2E=1.'
    );

    const secretaryContext = await browser.newContext();
    const exhibitorContext = await browser.newContext();
    try {
      const secretary = await secretaryContext.newPage();
      const exhibitor = await exhibitorContext.newPage();

      await signIn(secretary, TEST_USERS.SECRETARY);
      await signIn(exhibitor, TEST_USERS.EXHIBITOR);

      await openSameEntryInBothContexts(secretary, exhibitor);
      await setCheckInStatus(secretary, 'checked-in');
      await setCheckInStatus(exhibitor, 'absent');
      await triggerReplicationSync(secretary);

      await expect(secretary.getByText('This changed while you were editing')).toBeVisible({
        timeout: 20000,
      });
    } finally {
      await secretaryContext.close();
      await exhibitorContext.close();
    }
  });
});
```

Use real helper implementations matching current routes before committing this spec. Keep it skipped unless `RUN_CONFLICT_E2E=1`. Do not commit placeholder helper names; wire to actual routes/selectors or keep the E2E task incomplete.

- [ ] **Step 5: Run focused integration tests**

Run:

```bash
cd packages/replication && pnpm test
cd apps/myk9show && npx vitest run src/features/replication-conflicts/__tests__/ReplicationConflictListener.test.tsx
cd apps/myk9show && npx vitest run src/services/replication/__tests__/ReplicatedEntriesTable.test.ts src/services/replication/__tests__/ReplicatedShowsTable.test.ts
pnpm typecheck
pnpm lint
```

Expected: PASS. If a suite hangs for more than 60 seconds without useful output, stop it and record the hang in the PR notes.

## Task 9: Rollout, Observability, and Documentation

**Files:**

- Modify `docs/plan-show-presence.md`
- Modify `docs/handoffs/2026-06-08-presence-edit-awareness-followups.md` only if this work is handed off before merge.
- Modify `OPEN-TODOS.md` or the active sprint tracker if it lists Phase 4.
- Modify `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`

- [ ] **Step 1: Add conflict metrics log**

On conflict event:

```typescript
logger.warn('Replication conflict surfaced', 'replication', {
  tableName: detail.tableName,
  rowId: detail.rowId,
  fields: detail.fields,
});
```

Do not log full row payloads in production app logs because entry rows can include exhibitor-related data.

- [ ] **Step 2: Add browser diagnostics**

Extend `__replicationDiag`:

```typescript
getConflicts: async () =>
  Promise.all(REPLICATED_TABLES.map(async ({ name, table }) => ({ name, rows: await table.getConflictedRows() }))),
```

Add `getConflictedRows()` to `ReplicatedTable<T>` if Task 7 needs persisted conflict discovery on mount.

- [ ] **Step 3: Add rollback and recovery notes**

Document these recovery paths in `docs/plan-show-presence.md`:

- Flag off: `features.showConflictSurfacing: false` or `VITE_SHOW_CONFLICT_SURFACING=false` restores pre-Phase-4 dirty-row merge/LWW behavior.
- User escape hatch: `Take server` discards held local mutations for that row.
- Operator escape hatch: existing `ClearCacheButton` remains valid if a local IndexedDB replica wedges.
- Partial failure: one conflicted row must not block downloads or uploads for other rows.

- [ ] **Step 4: Add security and privacy notes**

Document these constraints:

- Never use `replication:conflict` event payloads for authorization decisions; they are local display data only.
- Do not send `localData`, `remoteData`, or `baseData` to logs, analytics, Realtime, or support telemetry.
- Resolution still writes through the existing replicated table mutation paths and Supabase RLS; no direct privileged write path is added.

- [ ] **Step 5: Add performance notes**

Document these constraints:

- Conflict detection is per incoming dirty row and compares object fields once; no extra Supabase reads.
- Persisted conflict discovery scans each local table on provider mount only, then relies on events.
- Notifications are deduplicated by table, row, and fields to avoid toast storms during reconnect.

- [ ] **Step 6: Update plan status docs**

In `docs/plan-show-presence.md`, after implementation and verification:

```markdown
**Phase 4 status:** implemented behind `features.showConflictSurfacing` / `VITE_SHOW_CONFLICT_SURFACING`; pending live two-context validation before enablement.
```

- [ ] **Step 7: Run docs checks**

Run:

```bash
git diff --check
rg -n "showConflictSurfacing|VITE_SHOW_CONFLICT_SURFACING|replication:conflict" docs apps/myk9show packages/replication
```

Expected: no whitespace errors; all new flags and event names are discoverable.

## Testing Phase

Run these before opening a PR:

```bash
cd packages/replication && pnpm test
cd packages/replication && pnpm typecheck
cd apps/myk9show && npx vitest run src/features/replication-conflicts/__tests__/ReplicationConflictListener.test.tsx
cd apps/myk9show && npx vitest run src/services/replication/__tests__/ReplicatedEntriesTable.test.ts src/services/replication/__tests__/ReplicatedShowsTable.test.ts
pnpm typecheck
pnpm lint
git diff --check
```

Run this only for live validation:

```bash
cd apps/myk9show
VITE_SHOW_CONFLICT_SURFACING=true RUN_CONFLICT_E2E=1 npx playwright test src/test/e2e/show-conflicts.spec.ts --project=chromium
```

Manual validation before enablement:

- Two staff edit the same show name: conflict notification appears, save is not silently overwritten.
- Secretary and exhibitor edit the same entry check-in status: conflict notification appears to the writer with the held local mutation.
- Judge scoring flow receives a scoring conflict notification without modal-blocking the active scoring interaction.
- Refresh the browser with an unresolved conflict: the review notification reappears.
- Force a resolution failure in dev: the dialog stays open and confirms the local change is still saved.
- `features.showConflictSurfacing: false` restores current dirty-row merge/LWW behavior.

## Review Bar

- Run `/codex:review`.
- Get a second human or agent reviewer before merge.
- Keep the first PR behind `features.showConflictSurfacing: false`.
- Enable only after live two-context validation and after conflict metrics show no unexpected spike during internal use.
