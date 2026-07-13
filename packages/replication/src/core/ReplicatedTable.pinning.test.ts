import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncOptions, SyncResult } from '../types';
import { databaseManager } from './DatabaseManager';
import { ReplicatedTable } from './ReplicatedTable';

interface TestEntity {
  id: string;
  name: string;
  status: string;
}

class TestReplicatedTable extends ReplicatedTable<TestEntity> {
  async sync(_licenseKey: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
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
}

describe('ReplicatedTable contract pins', () => {
  let table: TestReplicatedTable;

  beforeEach(async () => {
    await databaseManager.reset();
    table = new TestReplicatedTable(`pinning_${Date.now()}_${Math.random()}`);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await databaseManager.reset();
  });

  it('does not overwrite a dirty row with a clean server write', async () => {
    await table.set('1', { id: '1', name: 'Rex', status: 'local' }, true);

    await table.set('1', { id: '1', name: 'Rex', status: 'remote' }, false);

    await expect(table.getReplicatedRow('1')).resolves.toMatchObject({
      data: { status: 'local' },
      isDirty: true,
    });
  });

  it('keeps reconciliation forward-only and skips an equal no-advance write', async () => {
    await table.set('1', { id: '1', name: 'Rex', status: 'ready' }, false, undefined, 8);
    await table.set('1', { id: '1', name: 'Rex', status: 'local' }, true);

    const lowerResult = await table.reconcileDirtyRow('1', {
      base: { id: '1', name: 'Rex', status: 'ready' },
      remote: { id: '1', name: 'Rex', status: 'ready' },
      remoteServerVersion: 7,
    });
    const beforeNoOp = await table.getReplicatedRow('1');
    vi.spyOn(Date, 'now').mockReturnValue((beforeNoOp?.lastSyncedAt ?? 0) + 1_000);
    const noOpResult = await table.reconcileDirtyRow('1', {
      base: { id: '1', name: 'Rex', status: 'ready' },
      remote: { id: '1', name: 'Rex', status: 'ready' },
      remoteServerVersion: 8,
    });
    const afterNoOp = await table.getReplicatedRow('1');

    expect(lowerResult).toBe(false);
    expect(beforeNoOp?.serverVersion).toBe(8);
    expect(noOpResult).toBe(false);
    expect(afterNoOp?.version).toBe(beforeNoOp?.version);
    expect(afterNoOp?.lastSyncedAt).toBe(beforeNoOp?.lastSyncedAt);
    expect(afterNoOp?.serverVersion).toBe(8);
    expect(afterNoOp?.data.status).toBe('local');
  });
});
