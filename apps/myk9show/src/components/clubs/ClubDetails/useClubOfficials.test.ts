/**
 * MYK9-860 — who the officials query runs for, and that a failure stays a failure.
 * The RPC returns zero rows to unauthorized signed-in viewers, so nothing here needs
 * swallowing; guests are skipped because anon cannot execute it at all.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/database/club-memberships', () => ({
  getClubOfficials: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

import { getClubOfficials } from '@/services/database/club-memberships';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClubOfficials } from './useClubOfficials';

const mockedGetClubOfficials = vi.mocked(getClubOfficials);
const mockedUseAuthContext = vi.mocked(useAuthContext);

function signedInAs(user: { id: string; is_anonymous?: boolean } | null) {
  mockedUseAuthContext.mockReturnValue({ user } as unknown as ReturnType<typeof useAuthContext>);
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return wrapper;
}

describe('useClubOfficials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAs({ id: 'auth-1' });
  });

  it('returns the officials for a signed-in viewer', async () => {
    mockedGetClubOfficials.mockResolvedValue({
      adminNames: ['Jane Doe', 'John Smith'],
      secretaryNames: ['Pat Lee'],
    });

    const { result } = renderHook(() => useClubOfficials('club-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      adminNames: ['Jane Doe', 'John Smith'],
      secretaryNames: ['Pat Lee'],
    });
    expect(mockedGetClubOfficials).toHaveBeenCalledWith('club-1');
  });

  it('surfaces a failed read as an error, not as an empty list', async () => {
    mockedGetClubOfficials.mockRejectedValue(new Error('function does not exist'));

    const { result } = renderHook(() => useClubOfficials('club-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('does not query for a signed-out guest', () => {
    signedInAs(null);

    renderHook(() => useClubOfficials('club-1'), { wrapper: createWrapper() });

    expect(mockedGetClubOfficials).not.toHaveBeenCalled();
  });

  it('does not query for an anonymous ringside session', () => {
    signedInAs({ id: 'anon-1', is_anonymous: true });

    renderHook(() => useClubOfficials('club-1'), { wrapper: createWrapper() });

    expect(mockedGetClubOfficials).not.toHaveBeenCalled();
  });

  it('does not query when no clubId is given', () => {
    renderHook(() => useClubOfficials(undefined), { wrapper: createWrapper() });

    expect(mockedGetClubOfficials).not.toHaveBeenCalled();
  });
});
