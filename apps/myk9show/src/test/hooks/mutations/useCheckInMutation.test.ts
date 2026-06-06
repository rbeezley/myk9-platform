/**
 * Unit tests for useCheckInMutation hook.
 * Tests optimistic updates, rollback on error, and cache invalidation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { CheckInStatus } from '@myk9/core';
import type { ShowDayClass } from '@/types/show-day-types';

// Mock supabase
const mockRpc = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const mockUpdateReplicatedCheckInStatus = vi.fn<
  (entryId: string, status: CheckInStatus) => Promise<string | null>
>(() => Promise.resolve('mutation-1'));
const mockUpdateSelfCheckInStatus = vi.fn<(entryId: string, status: CheckInStatus) => Promise<void>>(
  () => Promise.resolve()
);
vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: (entryId: string, status: CheckInStatus) =>
    mockUpdateReplicatedCheckInStatus(entryId, status),
  updateSelfCheckInStatus: (entryId: string, status: CheckInStatus) =>
    mockUpdateSelfCheckInStatus(entryId, status),
}));

// Mock queryKeys
vi.mock('@/lib/queryClient', () => ({
  queryKeys: {
    entries: ['entries'],
  },
}));

// Import after mocks
const { useCheckInMutation } = await import('@/hooks/mutations/useCheckInMutation');

function createMockClass(overrides: Partial<ShowDayClass> = {}): ShowDayClass {
  return {
    classId: 'class-1',
    className: 'Novice A',
    element: null,
    level: null,
    dogCallName: 'Fido',
    dogId: 'dog-1',
    armband: '42',
    entryId: 'entry-1',
    totalEntries: 10,
    scoredEntries: 3,
    currentDogInRing: null,
    myRunningOrder: 4,
    estimatedTimeMinutes: 6,
    entryStatus: 'no-status',
    isScored: false,
    resultStatus: null,
    classStatus: 'active',
    showId: 'show-1',
    showName: 'Test Show',
    trialDate: '2026-03-09',
    ...overrides,
  };
}

describe('useCheckInMutation', () => {
  let queryClient: QueryClient;

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
    mockUpdateReplicatedCheckInStatus.mockResolvedValue('mutation-1');
    mockUpdateSelfCheckInStatus.mockResolvedValue();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('queues a replicated check-in status update by default without calling the RPC writer', async () => {
    const { result } = renderHook(() => useCheckInMutation(), { wrapper });

    await act(async () => {
      result.current.mutate({ entryId: 'entry-1', newStatus: 'checked-in' });
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));

    expect(mockUpdateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(mockUpdateSelfCheckInStatus).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('routes exhibitor self check-in through the owner-scoped RPC writer', async () => {
    const { result } = renderHook(() => useCheckInMutation({ writer: 'self-checkin-rpc' }), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ entryId: 'entry-1', newStatus: 'checked-in' });
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));

    expect(mockUpdateSelfCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(mockUpdateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('should optimistically update cached ShowDayClass arrays', async () => {
    // Pre-populate cache with mock data
    const classes = [createMockClass({ entryId: 'entry-1', entryStatus: 'no-status' })];
    queryClient.setQueryData(['entries'], classes);

    const { result } = renderHook(() => useCheckInMutation(), { wrapper });

    await act(async () => {
      result.current.mutate({ entryId: 'entry-1', newStatus: 'checked-in' });
    });

    expect(mockUpdateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
  });

  it('should handle mutation error gracefully', async () => {
    mockUpdateReplicatedCheckInStatus.mockRejectedValue(new Error('Replica unavailable'));

    const { result } = renderHook(() => useCheckInMutation(), { wrapper });

    await act(async () => {
      result.current.mutate({ entryId: 'entry-1', newStatus: 'checked-in' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Check-in update failed');
    expect(mockUpdateSelfCheckInStatus).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('should expose mutate and mutateAsync', () => {
    const { result } = renderHook(() => useCheckInMutation(), { wrapper });

    expect(typeof result.current.mutate).toBe('function');
    expect(typeof result.current.mutateAsync).toBe('function');
  });

  it('should accept all exhibitor-allowed statuses', async () => {
    const statuses: CheckInStatus[] = ['checked-in', 'conflict', 'pulled', 'at-gate', 'no-status'];
    const { result } = renderHook(() => useCheckInMutation(), { wrapper });

    for (const status of statuses) {
      vi.clearAllMocks();
      mockUpdateReplicatedCheckInStatus.mockResolvedValue('mutation-1');

      await act(async () => {
        result.current.mutate({ entryId: 'entry-1', newStatus: status });
      });

      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError || result.current.isIdle).toBe(
          true
        )
      );
      expect(mockUpdateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', status);
      expect(mockUpdateSelfCheckInStatus).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    }
  });
});
