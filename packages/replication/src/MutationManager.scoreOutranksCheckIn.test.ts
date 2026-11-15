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
    expect(updates.filter(call => call.applied).every(call => call.data.status === 'pulled')).toBe(
      true
    );
    expect(await pendingFor(tableName)).toHaveLength(0);
    expect((await table.getReplicatedRow('1'))?.syncStatus).not.toBe('conflict');
  });

  it('the only queued write echoes the other device status and the row goes clean on upload', async () => {
    const serverRow: ServerRow = { status: 'pulled', final_placement: null, version: 8 };
    const adapter = { ...adapterFor(serverRow), dirtyRowComparePolicy: comparePolicy };
    const table = new RefetchingEntriesTable(tableName, adapter);
    const server = makeServer(serverRow);
    manager = startStaleRowManager(table, server.supabase).manager;
    // The judge's only queued write is the in-ring marker (nothing scored yet).
    await table.set(
      '1',
      { id: '1', status: 'checked-in', finalPlacement: null },
      false,
      undefined,
      3
    );
    await table.set('1', { id: '1', status: 'in-ring', finalPlacement: null }, true);
    const db = await databaseManager.getDatabase('test');
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
      id: `mut-ring-${tableName}`,
      authUserId: 'stale-row-refetch-user',
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', status: 'in-ring' },
      explicitDataKeys: ['id', 'status'],
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      serverVersion: 3,
    } as PendingMutation);
    vi.stubGlobal('window', { dispatchEvent: () => true });

    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect((await pendingFor(tableName))[0]?.serverVersion).toBe(8));
    // Reconcile never deletes the write or marks the row clean itself.
    expect(await pendingFor(tableName)).toMatchObject([{ data: { id: '1', status: 'pulled' } }]);
    expect((await table.getReplicatedRow('1'))?.isDirty).toBe(true);

    afterBackoff();
    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect(await pendingFor(tableName)).toHaveLength(0));
    expect(serverRow.status).toBe('pulled');
    await vi.waitFor(async () => expect((await table.getReplicatedRow('1'))?.isDirty).toBe(false));
  });

  it('a pull settled before a score collision survives keeping my score', async () => {
    // The server holds the pull AND a different score; the device saved its own score.
    const serverRow: ServerRow = { status: 'pulled', final_placement: 2, version: 8 };
    const adapter = { ...adapterFor(serverRow), dirtyRowComparePolicy: comparePolicy };
    const table = new RefetchingEntriesTable(tableName, adapter);
    const server = makeServer(serverRow);
    manager = startStaleRowManager(table, server.supabase).manager;
    await seedScoredRun(table);
    vi.stubGlobal('window', { dispatchEvent: () => true });

    await manager.uploadPendingMutations();
    await vi.waitFor(async () =>
      expect((await table.getReplicatedRow('1'))?.syncStatus).toBe('conflict')
    );
    expect((await table.getReplicatedRow('1'))?.conflict?.serverWonFields).toEqual(['status']);

    // The full-row fixture write needs the rebuild the real adapter supplies to rebase its token.
    await table.resolveReplicationConflict('1', 'keep-local', {
      rebuildUpdatePayload: local => ({ id: local.id, final_placement: local.finalPlacement }),
    });
    afterBackoff();
    await manager.uploadPendingMutations();
    await vi.waitFor(() => expect(serverRow.final_placement).toBe(1));

    expect(serverRow.status).toBe('pulled');
    expect(await pendingFor(tableName)).toHaveLength(0);
  });

  it('an edit made after reconcile is not marked clean by the echo upload', async () => {
    const serverRow: ServerRow = { status: 'pulled', final_placement: null, version: 8 };
    const adapter = { ...adapterFor(serverRow), dirtyRowComparePolicy: comparePolicy };
    const table = new RefetchingEntriesTable(tableName, adapter);
    const server = makeServer(serverRow);
    manager = startStaleRowManager(table, server.supabase).manager;
    await table.set(
      '1',
      { id: '1', status: 'checked-in', finalPlacement: null },
      false,
      undefined,
      3
    );
    await table.set('1', { id: '1', status: 'in-ring', finalPlacement: null }, true);
    const db = await databaseManager.getDatabase('test');
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
      id: `mut-ring-${tableName}`,
      authUserId: 'stale-row-refetch-user',
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', status: 'in-ring' },
      explicitDataKeys: ['id', 'status'],
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      serverVersion: 3,
    } as PendingMutation);
    vi.stubGlobal('window', { dispatchEvent: () => true });
    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect((await pendingFor(tableName))[0]?.serverVersion).toBe(8));

    // The judge saves a score after the reconcile, before the echo uploads. Its write is queued
    // and held back (not yet due), so only the echo goes out.
    await table.set('1', { id: '1', status: 'pulled', finalPlacement: 1 }, true);
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
      id: `mut-score-late-${tableName}`,
      authUserId: 'stale-row-refetch-user',
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', final_placement: 1 },
      explicitDataKeys: ['id', 'final_placement'],
      timestamp: Date.now() + 1,
      retries: 0,
      status: 'pending',
      serverVersion: 8,
      nextRetryAt: Date.now() + 3_600_000,
    } as PendingMutation);
    afterBackoff();
    await manager.uploadPendingMutations();
    await vi.waitFor(async () =>
      expect((await pendingFor(tableName)).map(m => m.id)).toEqual([`mut-score-late-${tableName}`])
    );

    // The echo landed; the unsent score keeps the row dirty and its data is not overwritten.
    const row = await table.getReplicatedRow('1');
    expect(row?.isDirty).toBe(true);
    expect(row?.data).toMatchObject({ finalPlacement: 1 });
  });
});
