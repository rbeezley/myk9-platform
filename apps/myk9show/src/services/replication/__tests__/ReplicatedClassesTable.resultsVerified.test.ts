/**
 * MYK9-1031: the paper check the server accepted, mirrored onto the local class row.
 *
 * It must behave like a download, not like a local edit: nothing queued, the row not dirty, and
 * no mutation write lock taken (a lock is only released by a queued write, so an unpaired one
 * would hold the cache-clear path for good).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import type { MutationManager } from '@myk9/replication';
import { REPLICATION_STORES } from '@myk9/replication';
import type { Database } from '@/types/supabase';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import {
  ReplicatedClassesTable,
  rowToClass,
  type ReplicatedClass,
} from '../ReplicatedClassesTable';

const AT = '2026-10-10T21:15:00.000Z';

function baseClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Container Novice A',
    classStatus: 'completed',
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
    ...overrides,
  };
}

describe('ReplicatedClassesTable.applyResultsVerified (MYK9-1031)', () => {
  let table: ReplicatedClassesTable;
  const manager = {
    rowRefetchers: { register: vi.fn() },
    queueMutation: vi.fn(async () => 'm1'),
    acquireMutationWriteLock: vi.fn(async () => () => undefined),
  };

  beforeEach(async () => {
    table = new ReplicatedClassesTable();
    const resettable = table as unknown as {
      runTransaction: (
        storeName: string,
        mode: IDBTransactionMode,
        callback: (store: { clear?: () => Promise<void> }) => Promise<void>
      ) => Promise<void>;
    };
    for (const storeName of [
      REPLICATION_STORES.REPLICATED_TABLES,
      REPLICATION_STORES.SYNC_METADATA,
    ]) {
      await resettable.runTransaction(storeName, 'readwrite', async store => {
        await store.clear?.();
      });
    }
    manager.queueMutation.mockClear();
    manager.acquireMutationWriteLock.mockClear();
    table.setMutationManager(fromAny<MutationManager, unknown>(manager));
    await table.set('class-1', baseClass());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stamps the local row clean: nothing queued, no write lock, not dirty', async () => {
    await table.applyResultsVerified('class-1', { at: AT, by: 'auth-1' }, 9);

    expect(await table.getClassById('class-1')).toMatchObject({
      resultsVerifiedAt: AT,
      resultsVerifiedBy: 'auth-1',
    });
    expect(manager.queueMutation).not.toHaveBeenCalled();
    expect(manager.acquireMutationWriteLock).not.toHaveBeenCalled();
    const stored = await table.getReplicatedRow('class-1');
    expect(stored?.isDirty).toBe(false);
    expect(stored?.serverVersion).toBe(9);
  });

  it('ignores a late answer older than the cached row: no overwrite, no version downgrade', async () => {
    // A download at version 5 already cleared the check; the mark's answer (version 4) arrives late.
    await table.set('class-1', baseClass({ resultsVerifiedAt: null }), false, undefined, 5);

    await table.applyResultsVerified('class-1', { at: AT, by: 'auth-1' }, 4);

    expect(await table.getClassById('class-1')).toMatchObject({ resultsVerifiedAt: null });
    expect((await table.getReplicatedRow('class-1'))?.serverVersion).toBe(5);
    // The same answer at a version at least as new does apply.
    await table.applyResultsVerified('class-1', { at: AT, by: 'auth-1' }, 6);
    expect(await table.getClassById('class-1')).toMatchObject({ resultsVerifiedAt: AT });
    expect((await table.getReplicatedRow('class-1'))?.serverVersion).toBe(6);
  });

  it('without a version in the answer, a row that has a known version is left alone', async () => {
    await table.set('class-1', baseClass(), false, undefined, 5);

    await table.applyResultsVerified('class-1', { at: AT, by: 'auth-1' });

    expect((await table.getClassById('class-1'))?.resultsVerifiedAt ?? null).toBeNull();
  });

  it('loses to a download that lands between its read and its write', async () => {
    await table.set('class-1', baseClass(), false, undefined, 5);
    const original = table.getReplicatedRow.bind(table);
    vi.spyOn(table, 'getReplicatedRow').mockImplementationOnce(async id => {
      const snapshot = await original(id);
      // The download arrives right after the snapshot was taken.
      await table.set('class-1', baseClass({ resultsVerifiedAt: null }), false, undefined, 6);
      return snapshot;
    });

    await table.applyResultsVerified('class-1', { at: AT, by: 'auth-1' }, 5);

    expect(await table.getClassById('class-1')).toMatchObject({ resultsVerifiedAt: null });
    expect((await table.getReplicatedRow('class-1'))?.serverVersion).toBe(6);
  });

  it('clears a local check for a correction as a clean write, keeping the server version', async () => {
    await table.set(
      'class-1',
      baseClass({ resultsVerifiedAt: AT, resultsVerifiedBy: 'a' }),
      false,
      undefined,
      5
    );

    await expect(table.clearResultsVerifiedLocally('class-1')).resolves.toBe(true);

    expect(await table.getClassById('class-1')).toMatchObject({
      resultsVerifiedAt: null,
      resultsVerifiedBy: null,
    });
    const stored = await table.getReplicatedRow('class-1');
    expect(stored?.isDirty).toBe(false);
    expect(stored?.serverVersion).toBe(5);
    expect(manager.queueMutation).not.toHaveBeenCalled();
    expect(manager.acquireMutationWriteLock).not.toHaveBeenCalled();
  });

  it('says so when there was no check to clear', async () => {
    await expect(table.clearResultsVerifiedLocally('class-1')).resolves.toBe(false);
  });

  it('clears the local row the same way', async () => {
    await table.applyResultsVerified('class-1', { at: AT, by: 'auth-1' });
    await table.applyResultsVerified('class-1', null);

    expect(await table.getClassById('class-1')).toMatchObject({
      resultsVerifiedAt: null,
      resultsVerifiedBy: null,
    });
    expect(manager.queueMutation).not.toHaveBeenCalled();
    expect(manager.acquireMutationWriteLock).not.toHaveBeenCalled();
  });

  it('never writes the check on an unrelated class edit', async () => {
    await table.applyResultsVerified('class-1', { at: AT, by: 'auth-1' });

    await table.updateClass('class-1', { name: 'Container Novice B' });

    const payload = manager.queueMutation.mock.calls.at(-1) as unknown as unknown[];
    expect(payload[3]).not.toHaveProperty('results_verified_at');
    expect(payload[3]).not.toHaveProperty('results_verified_by');
    expect(await table.getClassById('class-1')).toMatchObject({ resultsVerifiedAt: AT });
  });

  it('reads the check off the class row', () => {
    const row = {
      id: 'class-1',
      trial_id: 'trial-1',
      name: 'Container Novice A',
      results_verified_at: AT,
      results_verified_by: 'auth-secretary',
    } as Database['public']['Tables']['classes']['Row'];

    expect(rowToClass(row)).toMatchObject({
      resultsVerifiedAt: AT,
      resultsVerifiedBy: 'auth-secretary',
    });
  });
});
