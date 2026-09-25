import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Club } from '@/types/club-types';
import { useBrowseClubsData } from '../useBrowseClubsData';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// The browse filter hooks read their state from the query string
// (MYK9-221, `useUrlFilters`), so they need a router in scope.
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const state = vi.hoisted(() => ({
  clubs: [] as Club[],
  clubReadiness: 'loading' as 'loading' | 'fresh' | 'offline' | 'unavailable',
  ensureClubsReady: vi.fn(),
  shows: [],
  guestVisibleClubIds: null as ReadonlySet<string> | null,
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: null }),
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
  authorizedAt: '2026-01-01T00:00:00Z',
};

describe('useBrowseClubsData readiness states', () => {
  beforeEach(() => {
    state.clubs = [];
    state.clubReadiness = 'loading';
    state.ensureClubsReady.mockReset();
    state.shows = [];
    state.guestVisibleClubIds = null;
  });

  // MYK9-747: the signed-out directory reads the device-wide replica, which a
  // guest sync never prunes. A club cached by an earlier signed-in session
  // must not reach a signed-out visitor unless clubs_select grants it to anon.
  it('omits a cached never-authorized club from a signed-out visitor', () => {
    const unauthorized: Club = { ...club, id: 'club-2', name: 'Unauthorized', authorizedAt: null };
    state.clubs = [club, unauthorized];

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper });

    expect(result.current.clubs.map(c => c.id)).toEqual(['club-1']);
    expect(result.current.filteredClubs.map(c => c.id)).toEqual(['club-1']);
  });

  it('omits a cached club the server no longer lists for a guest, despite a stale authorizedAt', () => {
    const revoked: Club = { ...club, id: 'club-revoked', name: 'Revoked' };
    state.clubs = [club, revoked];
    state.guestVisibleClubIds = new Set(['club-1']);

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper });

    expect(result.current.clubs.map(c => c.id)).toEqual(['club-1']);
  });

  it('shows initial loading only when the cache is empty', () => {
    const { result } = renderHook(() => useBrowseClubsData(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasError).toBe(false);
    expect(state.ensureClubsReady).toHaveBeenCalledWith();
  });

  it('renders cached clubs while a background refresh is still loading', () => {
    state.clubs = [club];

    const { result } = renderHook(() => useBrowseClubsData(), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.clubs).toEqual([club]);
  });

  it('distinguishes an empty successful directory from an unavailable directory', () => {
    state.clubReadiness = 'fresh';
    const emptyResult = renderHook(() => useBrowseClubsData(), { wrapper }).result;
    expect(emptyResult.current.isLoading).toBe(false);
    expect(emptyResult.current.hasError).toBe(false);

    state.clubReadiness = 'unavailable';
    const unavailableResult = renderHook(() => useBrowseClubsData(), { wrapper }).result;
    expect(unavailableResult.current.isLoading).toBe(false);
    expect(unavailableResult.current.hasError).toBe(true);
  });

  it('keeps cached clubs visible when refresh becomes unavailable or offline', () => {
    state.clubs = [club];
    state.clubReadiness = 'unavailable';
    const unavailable = renderHook(() => useBrowseClubsData(), { wrapper }).result;
    expect(unavailable.current.clubs).toEqual([club]);
    expect(unavailable.current.hasError).toBe(false);

    state.clubReadiness = 'offline';
    const offline = renderHook(() => useBrowseClubsData(), { wrapper }).result;
    expect(offline.current.clubs).toEqual([club]);
    expect(offline.current.hasError).toBe(false);
  });

  it('uses explicit retry to request a fresh club readiness check', async () => {
    const { result } = renderHook(() => useBrowseClubsData(), { wrapper });

    act(() => result.current.handleRetry());

    await waitFor(() => expect(state.ensureClubsReady).toHaveBeenCalledWith({ force: true }));
  });
});
