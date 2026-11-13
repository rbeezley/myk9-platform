/**
 * Staff check-in is an offline-first write: with the app client's default mutation networkMode
 * 'online' it would pause before the replicated write. The exhibitor self check-in RPC must
 * stay online (it cannot succeed without the network).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const checkIn = vi.hoisted(() => ({
  updateReplicatedCheckInStatus: vi.fn(async () => null),
  updateSelfCheckInStatus: vi.fn(async () => undefined),
}));

vi.mock('@/services/show-day/checkInStatus', () => checkIn);
// The hook reads the signed-in user to refresh the account-today cache (MYK9-1307); these tests
// are about the offline writer, so a fixed signed-in user is enough.
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'user-1' } }) }));

import { createAppQueryClient } from '@/lib/queryClient';
import { StaleStatusError } from '@/services/show-day/staleStatus';
import { useCheckInMutation } from './useCheckInMutation';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createAppQueryClient()}>{children}</QueryClientProvider>;
}

describe('useCheckInMutation while offline', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    Object.values(checkIn).forEach(fn => fn.mockClear());
  });

  it('runs the replicated staff write with no network', async () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useCheckInMutation(), { wrapper });

    act(() => result.current.mutate({ entryId: 'e1', newStatus: 'checked-in' }));

    await waitFor(() =>
      expect(checkIn.updateReplicatedCheckInStatus).toHaveBeenCalledWith('e1', 'checked-in')
    );
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('keeps the self check-in RPC paused until the network returns', async () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useCheckInMutation({ writer: 'self-checkin-rpc' }), {
      wrapper,
    });

    act(() => result.current.mutate({ entryId: 'e1', newStatus: 'checked-in' }));

    await waitFor(() => expect(result.current.isPaused).toBe(true));
    expect(checkIn.updateSelfCheckInStatus).not.toHaveBeenCalled();
  });

  // MYK9-1911: a refused stale Undo can only be refused again, so it is neither retried nor
  // replayed; any other failure keeps the app's one retry.
  it('does not retry a write the server refused as stale', async () => {
    checkIn.updateSelfCheckInStatus.mockRejectedValue(new StaleStatusError());
    const { result } = renderHook(() => useCheckInMutation({ writer: 'self-checkin-rpc' }), {
      wrapper,
    });

    await act(async () => {
      await result.current
        .mutateAsync({
          entryId: 'e1',
          newStatus: 'checked-in',
          expected: { status: 'pulled', pullSource: 'exhibitor' },
        })
        .catch(() => undefined);
    });

    expect(checkIn.updateSelfCheckInStatus).toHaveBeenCalledTimes(1);
    expect(checkIn.updateSelfCheckInStatus).toHaveBeenCalledWith('e1', 'checked-in', {
      status: 'pulled',
      pullSource: 'exhibitor',
    });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(StaleStatusError));
    checkIn.updateSelfCheckInStatus.mockResolvedValue(undefined);
  });
});
