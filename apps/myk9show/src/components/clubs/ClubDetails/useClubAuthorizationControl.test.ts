import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/database/clubs', () => ({
  setClubAuthorization: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

const mockEnsureClubsReady = vi.fn();
vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (state: { ensureClubsReady: typeof mockEnsureClubsReady }) => unknown) =>
    selector({ ensureClubsReady: mockEnsureClubsReady }),
}));

import { setClubAuthorization } from '@/services/database/clubs';
import { notifications } from '@/lib/notifications';
import { useClubAuthorizationControl } from './useClubAuthorizationControl';
import type { Club } from '@/types/club-types';

const mockedSetClubAuthorization = vi.mocked(setClubAuthorization);
const mockedNotifications = vi.mocked(notifications);

function makeClub(authorizedAt: string | null | undefined): Club {
  return {
    id: 'club-1',
    name: 'Test Club',
    clubNumber: '',
    email: '',
    phone: '',
    website: undefined,
    description: '',
    address: { street: '', city: '', state: '', zipCode: '', country: 'US' },
    logo: '',
    coverImage: '',
    accentColor: '',
    upcomingShows: [],
    pastShows: [],
    authorizedAt,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, invalidateQueries };
}

describe('useClubAuthorizationControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureClubsReady.mockResolvedValue({ status: 'fresh', clubs: [] });
  });

  // P2-3: derivation table — undefined (never synced), null (explicitly
  // unauthorized), and a timestamp (authorized) must all read distinctly.
  describe('isClubAuthorized derivation', () => {
    it('is undefined when club.authorizedAt has never synced (field absent)', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useClubAuthorizationControl(makeClub(undefined), true), {
        wrapper,
      });
      expect(result.current.isClubAuthorized).toBeUndefined();
    });

    it('is undefined when there is no club at all', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useClubAuthorizationControl(null, true), { wrapper });
      expect(result.current.isClubAuthorized).toBeUndefined();
    });

    it('is false when authorizedAt is explicitly null (revoked/never authorized)', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useClubAuthorizationControl(makeClub(null), true), {
        wrapper,
      });
      expect(result.current.isClubAuthorized).toBe(false);
    });

    it('is true when authorizedAt is a timestamp', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useClubAuthorizationControl(makeClub('2026-01-01T00:00:00Z'), true),
        { wrapper }
      );
      expect(result.current.isClubAuthorized).toBe(true);
    });
  });

  it('gates canAuthorizeClub on the isSiteAdmin argument, independent of club state', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useClubAuthorizationControl(makeClub(null), false), {
      wrapper,
    });
    expect(result.current.canAuthorizeClub).toBe(false);
  });

  it('handleAuthorizeClub calls the RPC, forces a club resync, invalidates the authorization query, and toasts success', async () => {
    mockedSetClubAuthorization.mockResolvedValue(undefined);
    const { wrapper, invalidateQueries } = createWrapper();
    const { result } = renderHook(() => useClubAuthorizationControl(makeClub(null), true), {
      wrapper,
    });

    await act(async () => {
      result.current.handleAuthorizeClub();
    });

    await waitFor(() => {
      expect(mockedSetClubAuthorization).toHaveBeenCalledWith('club-1', true);
    });
    expect(mockEnsureClubsReady).toHaveBeenCalledWith({ requestedClubId: 'club-1', force: true });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['club-authorization', 'club-1'] });
    expect(mockedNotifications.success).toHaveBeenCalledWith('Club authorized.');
  });

  it('handleRevokeAuthorization calls the RPC with false and toasts the revoke message', async () => {
    mockedSetClubAuthorization.mockResolvedValue(undefined);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useClubAuthorizationControl(makeClub('2026-01-01T00:00:00Z'), true),
      { wrapper }
    );

    await act(async () => {
      result.current.handleRevokeAuthorization();
    });

    await waitFor(() => {
      expect(mockedSetClubAuthorization).toHaveBeenCalledWith('club-1', false);
    });
    expect(mockedNotifications.success).toHaveBeenCalledWith('Club authorization revoked.');
  });

  it('toasts an error and does not throw when the RPC fails', async () => {
    mockedSetClubAuthorization.mockRejectedValue(new Error('nope'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useClubAuthorizationControl(makeClub(null), true), {
      wrapper,
    });

    await act(async () => {
      result.current.handleAuthorizeClub();
    });

    await waitFor(() => {
      expect(mockedNotifications.error).toHaveBeenCalledWith('nope');
    });
    expect(result.current.isAuthorizationUpdating).toBe(false);
  });

  it('is a no-op when there is no clubId', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useClubAuthorizationControl(null, true), { wrapper });

    await act(async () => {
      result.current.handleAuthorizeClub();
    });

    expect(mockedSetClubAuthorization).not.toHaveBeenCalled();
  });
});
