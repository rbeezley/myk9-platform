import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetConflictSurfacingForTests, configureConflictSurfacing } from './conflictConfig';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { ReplicatedTable } from './core/ReplicatedTable';
import { markReplicatedRowSynced } from './mutation-row-sync';
import { reconcileDirtyRemoteRow } from './reconcileDirtyRemoteRow';
import type { PendingMutation, SyncOptions, SyncResult } from './types';

/**
 * MYK9-1220: a judge saves Q, then corrects it to NQ while Q is still being
 * acknowledged. The next pull returns the device's OWN Q write; it must not read
 * as someone else changing the row.
 */
interface ScoreRow {
  id: string;
  result: string | null;
  reason: string | null;
}

class ScoreTable extends ReplicatedTable<ScoreRow> {
  async sync(_scope: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(_local: ScoreRow, remote: ScoreRow): ScoreRow {
    return remote;
  }
}

const AUTH = 'own-write-user';
const rebuildUpdatePayload = (local: ScoreRow) => ({
  id: local.id,
  result: local.result,
  reason: local.reason,
});

describe('a pull that returns the device’s own acknowledged write (MYK9-1220)', () => {
  let tableName: string;
  let conflicts: Array<{ fields: string[] }>;

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('test');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    configureConflictSurfacing(true);
    tableName = `entries_${crypto.randomUUID()}`;
    conflicts = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        if (event.type === 'replication:conflict') {
          conflicts.push((event as CustomEvent).detail);
        }
        return true;
      },
    });
  });

  afterEach(async () => {
    _resetConflictSurfacingForTests();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  function mutation(id: string, data: Partial<ScoreRow>, serverVersion: number): PendingMutation {
    return {
      id,
      authUserId: AUTH,
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', ...data },
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      serverVersion,
    };
  }

  /** Clean at v3 with a leftover reason (R0), then Q (A) is saved and queued. */
  async function seedAWithS0(): Promise<{
    table: ScoreTable;
    mutationA: PendingMutation;
  }> {
    const table = new ScoreTable(tableName);
    await table.set('1', { id: '1', result: 'abs', reason: 'R0' }, false, undefined, 3);
    await table.set('1', { id: '1', result: 'q', reason: null }, true);
    const mutationA = mutation('mut-A', { result: 'q', reason: null }, 3);
    const db = await databaseManager.getDatabase('test');
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutationA);
    return { table, mutationA };
  }

  async function pull(table: ScoreTable, remote: ScoreRow, version: number) {
    const existing = (await table.getReplicatedRow('1'))!;
    return reconcileDirtyRemoteRow(
      table,
      { rebuildUpdatePayload },
      {
        id: '1',
        existing: { ...existing, baseData: existing.baseData! },
        remoteLocal: remote,
        remoteServerVersion: version,
      }
    );
  }

  it('(i) A is acknowledged while B is queued: pulling A is no conflict, B keeps its edit', async () => {
    const { table, mutationA } = await seedAWithS0();
    // B (NQ + reason) is saved while A is unacknowledged.
    await table.set('1', { id: '1', result: 'nq', reason: 'R1' }, true);
    const db = await databaseManager.getDatabase('test');
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation('mut-B', { result: 'nq', reason: 'R1' }, 3)
    );
    // The server acknowledges A (v3 -> v4).
    await markReplicatedRowSynced(db, mutationA, 4);
    await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-A');

    const outcome = await pull(table, { id: '1', result: 'q', reason: null }, 4);

    expect(conflicts).toEqual([]);
    expect(outcome.conflict).toBe(false);
    const row = await table.getReplicatedRow('1');
    expect(row?.syncStatus).not.toBe('conflict');
    expect(row?.data).toEqual({ id: '1', result: 'nq', reason: 'R1' });
    expect(row?.serverVersion).toBe(4);
  });

  it('(i-b) B is saved after A is acknowledged: pulling A is no conflict', async () => {
    const { table, mutationA } = await seedAWithS0();
    const db = await databaseManager.getDatabase('test');
    await markReplicatedRowSynced(db, mutationA, 4);
    await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-A');
    await table.set('1', { id: '1', result: 'nq', reason: 'R1' }, true);

    const outcome = await pull(table, { id: '1', result: 'q', reason: null }, 4);

    expect(outcome.conflict).toBe(false);
    expect(conflicts).toEqual([]);
  });

  it('(ii) the pull lands while A is still in flight and returns the pre-A row', async () => {
    const { table } = await seedAWithS0();
    await table.set('1', { id: '1', result: 'nq', reason: 'R1' }, true);

    const outcome = await pull(table, { id: '1', result: 'abs', reason: 'R0' }, 3);

    expect(outcome.conflict).toBe(false);
    expect(conflicts).toEqual([]);
  });

  it('(iii) control: someone else wrote a different reason at v4 while B is pending, so it IS a conflict', async () => {
    const { table, mutationA } = await seedAWithS0();
    await table.set('1', { id: '1', result: 'nq', reason: 'R1' }, true);
    const db = await databaseManager.getDatabase('test');
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation('mut-B', { result: 'nq', reason: 'R1' }, 3)
    );
    await markReplicatedRowSynced(db, mutationA, 4);
    await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-A');

    // Another device then wrote v5: a different result AND reason.
    const outcome = await pull(table, { id: '1', result: 'excused', reason: 'R2' }, 5);

    expect(outcome.conflict).toBe(true);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.fields.sort()).toEqual(['reason', 'result']);
  });
});
