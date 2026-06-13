import { act, renderHook, waitFor } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntryManagementData } from '../useEntryManagementData';

const mocks = vi.hoisted(() => ({
  getSecretaryShows: vi.fn(),
  getShowById: vi.fn(),
  getEntriesForShow: vi.fn(),
  useAuthContext: vi.fn(),
  triggerSync: vi.fn(),
  syncTable: vi.fn(),
  syncStatus: {
    isSyncing: false,
    lastSyncAt: null as Date | null,
    error: null as string | null,
    tablesStatus: { entries: 'success' as 'idle' | 'syncing' | 'success' | 'error' },
  },
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

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({
    status: mocks.syncStatus,
    triggerSync: mocks.triggerSync,
    syncTable: mocks.syncTable,
  }),
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
  localStorage.removeItem('myk9show:entryMgmt:lastShowId');
  mocks.useAuthContext.mockReturnValue({ user: { id: 'sec-1' }, hasRole: vi.fn() });
  mocks.getSecretaryShows.mockResolvedValue({ data: [makeShow()], error: null });
  mocks.getEntriesForShow.mockResolvedValue({ data: [], error: null });
  mocks.triggerSync.mockResolvedValue(undefined);
  mocks.syncTable.mockResolvedValue(undefined);
  mocks.syncStatus = {
    isSyncing: false,
    lastSyncAt: null,
    error: null,
    tablesStatus: { entries: 'success' },
  };
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

  it('requests replication sync when the selected show loads from an empty idle entries replica', async () => {
    mocks.syncStatus = {
      isSyncing: false,
      lastSyncAt: null,
      error: null,
      tablesStatus: { entries: 'idle' },
    };

    const { result } = renderHook(() => useEntryManagementData());
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));

    act(() => result.current.setSelectedShowId('show-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(mocks.triggerSync).toHaveBeenCalledTimes(1));
  });

  it('reloads entries after replication sync completes', async () => {
    mocks.getEntriesForShow.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
      data: [
        {
          id: 'entry-after-sync',
          show_id: 'show-1',
          dog: null,
          class: null,
          registration: null,
        },
      ],
      error: null,
    });
    mocks.syncStatus = {
      isSyncing: false,
      lastSyncAt: null,
      error: null,
      tablesStatus: { entries: 'syncing' },
    };

    const { result, rerender } = renderHook(() => useEntryManagementData());
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));

    act(() => result.current.setSelectedShowId('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mocks.syncStatus = {
      isSyncing: false,
      lastSyncAt: new Date('2026-06-13T03:00:00.000Z'),
      error: null,
      tablesStatus: { entries: 'success' },
    };
    rerender();

    await waitFor(() => expect(result.current.entries[0]?.id).toBe('entry-after-sync'));
    expect(mocks.getEntriesForShow).toHaveBeenCalledTimes(2);
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
    mocks.getShowById.mockImplementation(() => new Promise(res => (resolveFetch = res)));

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

  it('resolves owner/handler names from joins when the legacy handler text is empty', async () => {
    // Webhook-created entries (online Stripe payments) set handler_id but never
    // the legacy `handler` text column — the secretary list must fall back to
    // the joined person records instead of showing "Unknown"/"Not specified".
    mocks.getEntriesForShow.mockResolvedValue({
      data: [
        {
          id: 'e1',
          show_id: 'show-1',
          handler: null,
          handler_person: { id: 'p1', first_name: 'Richard', last_name: 'Beezley' },
          dog: {
            id: 'd1',
            name: 'Alpha 1',
            call_name: 'Alpha',
            breed: 'Mixed Breed',
            owner: { id: 'p1', first_name: 'Richard', last_name: 'Beezley', email: 'r@x.com' },
          },
          class: null,
          registration: null,
        },
        {
          // Mail-in path: legacy handler text only — must still win as fallback.
          id: 'e2',
          show_id: 'show-1',
          handler: 'Jane Mailin',
          handler_person: null,
          dog: null,
          class: null,
          registration: null,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useEntryManagementData());
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    act(() => result.current.setSelectedShowId('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries[0]?.ownerName).toBe('Richard Beezley');
    expect(result.current.entries[0]?.handlerName).toBe('Richard Beezley');
    expect(result.current.entries[1]?.ownerName).toBe('Jane Mailin');
    expect(result.current.entries[1]?.handlerName).toBe('Jane Mailin');
  });

  it('partial refund keeps the net amount as paid, not $0 (Codex P2)', async () => {
    // stripe-refund-entry marks partial refunds payment_status='refunded';
    // paidAmount must be fee - refund (e.g. $50 - $20 = $30), not zero.
    mocks.getEntriesForShow.mockResolvedValue({
      data: [
        {
          id: 'e1',
          show_id: 'show-1',
          payment_status: 'refunded',
          entry_fee: 50,
          refund_amount: 20,
          dog: null,
          class: null,
          registration: null,
        },
        {
          id: 'e2',
          show_id: 'show-1',
          payment_status: 'refunded',
          entry_fee: 30,
          refund_amount: 30,
          dog: null,
          class: null,
          registration: null,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useEntryManagementData());
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    act(() => result.current.setSelectedShowId('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries[0]?.paidAmount).toBe(30);
    expect(result.current.entries[1]?.paidAmount).toBe(0);
  });

  it('preserves registration id when offline metadata enrichment is unavailable', async () => {
    mocks.getEntriesForShow.mockResolvedValue({
      data: [
        {
          id: 'e1',
          show_id: 'show-1',
          registration_id: 'reg-offline-1',
          dog: null,
          class: null,
          registration: null,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useEntryManagementData());
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    act(() => result.current.setSelectedShowId('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries[0]?.registrationId).toBe('reg-offline-1');
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
