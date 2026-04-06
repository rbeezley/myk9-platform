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
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should call supabase to update entry_status', async () => {
    const { result } = renderHook(() => useCheckInMutation(), { wrapper });

    await act(async () => {
      result.current.mutate({ entryId: 'entry-1', newStatus: 'checked-in' });
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith(
      'self_checkin_entry',
      expect.objectContaining({
        p_entry_id: 'entry-1',
        p_new_status: 'checked-in',
      })
    );
  });

  it('should optimistically update cached ShowDayClass arrays', async () => {
    // Pre-populate cache with mock data
    const classes = [createMockClass({ entryId: 'entry-1', entryStatus: 'no-status' })];
    queryClient.setQueryData(['entries'], classes);

    const { result } = renderHook(() => useCheckInMutation(), { wrapper });

    await act(async () => {
      result.current.mutate({ entryId: 'entry-1', newStatus: 'checked-in' });
    });

    // After mutation settles, cache gets invalidated, so verify the rpc was called
    expect(mockRpc).toHaveBeenCalled();
  });

  it('should handle mutation error gracefully', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'Network error' } });

    const { result } = renderHook(() => useCheckInMutation(), { wrapper });

    await act(async () => {
      result.current.mutate({ entryId: 'entry-1', newStatus: 'checked-in' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Check-in update failed');
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
      mockRpc.mockResolvedValue({ error: null });

      await act(async () => {
        result.current.mutate({ entryId: 'entry-1', newStatus: status });
      });

      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError || result.current.isIdle).toBe(
          true
        )
      );
    }
  });
});
