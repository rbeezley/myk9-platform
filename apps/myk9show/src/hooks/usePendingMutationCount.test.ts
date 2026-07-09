/**
 * usePendingMutationCount must reflect the REAL queued-mutation count from the
 * MutationManager — never a fabricated value — and refresh on replication events.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePendingMutationCount } from './usePendingMutationCount';

const getPendingCount = vi.fn();

vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: {
    getPendingCount: () => getPendingCount(),
  },
}));

describe('usePendingMutationCount', () => {
  beforeEach(() => {
    getPendingCount.mockReset();
  });

  it('reports the real pending count on mount', async () => {
    getPendingCount.mockResolvedValue(4);
    const { result } = renderHook(() => usePendingMutationCount());
    await waitFor(() => expect(result.current).toBe(4));
  });

  it('refreshes when a replication event fires', async () => {
    getPendingCount.mockResolvedValue(0);
    const { result } = renderHook(() => usePendingMutationCount());
    await waitFor(() => expect(result.current).toBe(0));

    getPendingCount.mockResolvedValue(2);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('replication:upload-complete'));
    });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('keeps the last known value if a count read rejects', async () => {
    getPendingCount.mockResolvedValue(5);
    const { result } = renderHook(() => usePendingMutationCount());
    await waitFor(() => expect(result.current).toBe(5));

    getPendingCount.mockRejectedValue(new Error('idb down'));
    await act(async () => {
      window.dispatchEvent(new CustomEvent('replication:sync-failed'));
    });
    // Value stays at the last good read rather than resetting to 0.
    expect(result.current).toBe(5);
  });
});
