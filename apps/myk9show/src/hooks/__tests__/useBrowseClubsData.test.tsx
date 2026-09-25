import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { Club } from '@/types/club-types';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useBrowseClubsData } from '../useBrowseClubsData';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// The browse filter hooks read their state from the query string
// (MYK9-221, `useUrlFilters`), so they need a router in scope; the signed-out
// directory is a React Query read (MYK9-747), so it needs a QueryClient.
function makeWrapper() {
  const client = createTestQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const state = vi.hoisted(() => ({
  clubs: [] as Club[],
  clubReadiness: 'loading' as 'loading' | 'fresh' | 'offline' | 'unavailable',
  ensureClubsReady: vi.fn(),
  shows: [],
  // Counts every read of the replica's club list, so a test can prove a
  // signed-out viewer never consults it.
  replicaReads: 0,
}));

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'user-1', is_anonymous: false },
    userWithRoles: { roles: ['secretary'] },
    loading: false,
  } as {
    user: { id: string; is_anonymous?: boolean } | null;
    userWithRoles: { roles: string[] } | null;
    loading: boolean;
  },
}));

const getPublicDirectoryClubs = vi.hoisted(() => vi.fn());

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (value: Record<string, unknown>) => unknown) =>
    selector({
      clubReadiness: state.clubReadiness,
      ensureClubsReady: state.ensureClubsReady,
      get clubs() {
        state.replicaReads += 1;
        return state.clubs;
      },
    }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => auth.value,
}));

vi.mock('@/services/database/clubs', () => ({
  getPublicDirectoryClubs,
}));

const club: Club = {
  id: 'club-1',
  name: 'Heartland Club',
  clubNumber: '',
  email: '',
  phone: '',
  website: undefined,
  description: '',
  address: { street: '', city: 'Tulsa', state: 'OK', zipCode: '', country: 'US' },
  logo: '',
  coverImage: '',
  accentColor: '',
  upcomingShows: [],
  pastShows: [],
};

function signIn() {
  auth.value = {
    user: { id: 'user-1', is_anonymous: false },
    userWithRoles: { roles: ['secretary'] },
    loading: false,
  };
}

function signOut() {
  auth.value = { user: null, userWithRoles: null, loading: false };
}

beforeEach(() => {
  state.clubs = [];
  state.clubReadiness = 'loading';
  state.ensureClubsReady.mockReset();
  state.shows = [];
  state.replicaReads = 0;
  getPublicDirectoryClubs.mockReset();
  signIn();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('useBrowseClubsData signed-in readiness states', () => {
  it('shows initial loading only when the cache is empty', () => {
    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasError).toBe(false);
    expect(state.ensureClubsReady).toHaveBeenCalledWith();
  });

  it('renders cached clubs while a background refresh is still loading', () => {
    state.clubs = [club];

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.clubs).toEqual([club]);
    expect(getPublicDirectoryClubs).not.toHaveBeenCalled();
  });

  it('distinguishes an empty successful directory from an unavailable directory', () => {
    state.clubReadiness = 'fresh';
    const emptyResult = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() }).result;
    expect(emptyResult.current.isLoading).toBe(false);
    expect(emptyResult.current.hasError).toBe(false);

    state.clubReadiness = 'unavailable';
    const unavailableResult = renderHook(() => useBrowseClubsData(), {
      wrapper: makeWrapper(),
    }).result;
    expect(unavailableResult.current.isLoading).toBe(false);
    expect(unavailableResult.current.hasError).toBe(true);
  });

  it('keeps cached clubs visible when refresh becomes unavailable or offline', () => {
    state.clubs = [club];
    state.clubReadiness = 'unavailable';
    const unavailable = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() }).result;
    expect(unavailable.current.clubs).toEqual([club]);
    expect(unavailable.current.hasError).toBe(false);

    state.clubReadiness = 'offline';
    const offline = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() }).result;
    expect(offline.current.clubs).toEqual([club]);
    expect(offline.current.hasError).toBe(false);
    expect(offline.current.isOffline).toBe(false);
  });

  it('uses explicit retry to request a fresh club readiness check', async () => {
    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });

    act(() => result.current.handleRetry());

    await waitFor(() => expect(state.ensureClubsReady).toHaveBeenCalledWith({ force: true }));
  });

  it('shows nothing from either source while auth is still resolving', () => {
    state.clubs = [club];
    auth.value = { user: null, userWithRoles: null, loading: true };

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.clubs).toEqual([]);
    expect(getPublicDirectoryClubs).not.toHaveBeenCalled();
    expect(state.ensureClubsReady).not.toHaveBeenCalled();
  });
});

// MYK9-747: the clubs replica is shared across sign-in states on one device,
// so the signed-out directory is online-only and never reads it.
describe('useBrowseClubsData signed-out viewer (MYK9-747)', () => {
  beforeEach(signOut);

  it('renders the server rows and never consults the replica, even when it caches a revoked club', async () => {
    const revoked: Club = { ...club, id: 'club-revoked', name: 'Revoked Club', authorizedAt: null };
    state.clubs = [club, revoked];
    state.clubReadiness = 'fresh';
    const serverClub: Club = { ...club, id: 'club-server', name: 'Server Club' };
    getPublicDirectoryClubs.mockResolvedValue([serverClub]);

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.clubs.map(c => c.id)).toEqual(['club-server']);
    expect(result.current.filteredClubs.map(c => c.id)).toEqual(['club-server']);
    expect(state.replicaReads).toBe(0);
    expect(state.ensureClubsReady).not.toHaveBeenCalled();
  });

  it('treats an anonymous (ringside passcode) session as a guest', async () => {
    auth.value = {
      user: { id: 'anon-1', is_anonymous: true },
      userWithRoles: null,
      loading: false,
    };
    state.clubs = [club];
    getPublicDirectoryClubs.mockResolvedValue([]);

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getPublicDirectoryClubs).toHaveBeenCalledTimes(1);
    expect(state.replicaReads).toBe(0);
    expect(result.current.clubs).toEqual([]);
  });

  it('still hides developer seed clubs from the server rows', async () => {
    getPublicDirectoryClubs.mockResolvedValue([club, { ...club, id: 'e2e', name: 'E2E Club 12' }]);

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.clubs.map(c => c.id)).toEqual(['club-1']);
  });

  it('reports loading, not an empty directory, while the server read is pending', () => {
    getPublicDirectoryClubs.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasError).toBe(false);
    expect(result.current.isOffline).toBe(false);
  });

  it('reports an error, not an empty directory, when the server read fails', async () => {
    getPublicDirectoryClubs.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isOffline).toBe(false);
  });

  it('reports offline, not an empty directory, with no connection', () => {
    onlineManager.setOnline(false);
    state.clubs = [club];
    getPublicDirectoryClubs.mockResolvedValue([club]);

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });

    expect(result.current.isOffline).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.clubs).toEqual([]);
    expect(getPublicDirectoryClubs).not.toHaveBeenCalled();
    expect(state.replicaReads).toBe(0);
  });

  it('retries the server read, not the replica sync', async () => {
    getPublicDirectoryClubs.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([club]);

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.hasError).toBe(true));

    act(() => result.current.handleRetry());

    await waitFor(() => expect(result.current.clubs.map(c => c.id)).toEqual(['club-1']));
    expect(state.ensureClubsReady).not.toHaveBeenCalled();
  });
});
