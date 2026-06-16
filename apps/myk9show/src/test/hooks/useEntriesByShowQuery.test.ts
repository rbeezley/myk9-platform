import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';

/**
 * Security routing: public show + styled-landing pages render
 * useEntriesByShowQuery for logged-out visitors who no longer hold a broad
 * SELECT on `entries`. Anon must read through the cascade-gated public view;
 * authenticated callers keep the full replication-backed read.
 */
vi.mock('@/services/database/entries', () => ({
  getEntriesByShow: vi.fn(),
  getPublicEntriesByShow: vi.fn(),
}));

const mockUseAuthContext = vi.fn();
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

import { getEntriesByShow, getPublicEntriesByShow } from '@/services/database/entries';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';

const mockGetEntriesByShow = vi.mocked(getEntriesByShow);
const mockGetPublicEntriesByShow = vi.mocked(getPublicEntriesByShow);

const wrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useEntriesByShowQuery anon/auth routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntriesByShow.mockResolvedValue({ data: [{ id: 'authed' }], error: null } as never);
    mockGetPublicEntriesByShow.mockResolvedValue({ data: [{ id: 'public' }], error: null } as never);
  });

  it('routes anonymous visitors through the cascade-gated public view', async () => {
    mockUseAuthContext.mockReturnValue({ user: null, loading: false });

    const { result } = renderHook(() => useEntriesByShowQuery('show-1'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPublicEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(mockGetEntriesByShow).not.toHaveBeenCalled();
  });

  it('routes authenticated callers through the full table read', async () => {
    mockUseAuthContext.mockReturnValue({ user: { id: 'u1' }, loading: false });

    const { result } = renderHook(() => useEntriesByShowQuery('show-1'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(mockGetPublicEntriesByShow).not.toHaveBeenCalled();
  });

  it('waits for auth to resolve before fetching (no anon flash for a logging-in user)', () => {
    mockUseAuthContext.mockReturnValue({ user: null, loading: true });

    const { result } = renderHook(() => useEntriesByShowQuery('show-1'), { wrapper: wrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetPublicEntriesByShow).not.toHaveBeenCalled();
    expect(mockGetEntriesByShow).not.toHaveBeenCalled();
  });
});
