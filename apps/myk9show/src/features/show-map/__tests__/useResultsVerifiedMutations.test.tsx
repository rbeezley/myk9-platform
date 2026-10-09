/**
 * MYK9-1031: saving the paper check is ONLINE ONLY. With the app's query client (default
 * networkMode 'online') an offline mutation pauses before its function runs, so no RPC fires and
 * nothing is queued; the Results tab also disables the button. When the server says the scores
 * moved (MK015) the mutation rejects so the caller can reset its ticks, and the user sees the
 * friendly line.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const recordResultsVerified = vi.hoisted(() => vi.fn());
const clearResultsVerified = vi.hoisted(() => vi.fn());
vi.mock('../resultsVerifiedMutations', () => ({ recordResultsVerified, clearResultsVerified }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'auth-secretary' } }) }));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { createAppQueryClient } from '@/lib/queryClient';
import { useResultsVerifiedMutations } from '../useResultsVerifiedMutations';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createAppQueryClient()}>{children}</QueryClientProvider>;
}

afterEach(() => {
  onlineManager.setOnline(true);
  recordResultsVerified.mockReset();
  clearResultsVerified.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
});

describe('paper check mutations (online only)', () => {
  it('saves the check through the server call when online', async () => {
    recordResultsVerified.mockResolvedValue(undefined);
    const { result } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    await act(() => result.current.verifyAsync({ classId: 'c1', canonical: 'TEXT' }));

    expect(recordResultsVerified).toHaveBeenCalledWith({
      classId: 'c1',
      canonical: 'TEXT',
      at: expect.any(String),
      recordedBy: 'auth-secretary',
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('does not run, and queues nothing, while offline', async () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    act(() => {
      void result.current.verifyAsync({ classId: 'c1', canonical: 'TEXT' });
      result.current.undo({ classId: 'c1' });
    });
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(recordResultsVerified).not.toHaveBeenCalled();
    expect(clearResultsVerified).not.toHaveBeenCalled();
  });

  it('does not run a refused check again', async () => {
    recordResultsVerified.mockRejectedValue({ code: 'MK015', message: 'changed' });
    const { result } = renderHook(() => useResultsVerifiedMutations(), { wrapper });

    await act(async () => {
      await result.current.verifyAsync({ classId: 'c1', canonical: 'TEXT' }).catch(() => undefined);
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
      await expect(result.current.verifyAsync({ classId: 'c1', canonical: 'TEXT' })).rejects.toBe(
        refusal
      );
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The scores changed since you ticked them. Check them again.'
      )
    );
  });
});
