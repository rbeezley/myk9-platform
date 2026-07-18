import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Club } from '@/types/club-types';
import { useBrowseClubsData } from '../useBrowseClubsData';

const state = vi.hoisted(() => ({
  clubs: [] as Club[],
  clubReadiness: 'loading' as 'loading' | 'fresh' | 'offline' | 'unavailable',
  ensureClubsReady: vi.fn(),
  shows: [],
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
};

describe('useBrowseClubsData readiness states', () => {
  beforeEach(() => {
    state.clubs = [];
    state.clubReadiness = 'loading';
    state.ensureClubsReady.mockReset();
    state.shows = [];
  });

  it('shows initial loading only when the cache is empty', () => {
    const { result } = renderHook(() => useBrowseClubsData());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasError).toBe(false);
    expect(state.ensureClubsReady).toHaveBeenCalledWith();
  });

  it('renders cached clubs while a background refresh is still loading', () => {
    state.clubs = [club];

    const { result } = renderHook(() => useBrowseClubsData());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.clubs).toEqual([club]);
  });

  it('distinguishes an empty successful directory from an unavailable directory', () => {
    state.clubReadiness = 'fresh';
    const emptyResult = renderHook(() => useBrowseClubsData()).result;
    expect(emptyResult.current.isLoading).toBe(false);
    expect(emptyResult.current.hasError).toBe(false);

    state.clubReadiness = 'unavailable';
    const unavailableResult = renderHook(() => useBrowseClubsData()).result;
    expect(unavailableResult.current.isLoading).toBe(false);
    expect(unavailableResult.current.hasError).toBe(true);
  });

  it('keeps cached clubs visible when refresh becomes unavailable or offline', () => {
    state.clubs = [club];
    state.clubReadiness = 'unavailable';
    const unavailable = renderHook(() => useBrowseClubsData()).result;
    expect(unavailable.current.clubs).toEqual([club]);
    expect(unavailable.current.hasError).toBe(false);

    state.clubReadiness = 'offline';
    const offline = renderHook(() => useBrowseClubsData()).result;
    expect(offline.current.clubs).toEqual([club]);
    expect(offline.current.hasError).toBe(false);
  });

  it('uses explicit retry to request a fresh club readiness check', async () => {
    const { result } = renderHook(() => useBrowseClubsData());

    act(() => result.current.handleRetry());

    await waitFor(() => expect(state.ensureClubsReady).toHaveBeenCalledWith({ force: true }));
  });
});
