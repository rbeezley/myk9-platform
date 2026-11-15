/**
 * useUnsentWork is the one count of unsent work (MYK9-2011): read from this device's queue AND
 * dead letters, so a refused score keeps the count above zero, and refreshed on every event.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';
import { RINGSIDE_RPC_FUNCTION } from '@/services/replication/ringsideEntryRpc';
import { announceUnsentChanged, useUnsentWork } from './useUnsentWork';

// The replication database stays open across tests; empty its queue stores so no row leaks.
async function clearQueue() {
  const db = await databaseManager.getDatabase('useUnsentWork.test');
  await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
  await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
}

const scoreRow = (id: string, rowId: string, status: 'pending' | 'failed'): PendingMutation => ({
  id,
  tableName: 'entries',
  operation: 'UPDATE',
  rowId,
  data: {},
  timestamp: 1,
  retries: 0,
  status,
  rpc: { name: RINGSIDE_RPC_FUNCTION, fields: { is_scored: true } },
});

describe('useUnsentWork', () => {
  beforeEach(clearQueue);
  it('counts a refused score and refreshes when the list changes', async () => {
    const db = await databaseManager.getDatabase('useUnsentWork.test');
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, scoreRow('f1', 'e1', 'failed'));

    const { result } = renderHook(() => useUnsentWork());
    await waitFor(() => expect(result.current.total).toBe(1));
    expect(result.current.refusedCount).toBe(1);

    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, scoreRow('p1', 'e2', 'pending'));
    await act(async () => {
      announceUnsentChanged();
    });
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.scores.map(s => s.entryId)).toEqual(['e1', 'e2']);
  });
});
