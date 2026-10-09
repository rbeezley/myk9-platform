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

import { createAppQueryClient } from '@/lib/queryClient';
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
});
