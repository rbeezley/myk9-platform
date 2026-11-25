/**
 * useUnsentWork is the one count of unsent work (MYK9-2011): read from this device's queue AND
 * dead letters, so a refused score keeps the count above zero, and refreshed on every event.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';
import { RINGSIDE_RPC_FUNCTION } from '@/services/replication/ringsideEntryRpc';
import { CONFLICT_SETTLED_EVENT } from '@/features/replication-conflicts/conflictEvents';
import { announceUnsentChanged, useUnsentWork, useUnsentWorkState } from './useUnsentWork';

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

  it('refreshes at once when a held conflict settles, without waiting for the poll', async () => {
    const db = await databaseManager.getDatabase('useUnsentWork.test');
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, scoreRow('p1', 'e1', 'pending'));
    const { result } = renderHook(() => useUnsentWork(10_000_000));
    await waitFor(() => expect(result.current.total).toBe(1));

    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(CONFLICT_SETTLED_EVENT));
    });
    await waitFor(() => expect(result.current.total).toBe(0));
  });
});

// MYK9-2013: "Every score is sent" waits for a real read; empty before it, or after a failure, is not the truth.
describe('useUnsentWorkState', () => {
  beforeEach(clearQueue);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is loading until the first read, then known', async () => {
    const { result } = renderHook(() => useUnsentWorkState());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('known'));
    expect(result.current.work.total).toBe(0);
  });

  it('reports a failed read as failed, never as known', async () => {
    vi.spyOn(databaseManager, 'getDatabase').mockRejectedValue(new Error('IndexedDB closed'));
    const { result } = renderHook(() => useUnsentWorkState());
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.work.total).toBe(0);
  });
});
