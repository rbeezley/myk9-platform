/**
 * MYK9-1031: saving the paper check is ONLINE ONLY and never held back for later: offline it is
 * REFUSED at execution start (React Query's default networkMode 'online' would instead pause the
 * mutation and replay it on reconnect, which is a queued write); the Results tab also disables the
 * button. When the server says the scores
 * moved (MK015) the mutation rejects so the caller can reset its ticks, and the user sees the
 * friendly line.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const recordResultsVerified = vi.hoisted(() => vi.fn());
const clearResultsVerified = vi.hoisted(() => vi.fn());
vi.mock('../resultsVerifiedMutations', async importOriginal => ({
  ...(await importOriginal<typeof import('../resultsVerifiedMutations')>()),
  recordResultsVerified,
  clearResultsVerified,
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';
import { createAppQueryClient } from '@/lib/queryClient';
import { useResultsVerifiedMutations } from '../useResultsVerifiedMutations';

const triggerSync = vi.fn(async () => undefined);

const network = { online: true };
const client = createAppQueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <NetworkStatusContext.Provider
        value={{
          isOnline: network.online,
          quality: null,
          showOfflineMessage: false,
          retryConnection: vi.fn(),
        }}
      >
        <ReplicationSyncContext.Provider
          value={{ status: {} as never, triggerSync, syncTable: vi.fn() }}
        >
          {children}
        </ReplicationSyncContext.Provider>
      </NetworkStatusContext.Provider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  onlineManager.setOnline(true);
  recordResultsVerified.mockReset();
  clearResultsVerified.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  triggerSync.mockClear();
  network.online = true;
});

describe('paper check mutations (online only)', () => {
  it('saves the check through the server call when online', async () => {
    recordResultsVerified.mockResolvedValue(undefined);
    const { result } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    await act(() =>
      result.current.verifyAsync({ classId: 'c1', trialId: 't1', showId: 's1', canonical: 'TEXT' })
    );

    expect(recordResultsVerified).toHaveBeenCalledWith({
      classId: 'c1',
      canonical: 'TEXT',
      at: expect.any(String),
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('after a saved check or an undo, pulls that class again through the ordinary class sync', async () => {
    recordResultsVerified.mockResolvedValue(undefined);
    clearResultsVerified.mockResolvedValue(undefined);
    const { result } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    await act(() =>
      result.current.verifyAsync({ classId: 'c1', trialId: 't1', showId: 's1', canonical: 'TEXT' })
    );
    expect(triggerSync).toHaveBeenCalledWith([{ name: 'classes', scopeId: 't1' }]);

    triggerSync.mockClear();
    act(() => result.current.undo({ classId: 'c1', trialId: 't1' }));
    await waitFor(() =>
      expect(triggerSync).toHaveBeenCalledWith([{ name: 'classes', scopeId: 't1' }])
    );
  });

  it('on MK015 pulls the show entries again so a re-tick cannot resend the stale fingerprint', async () => {
    recordResultsVerified.mockRejectedValue({ code: 'MK015', message: 'changed' });
    const { result } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    await act(async () => {
      await result.current
        .verifyAsync({ classId: 'c1', trialId: 't1', showId: 's1', canonical: 'TEXT' })
        .catch(() => undefined);
    });

    expect(triggerSync).toHaveBeenCalledWith([{ name: 'entries', scopeId: 's1' }]);
  });

  it('any other failure pulls nothing', async () => {
    recordResultsVerified.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    await act(async () => {
      await result.current
        .verifyAsync({ classId: 'c1', trialId: 't1', showId: 's1', canonical: 'TEXT' })
        .catch(() => undefined);
    });

    expect(triggerSync).not.toHaveBeenCalled();
  });

  it('a refused check syncs no class: the class did not change', async () => {
    recordResultsVerified.mockRejectedValue({ code: 'MK015', message: 'changed' });
    const { result } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    await act(async () => {
      await result.current
        .verifyAsync({ classId: 'c1', trialId: 't1', showId: 's1', canonical: 'TEXT' })
        .catch(() => undefined);
    });

    expect(triggerSync).not.toHaveBeenCalledWith([{ name: 'classes', scopeId: 't1' }]);
  });

  it('refuses offline instead of pausing, and a reconnect later does not fire the RPC', async () => {
    network.online = false;
    const { result, rerender } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    await act(async () => {
      await expect(
        result.current.verifyAsync({
          classId: 'c1',
          trialId: 't1',
          showId: 's1',
          canonical: 'TEXT',
        })
      ).rejects.toThrow('Connect to save the check');
      result.current.undo({ classId: 'c1', trialId: 't1' });
    });
    expect(toast.error).toHaveBeenCalledWith('Connect to save the check');

    // Coming back online does not replay anything: nothing was queued or paused.
    network.online = true;
    onlineManager.setOnline(true);
    rerender();
    await new Promise(resolve => setTimeout(resolve, 80));

    expect(recordResultsVerified).not.toHaveBeenCalled();
    expect(clearResultsVerified).not.toHaveBeenCalled();
  });

  it('does not run a refused check again', async () => {
    recordResultsVerified.mockRejectedValue({ code: 'MK015', message: 'changed' });
    const { result } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    await act(async () => {
      await result.current
        .verifyAsync({ classId: 'c1', trialId: 't1', showId: 's1', canonical: 'TEXT' })
        .catch(() => undefined);
    });
    // Longer than the app client's default mutation retry delay would have waited.
    await new Promise(resolve => setTimeout(resolve, 1300));

    expect(recordResultsVerified).toHaveBeenCalledTimes(1);
  });

  it('rejects on MK015 and says the scores changed', async () => {
    const refusal = { code: 'MK015', message: 'results changed' };
    recordResultsVerified.mockRejectedValue(refusal);
    const { result } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    await act(async () => {
      await expect(
        result.current.verifyAsync({
          classId: 'c1',
          trialId: 't1',
          showId: 's1',
          canonical: 'TEXT',
        })
      ).rejects.toBe(refusal);
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The scores changed since you ticked them. Check them again.'
      )
    );
  });
});
