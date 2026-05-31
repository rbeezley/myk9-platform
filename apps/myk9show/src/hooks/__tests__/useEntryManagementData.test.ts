import { act, renderHook, waitFor } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntryManagementData } from '../useEntryManagementData';

const mocks = vi.hoisted(() => ({
  getSecretaryShows: vi.fn(),
  getShowById: vi.fn(),
  getEntriesForShow: vi.fn(),
  useAuthContext: vi.fn(),
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

vi.mock('@/services/database/shows', () => ({
  getSecretaryShows: mocks.getSecretaryShows,
  getShowById: mocks.getShowById,
}));

vi.mock('@/services/database/entries', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/entries')>();
  return { ...actual, getEntriesForShow: mocks.getEntriesForShow };
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: mocks.useAuthContext,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mocks.supabase,
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function makeShow(id = 'show-1') {
  return { id, name: `Show ${id}`, start_date: '2026-06-01', end_date: '2026-06-02' };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuthContext.mockReturnValue({ user: { id: 'sec-1' }, hasRole: vi.fn() });
  mocks.getSecretaryShows.mockResolvedValue({ data: [makeShow()], error: null });
  mocks.getEntriesForShow.mockResolvedValue({ data: [], error: null });
  // Default: getShowById returns the show — ensures initialShowId tests are stable
  // regardless of which async path (shows.some vs fetch) wins the race.
  mocks.getShowById.mockResolvedValue({ data: makeShow(), error: null });
});

describe('useEntryManagementData', () => {
  it('loads shows on mount', async () => {
    const { result } = renderHook(() => useEntryManagementData());
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    expect(mocks.getSecretaryShows).toHaveBeenCalledTimes(1);
    expect(result.current.shows).toHaveLength(1);
  });

  it('loads entries when selectedShowId is set', async () => {
    const { result } = renderHook(() => useEntryManagementData());
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));

    act(() => result.current.setSelectedShowId('show-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.getEntriesForShow).toHaveBeenCalledWith('show-1');
  });

  it('applies initialShowId from URL param once shows are loaded', async () => {
    const { result } = renderHook(() => useEntryManagementData('show-1'));
    await waitFor(() => expect(result.current.selectedShowId).toBe('show-1'));
    expect(mocks.getEntriesForShow).toHaveBeenCalledWith('show-1');
  });

  it('deep-links to a show not yet in the list by fetching it from the server', async () => {
    mocks.getSecretaryShows.mockResolvedValue({ data: [], error: null });
    mocks.getShowById.mockResolvedValue({ data: makeShow('show-deeplink'), error: null });

    const { result } = renderHook(() => useEntryManagementData('show-deeplink'));
    await waitFor(() => expect(result.current.selectedShowId).toBe('show-deeplink'));
    expect(mocks.getShowById).toHaveBeenCalledWith('show-deeplink');
    expect(result.current.shows.some(s => s.id === 'show-deeplink')).toBe(true);
  });

  it('cancels the deep-link fetch when unmounted before it resolves', async () => {
    mocks.getSecretaryShows.mockResolvedValue({ data: [], error: null });

    let resolveFetch!: (v: unknown) => void;
    mocks.getShowById.mockImplementation(
      () => new Promise(res => (resolveFetch = res))
    );

    const { result, unmount } = renderHook(() => useEntryManagementData('show-deeplink'));
    // Give the effect time to fire and start the fetch
    await waitFor(() => expect(mocks.getShowById).toHaveBeenCalled());

    // Unmount before the fetch resolves
    unmount();

    // Resolve the fetch after unmount
    resolveFetch({ data: makeShow('show-deeplink'), error: null });

    // selectedShowId should never have been set (cancelled = true path)
    expect(result.current.selectedShowId).toBe('');
  });

  it('clears entries when selectedShowId is reset to empty', async () => {
    mocks.getEntriesForShow.mockResolvedValue({
      data: [{ id: 'e1', show_id: 'show-1', class: null, dog: null, registration: null }],
      error: null,
    });
    const { result } = renderHook(() => useEntryManagementData());
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));

    act(() => result.current.setSelectedShowId('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setSelectedShowId(''));
    expect(result.current.entries).toEqual([]);
  });
});
