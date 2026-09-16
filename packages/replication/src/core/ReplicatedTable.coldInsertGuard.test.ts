/**
 * MYK9-575, base-class half: `set()` on a SHOW-SCOPED table refuses an INSERT
 * the caller did not name a reason for, reports the refusal instead of
 * returning silently, and survives the quota-eviction retry.
 *
 * The app-level half (which callers opt in, and that an account-level read
 * still falls through to PostgREST) lives in
 * apps/myk9show/src/services/replication/ReplicatedEntriesTable.coldInsertGuard.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedTable } from './ReplicatedTable';
import { ShowScopedColdInsertError, type ColdInsertGuardMode } from './coldInsertGuard';
import { databaseManager } from './DatabaseManager';
import type { SyncResult } from '../types';
import type { MutationManager } from '../MutationManager';

interface TestRow {
  id: string;
  name: string;
}

class ShowScopedTestTable extends ReplicatedTable<TestRow> {
  guardMode: ColdInsertGuardMode | null = 'throw';
  /** Row id that `relieveQuota()` should evict, mimicking clean-row eviction. */
  evictOnQuotaRelief: string | null = null;

  constructor() {
    super('entries');
  }

  async sync(): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'full-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(_local: TestRow, remote: TestRow): TestRow {
    return remote;
  }

  protected override coldInsertGuardMode(): ColdInsertGuardMode | null {
    return this.guardMode;
  }

  /**
   * Stands in for the real LRU pass. `relieveQuota()` protects only DIRTY rows,
   * so evicting the clean row being written is exactly what production does
   * under quota pressure — the behaviour that turns a retry into an INSERT.
   */
  override async relieveQuota(): Promise<number> {
    if (!this.evictOnQuotaRelief) return super.relieveQuota();
    await this.delete(this.evictOnQuotaRelief);
    this.evictOnQuotaRelief = null;
    return 1;
  }
}

/** Make the next IDB `put` fail the way an exhausted storage quota does. */
function failNextPutWithQuotaError(): () => void {
  const original = IDBObjectStore.prototype.put;
  let fired = false;
  IDBObjectStore.prototype.put = function patched(this: IDBObjectStore, ...args: never[]) {
    if (!fired) {
      fired = true;
      const error = new Error('QuotaExceededError');
      error.name = 'AbortError';
      throw error;
    }
    return (original as (...a: never[]) => IDBRequest).apply(this, args);
  } as typeof IDBObjectStore.prototype.put;
  return () => {
    IDBObjectStore.prototype.put = original;
  };
}

describe('ReplicatedTable cold-insert guard (MYK9-575)', () => {
  let table: ShowScopedTestTable;

  beforeEach(async () => {
    await databaseManager.reset();
    table = new ShowScopedTestTable();
    // databaseManager.reset() closes the connection but keeps the DATA, so an
    // empty store has to be asked for explicitly or a shuffled run inherits the
    // previous test's rows.
    await table.clearCache();
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  it('refuses an un-opted-in INSERT and reports it (throw mode)', async () => {
    await expect(table.set('row-1', { id: 'row-1', name: 'a' })).rejects.toThrow(
      ShowScopedColdInsertError
    );

    expect(await table.getAll()).toHaveLength(0);
  });

  it('in skip mode resolves with written:false, writes nothing and never throws', async () => {
    table.guardMode = 'skip';

    const result = await table.set('row-1', { id: 'row-1', name: 'a' });

    expect(result).toEqual({ written: false, reason: 'cold-insert-refused' });
    expect(await table.getAll()).toHaveLength(0);
  });

  it('releases the mutation write lock when a dirty insert is refused', async () => {
    // A held lock is invisible from outside (pendingWriteLocks is private), so
    // observe it where it is acquired: the release callback must have run, or
    // the mutation queue stays blocked behind a write that never happened.
    table.guardMode = 'skip';
    const release = vi.fn();
    table.setMutationManager({
      acquireMutationWriteLock: vi.fn(async () => release),
      getPendingCount: vi.fn(async () => 0),
    } as unknown as MutationManager);

    const result = await table.set('row-1', { id: 'row-1', name: 'a' }, true);

    expect(result.written).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('allows an opted-in INSERT and reports written:true', async () => {
    const result = await table.set(
      'row-1',
      { id: 'row-1', name: 'a' },
      false,
      undefined,
      undefined,
      {
        allowColdInsert: 'test',
      }
    );

    expect(result).toEqual({ written: true });
    expect(await table.get('row-1')).toEqual({ id: 'row-1', name: 'a' });
  });

  it('does not turn a quota-eviction retry of an UPDATE into a refused INSERT', async () => {
    // The row exists, so this is an UPDATE. The first attempt aborts on quota;
    // relieveQuota() then evicts that very row (it is clean, so nothing
    // protects it) and the retry finds an EMPTY store. The guard decision must
    // already have been made on the first attempt, or production silently drops
    // a legitimate write.
    await table.batchSet([{ id: 'row-1', name: 'before' }]);
    table.evictOnQuotaRelief = 'row-1';
    const restorePut = failNextPutWithQuotaError();

    try {
      const result = await table.set('row-1', { id: 'row-1', name: 'after' });

      expect(result).toEqual({ written: true });
      expect(await table.get('row-1')).toEqual({ id: 'row-1', name: 'after' });
    } finally {
      restorePut();
    }
  });

  it('still refuses when the row never existed and the first attempt hit quota', async () => {
    // Same retry path, opposite fact: nothing proved the row existed, so the
    // retry must not inherit an opt-in.
    table.evictOnQuotaRelief = 'other-row';
    await table.batchSet([{ id: 'other-row', name: 'x' }]);
    const restorePut = failNextPutWithQuotaError();

    try {
      await expect(table.set('row-1', { id: 'row-1', name: 'a' })).rejects.toThrow(
        ShowScopedColdInsertError
      );
    } finally {
      restorePut();
    }
  });

  it('leaves an account-scoped table (no guard) inserting freely', async () => {
    table.guardMode = null;

    const result = await table.set('row-1', { id: 'row-1', name: 'a' });

    expect(result).toEqual({ written: true });
  });
});
