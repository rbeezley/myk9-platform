import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ReplicatedTable } from './ReplicatedTable';
import { MutationManager } from '../MutationManager';
import { syncReplicatedTable } from '../syncReplicatedTable';
import type { ReplicationConflictSnapshot, SyncResult } from '../types';

/**
 * MYK9-1133: the account a reader filters by is settled BEFORE any IndexedDB
 * transaction opens. With no persisted session the live lookup can take a
 * macro-task or more; awaiting it inside an open transaction lets the
 * transaction auto-commit and the next read throws TransactionInactiveError.
 */

interface Row {
  id: string;
  showId: string;
  name: string;
}

class OwnedTable extends ReplicatedTable<Row> {
  override usesAccountOwnedRows(): boolean {
    return true;
  }
  async sync(): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }
  protected resolveConflict(_local: Row, remote: Row): Row {
    return remote;
  }
}

const data = (id: string, name = id): Row => ({ id, showId: 'show-1', name });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('a live identity lookup that takes a while (MYK9-1133)', () => {
  let table: OwnedTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
    table = new OwnedTable(`rows_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager(
      new MutationManager({} as SupabaseClient, {
        // No persisted session: only the live lookup can answer, after a macro-task.
        getCurrentUserId: async () => {
          await delay(5);
          return 'user-a';
        },
        getCachedUserId: () => null,
      })
    );
  });

  afterEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
  });

  it('stale-row cleanup removes the account own stale rows and keeps the rest', async () => {
    await table.batchSet([data('keep'), data('stale')], undefined, 'user-a');
    await table.batchSet([data('theirs')], undefined, 'user-b');
    await delay(5);

    const removed = await table.removeStaleEntries(new Set(['keep']));

    expect(removed).toBe(1);
    expect((await table.getAllOrThrow()).map(r => r.id)).toEqual(['keep']);
    expect((await table.getAllOrThrowIncludingOtherAccounts()).map(r => r.id).sort()).toEqual([
      'keep',
      'theirs',
    ]);
  });

  it('getConflictedRows returns the account own conflict snapshots', async () => {
    await table.set('r1', data('r1', 'base'));
    await table.set('r1', data('r1', 'local'), true);
    const row = (await table.getReplicatedRow('r1'))!;
    const snapshot: ReplicationConflictSnapshot<Row> = {
      tableName: table.getTableName(),
      rowId: 'r1',
      fields: ['name'],
      localData: data('r1', 'local'),
      remoteData: data('r1', 'remote'),
      baseData: data('r1', 'base'),
      baseVersion: 1,
      localVersion: row.version,
      remoteServerVersion: 3,
      detectedAt: Date.now(),
    };
    await table.markConflict('r1', snapshot, 3);

    const conflicts = await table.getConflictedRows();

    expect(conflicts.map(c => c.rowId)).toEqual(['r1']);
  });

  it('a sync with stale cleanup completes', async () => {
    await table.batchSet([data('gone')], undefined, 'user-a');
    await delay(5);
    const result = await syncReplicatedTable(
      table,
      {
        fetchRemoteRows: vi.fn(async () => [data('kept')]),
        getRemoteRowCount: vi.fn(async () => 1),
        getRemoteId: r => r.id,
        toLocalRow: r => r,
        cleanupStaleRowsOnFullSync: true,
        filterLocalRows: (rows, scope) => rows.filter(r => r.showId === scope.value),
      },
      { value: 'show-1' },
      { forceFullSync: true }
    );

    expect(result.success).toBe(true);
    expect((await table.getAllOrThrow()).map(r => r.id)).toEqual(['kept']);
  });
});
