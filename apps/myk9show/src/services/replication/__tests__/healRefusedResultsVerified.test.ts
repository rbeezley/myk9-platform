/**
 * MYK9-1031: a permanently refused "scores match the paper" comes off the local class, so the
 * replica never keeps saying "checked" for a class the server refused to stamp.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { REPLICATION_STORES } from '@myk9/replication';
import { healRefusedResultsVerified } from '../healRefusedResultsVerified';
import { replicatedClassesTable } from '../ReplicatedClassesTable';

const AT = '2026-10-10T21:15:00.000Z';
const mark = (classId: string, at: string) => ({
  rpc: {
    name: 'mark_class_results_verified',
    args: { p_class_id: classId, p_results_fingerprint: 'f'.repeat(64), p_verified_at: at },
  },
});

beforeEach(async () => {
  const resettable = replicatedClassesTable as unknown as {
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
  await replicatedClassesTable.set(
    'class-1',
    {
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Container Novice A',
      resultsVerifiedAt: AT,
      resultsVerifiedBy: 'auth-1',
      resultsVerifiedFingerprint: 'f'.repeat(64),
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    } as never,
    true
  );
});

describe('healRefusedResultsVerified', () => {
  it('removes the check the refused call stamped', async () => {
    const healed = await healRefusedResultsVerified([mark('class-1', AT)]);

    expect(healed).toBe(1);
    expect(await replicatedClassesTable.getClassById('class-1')).toMatchObject({
      resultsVerifiedAt: null,
      resultsVerifiedBy: null,
      resultsVerifiedFingerprint: null,
    });
  });

  it('leaves a newer check made since alone', async () => {
    const healed = await healRefusedResultsVerified([mark('class-1', '2026-10-10T19:00:00.000Z')]);

    expect(healed).toBe(0);
    expect(await replicatedClassesTable.getClassById('class-1')).toMatchObject({
      resultsVerifiedAt: AT,
    });
  });

  it('ignores every other failed mutation', async () => {
    const healed = await healRefusedResultsVerified([
      { rpc: { name: 'clear_class_results_verified', args: { p_class_id: 'class-1' } } },
      { rpc: { name: 'ringside_update_entry', args: {} } },
      {},
    ]);

    expect(healed).toBe(0);
    expect(await replicatedClassesTable.getClassById('class-1')).toMatchObject({
      resultsVerifiedAt: AT,
    });
  });
});
