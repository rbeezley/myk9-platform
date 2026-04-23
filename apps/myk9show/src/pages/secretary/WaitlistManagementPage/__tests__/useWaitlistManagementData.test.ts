import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useWaitlistManagementData } from '../useWaitlistManagementData';
import { createTestQueryClient } from '@/test/utils/testUtils';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/services/database/queries/showQueries', () => ({
  getSecretaryShows: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

vi.mock('@/services/database/queries/waitlistQueries', () => ({
  getClassesWithWaitlistCounts: vi.fn().mockResolvedValue({ data: [], error: null }),
  getWaitlistByClass: vi.fn().mockResolvedValue({ data: [], error: null }),
  offerWaitlistSpot: vi.fn(),
  removeFromWaitlist: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useWaitlistManagementData — externalShowId sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selectedShowId defaults to empty string when no externalShowId provided', async () => {
    const { result } = renderHook(() => useWaitlistManagementData(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    expect(result.current.selectedShowId).toBe('');
  });

  it('selectedShowId is initialized from externalShowId', async () => {
    const { result } = renderHook(() => useWaitlistManagementData('show-abc'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    expect(result.current.selectedShowId).toBe('show-abc');
  });

  it('selectedShowId updates when externalShowId changes', async () => {
    let externalShowId = 'show-1';
    const { result, rerender } = renderHook(
      () => useWaitlistManagementData(externalShowId),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.selectedShowId).toBe('show-1'));

    act(() => {
      externalShowId = 'show-2';
    });
    rerender();

    await waitFor(() => expect(result.current.selectedShowId).toBe('show-2'));
  });

  it('selectedShowId clears when externalShowId becomes empty string', async () => {
    let externalShowId: string | undefined = 'show-1';
    const { result, rerender } = renderHook(
      () => useWaitlistManagementData(externalShowId),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.selectedShowId).toBe('show-1'));

    act(() => {
      externalShowId = '';
    });
    rerender();

    await waitFor(() => expect(result.current.selectedShowId).toBe(''));
  });

  it('local setSelectedShowId still overrides when user picks a different show', async () => {
    const { result } = renderHook(() => useWaitlistManagementData('show-abc'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.selectedShowId).toBe('show-abc'));

    act(() => {
      result.current.setSelectedShowId('show-xyz');
    });

    expect(result.current.selectedShowId).toBe('show-xyz');
  });
});
