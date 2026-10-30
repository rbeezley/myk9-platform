/**
 * MYK9-1031: the paper check on the class replica is READ-ONLY. It is saved by calling the RPCs
 * directly while online and arrives here only by the ordinary class sync, so a class edit must
 * never echo it back and the mapper must carry it (and nothing else) from the server row.
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

describe('ReplicatedClassesTable paper check (MYK9-1031)', () => {
  let table: ReplicatedClassesTable;
  const manager = {
    rowRefetchers: { register: vi.fn() },
    discardReverters: { register: vi.fn() },
    prepareMutation: vi.fn(
      async (tableName: string, operation: string, rowId: string, data: unknown) => ({
        id: 'm1',
        authUserId: 'auth-1',
        tableName,
        operation,
        rowId,
        data,
        timestamp: 0,
        retries: 0,
        status: 'pending',
      })
    ),
    announceQueued: vi.fn(async () => undefined),
    requestUpload: vi.fn(),
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
    manager.prepareMutation.mockClear();
    manager.acquireMutationWriteLock.mockClear();
    table.setMutationManager(fromAny<MutationManager, unknown>(manager));
    await table.set('class-1', baseClass());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never writes the check on an unrelated class edit', async () => {
    await table.set('class-1', baseClass({ resultsVerifiedAt: AT, resultsVerifiedBy: 'auth-1' }));

    await table.updateClass('class-1', { name: 'Container Novice B' });

    const payload = manager.prepareMutation.mock.calls.at(-1) as unknown as unknown[];
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
