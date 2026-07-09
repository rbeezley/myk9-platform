/**
 * Orphaned-dirty-row repair (audit M6): a crash between set(id, data, true) and
 * queueMutation leaves a dirty row with no pending mutation — it shows as saved
 * but never uploads. requeueOrphanedDirtyRows() re-queues an UPDATE for such
 * rows at startup so the stranded score still syncs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ReplicatedTable } from './ReplicatedTable';
import { databaseManager, REPLICATION_STORES } from './DatabaseManager';
import { MutationManager } from '../MutationManager';
import { createMutationManagerTestDb } from '../test-utils/createMutationManagerTestDb';
import type { SyncResult } from '../types';

interface TestEntity {
  id: string;
  score?: number;
}

class RepairableTable extends ReplicatedTable<TestEntity> {
  async sync(): Promise<SyncResult> {
    return {
      tableName: this.tableName,
      success: true,
      operation: 'full-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(_local: TestEntity, remote: TestEntity): TestEntity {
    return remote;
  }

  // Enables the repair to rebuild a payload (RPC/delta-only tables can't).
  protected override rebuildUpdatePayload(row: TestEntity): Record<string, unknown> {
    return { id: row.id, score: row.score };
  }
}

function createMockSupabase(): SupabaseClient {
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'x' }], error: null })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe('ReplicatedTable.requeueOrphanedDirtyRows', () => {
  let table: RepairableTable;
  let manager: MutationManager;
  let tableName: string;

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await createMutationManagerTestDb('test-orphan-repair-db');
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(db);

    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null,
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });

    tableName = 'test_entities';
    table = new RepairableTable(tableName);
    manager = new MutationManager(createMockSupabase(), {
      maxRetries: 3,
      retryBackoffBase: 10,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
    table.setMutationManager(manager);

    // Clean shared stores between tests.
    const clearTx = db.transaction(
      [
        REPLICATION_STORES.REPLICATED_TABLES,
        REPLICATION_STORES.PENDING_MUTATIONS,
        REPLICATION_STORES.FAILED_MUTATIONS,
      ],
      'readwrite'
    );
    await clearTx.objectStore(REPLICATION_STORES.REPLICATED_TABLES).clear();
    await clearTx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).clear();
    await clearTx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS).clear();
    await clearTx.done;
  });

  afterEach(() => {
    manager.destroy();
    vi.restoreAllMocks();
  });

  it('re-queues a dirty row that has no pending mutation', async () => {
    // set(dirty) WITHOUT queueMutation = the crash-window orphaned state.
    await table.set('1', { id: '1', score: 50 }, true);
    expect(await table.getPendingMutationIdsForRow('1')).toHaveLength(0);

    const repaired = await table.requeueOrphanedDirtyRows();

    expect(repaired).toBe(1);
    const pending = await table.getPendingMutationIdsForRow('1');
    expect(pending).toHaveLength(1);
  });

  it('does NOT re-queue a dirty row that already has a pending mutation', async () => {
    await table.set('1', { id: '1', score: 50 }, true);
    // Simulate the normal path having queued a mutation for this row.
    await manager.queueMutation(tableName, 'UPDATE', '1', { id: '1', score: 50 });
    expect(await table.getPendingMutationIdsForRow('1')).toHaveLength(1);

    const repaired = await table.requeueOrphanedDirtyRows();

    expect(repaired).toBe(0);
    expect(await table.getPendingMutationIdsForRow('1')).toHaveLength(1);
  });

  it('does NOT re-queue clean rows', async () => {
    await table.set('1', { id: '1', score: 50 }, false); // clean

    const repaired = await table.requeueOrphanedDirtyRows();

    expect(repaired).toBe(0);
    expect(await table.getPendingMutationIdsForRow('1')).toHaveLength(0);
  });

  it('does NOT re-queue a dirty row whose mutation dead-lettered to the failed store', async () => {
    // A dead-lettered mutation leaves its row dirty (only the success path clears
    // isDirty) but parked in FAILED_MUTATIONS for user retry/discard. Re-queuing
    // it would re-run the permanently-failing write every reload and pile up
    // duplicates in the failed store (code-review HIGH finding).
    await table.set('1', { id: '1', score: 50 }, true);
    const db = await databaseManager.getDatabase('test');
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, {
      id: 'failed-mut-1',
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', score: 50 },
      timestamp: 1,
      retries: 3,
      status: 'failed',
      error: 'permission denied for table entries',
      failedAt: 1,
    });
    // Sanity: the row is dirty with no PENDING mutation (the orphan precondition).
    expect(await table.getPendingMutationIdsForRow('1')).toHaveLength(0);

    const repaired = await table.requeueOrphanedDirtyRows();

    expect(repaired).toBe(0);
    expect(await table.getPendingMutationIdsForRow('1')).toHaveLength(0);
  });
});
