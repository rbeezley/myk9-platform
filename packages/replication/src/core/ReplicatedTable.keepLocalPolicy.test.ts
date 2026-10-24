import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReplicatedTable } from './ReplicatedTable';
import type { MutationManager } from '../MutationManager';
import type { DirtyRowComparePolicy } from '../conflict/detectDirtyRowConflict';
import type { RowRefetchAdapter } from '../refetchDirtyRowsById';
import type { ReplicationConflictSnapshot, SyncResult } from '../types';

/**
 * MYK9-1378: "Keep mine" merges with the same compare policy as the
 * dirty-row reconcile path, so a declared field group (a class's judge) stays
 * whole instead of being half-replaced by the server.
 */

interface ClassRow {
  id: string;
  judgeId: string | null;
  judgeName: string | null;
  judgeLastName: string | null;
  room: number;
}

const JUDGE_POLICY: DirtyRowComparePolicy = {
  fieldGroups: [['judgeId', 'judgeName', 'judgeLastName']],
};

class ClassesTable extends ReplicatedTable<ClassRow> {
  async sync(): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }
  protected resolveConflict(_local: ClassRow, remote: ClassRow): ClassRow {
    return remote;
  }
  protected override getRowRefetchAdapter(): RowRefetchAdapter<ClassRow, ClassRow> {
    return {
      fetchRowsById: async () => [],
      getRemoteId: remote => remote.id,
      toLocalRow: remote => remote,
      dirtyRowComparePolicy: JUDGE_POLICY,
    };
  }
}

const base: ClassRow = {
  id: 'c1',
  judgeId: 'a',
  judgeName: 'Ann Judge',
  judgeLastName: 'Judge',
  room: 1,
};
// The new judge shares the old one's last name, so that member equals the base.
const local: ClassRow = { ...base, judgeId: 'c', judgeName: 'Cy Judge' };
const remote: ClassRow = { ...base, judgeName: null, judgeLastName: null, room: 2 };

describe('keep-local merges with the table compare policy (MYK9-1378)', () => {
  let table: ClassesTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
    table = new ClassesTable(`classes_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager({
      resolveCurrentUserId: async () => 'user-a',
      getPendingMutationsForRow: async () => [],
      getFailedMutations: async () => [],
      reconcilePendingMutationsForRow: async () => 0,
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./DatabaseManager');
    await databaseManager.reset();
  });

  it('keeps the changed judge group whole and still adopts the non-group server field', async () => {
    await table.set('c1', base);
    await table.set('c1', local, true);
    const row = (await table.getReplicatedRow('c1'))!;
    const snapshot: ReplicationConflictSnapshot<ClassRow> = {
      tableName: table.getTableName(),
      rowId: 'c1',
      fields: ['judgeId'],
      localData: local,
      remoteData: remote,
      baseData: base,
      baseVersion: 1,
      localVersion: row.version,
      remoteServerVersion: 5,
      detectedAt: Date.now(),
    };
    expect(await table.markConflict('c1', snapshot, 5)).toBe(true);

    expect(await table.resolveReplicationConflict('c1', 'keep-local')).toBe(true);

    expect((await table.getReplicatedRow('c1'))?.data).toEqual({
      id: 'c1',
      judgeId: 'c',
      judgeName: 'Cy Judge',
      judgeLastName: 'Judge',
      room: 2,
    });
  });
});
