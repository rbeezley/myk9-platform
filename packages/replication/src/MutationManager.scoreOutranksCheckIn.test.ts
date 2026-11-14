import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { MutationManager } from './MutationManager';
import type { DirtyRowComparePolicy } from './conflict/detectDirtyRowConflict';
import {
  adapterFor,
  afterBackoff,
  makeServer,
  pendingFor,
  RefetchingEntriesTable,
  resetForStaleRowTest,
  startStaleRowManager,
  teardownStaleRowTest,
  type ServerRow,
} from './test-utils/staleRowRefetchFixtures';
import type { PendingMutation } from './types';

/**
 * MYK9-2010 on the real path: the judge's score is queued, someone else changes the dog's
 * check-in, and the stale write is rejected (40001). `status` plays `check_in_status` and
 * `finalPlacement` plays the score. The score outranks the check-in change and the judge is
 * never asked; a pull is the one change that keeps its place.
 */
const comparePolicy: DirtyRowComparePolicy = {
  resolveCollision: (field, { local, remote }) => {
    if (field !== 'status') return undefined;
    return local.finalPlacement != null && remote.status !== 'pulled' ? 'device' : 'server';
  },
};

describe('a check-in change never holds a queued score (MYK9-2010)', () => {
  let manager: MutationManager;
  let tableName: string;

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });

  afterEach(async () => {
    await teardownStaleRowTest(manager);
  });

  /** Clean 'in-ring' at version 3; the judge then saves the score and completes the dog. */
  async function seedScoredRun(table: RefetchingEntriesTable) {
    await table.set('1', { id: '1', status: 'in-ring', finalPlacement: null }, false, undefined, 3);
    await table.set('1', { id: '1', status: 'completed', finalPlacement: 1 }, true);
    const db = await databaseManager.getDatabase('test');
    const mutation: PendingMutation = {
      id: `mut-score-${tableName}`,
      authUserId: 'stale-row-refetch-user',
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', status: 'completed', final_placement: 1 },
      explicitDataKeys: ['id', 'status', 'final_placement'],
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      serverVersion: 3,
    };
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
  }

  async function run(serverRow: ServerRow) {
    const adapter = { ...adapterFor(serverRow), dirtyRowComparePolicy: comparePolicy };
    const table = new RefetchingEntriesTable(tableName, adapter);
    const server = makeServer(serverRow);
    manager = startStaleRowManager(table, server.supabase).manager;
    await seedScoredRun(table);
    const conflicts: unknown[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        if (event.type === 'replication:conflict') conflicts.push((event as CustomEvent).detail);
        return true;
      },
    });
    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect((await pendingFor(tableName))[0]?.serverVersion).toBe(8));
    afterBackoff();
    await manager.uploadPendingMutations();
    return { table, conflicts, ...server };
  }

  it('a steward moved the dog on: the score saves, the dog ends completed, nobody is asked', async () => {
    const serverRow: ServerRow = { status: 'checked-in', final_placement: null, version: 8 };
    const { table, conflicts } = await run(serverRow);

    expect(conflicts).toHaveLength(0);
    expect(serverRow).toMatchObject({ status: 'completed', final_placement: 1, version: 9 });
    expect(await pendingFor(tableName)).toHaveLength(0);
    expect((await table.getReplicatedRow('1'))?.syncStatus).not.toBe('conflict');
  });

  it('a pull during the run: the score saves and the pull stays, nobody is asked', async () => {
    const serverRow: ServerRow = { status: 'pulled', final_placement: null, version: 8 };
    const { table, conflicts, updates } = await run(serverRow);

    expect(conflicts).toHaveLength(0);
    expect(serverRow).toMatchObject({ status: 'pulled', final_placement: 1, version: 9 });
    expect(updates.filter(call => call.applied).every(call => !('status' in call.data))).toBe(true);
    expect(await pendingFor(tableName)).toHaveLength(0);
    expect((await table.getReplicatedRow('1'))?.syncStatus).not.toBe('conflict');
  });
});
