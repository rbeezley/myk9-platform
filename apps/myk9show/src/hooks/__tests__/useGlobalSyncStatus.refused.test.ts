import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({
    status: { isSyncing: false, error: null, tablesStatus: {}, lastSyncAt: null },
  }),
}));

// A refused score: nothing left in the queue, one dead letter in the failed store.
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: {
    getPendingCount: vi.fn(async () => 0),
    getPendingMutationsForTable: vi.fn(async () => []),
    getFailedMutations: vi.fn(async () => [
      {
        id: 'm1',
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'e1',
        timestamp: 1,
        status: 'failed',
        failureKind: 'permanent',
        error: 'Non-retryable error: This class is cancelled.',
        rpc: { name: 'ringside_update_entry', fields: { is_scored: true } },
      },
    ]),
  },
}));

describe('useGlobalSyncStatus (MYK9-2011)', () => {
  it('never reads as synced while a score is refused, and counts it', async () => {
    const { result } = renderHook(() => useGlobalSyncStatus());
    await waitFor(() => expect(result.current.unsentScoreCount).toBe(1));
    expect(result.current.failedCount).toBe(1);
    expect(result.current.status).toBe('error');
  });
});
