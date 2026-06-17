import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';

/**
 * Security routing (Lane 3.7): the public class page renders
 * useEntriesByClassQuery for logged-out visitors who no longer hold a broad
 * SELECT on `entries`. Anon must read through the cascade-gated public view;
 * authenticated callers keep the full replication-backed read. Mirror of
 * useEntriesByShowQuery.
 */
vi.mock('@/services/database/entries', () => ({
  getEntriesByClass: vi.fn(),
  getPublicEntriesByClass: vi.fn(),
}));

const mockUseAuthContext = vi.fn();
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

import { getEntriesByClass, getPublicEntriesByClass } from '@/services/database/entries';
import { useEntriesByClassQuery } from '@/hooks/queries/useEntriesDatabase';

const mockGetEntriesByClass = vi.mocked(getEntriesByClass);
const mockGetPublicEntriesByClass = vi.mocked(getPublicEntriesByClass);

const wrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useEntriesByClassQuery anon/auth routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntriesByClass.mockResolvedValue({ data: [{ id: 'authed' }], error: null } as never);
    mockGetPublicEntriesByClass.mockResolvedValue({ data: [{ id: 'public' }], error: null } as never);
  });

  it('routes anonymous visitors through the cascade-gated public view', async () => {
    mockUseAuthContext.mockReturnValue({ user: null, loading: false });

    const { result } = renderHook(() => useEntriesByClassQuery('class-1'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPublicEntriesByClass).toHaveBeenCalledWith('class-1');
    expect(mockGetEntriesByClass).not.toHaveBeenCalled();
  });

  it('routes authenticated callers through the full table read', async () => {
    mockUseAuthContext.mockReturnValue({ user: { id: 'u1' }, loading: false });

    const { result } = renderHook(() => useEntriesByClassQuery('class-1'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetEntriesByClass).toHaveBeenCalledWith('class-1');
    expect(mockGetPublicEntriesByClass).not.toHaveBeenCalled();
  });

  it('waits for auth to resolve before fetching (no anon flash for a logging-in user)', () => {
    mockUseAuthContext.mockReturnValue({ user: null, loading: true });

    const { result } = renderHook(() => useEntriesByClassQuery('class-1'), { wrapper: wrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetPublicEntriesByClass).not.toHaveBeenCalled();
    expect(mockGetEntriesByClass).not.toHaveBeenCalled();
  });
});
