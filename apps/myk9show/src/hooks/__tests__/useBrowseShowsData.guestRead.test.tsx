import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import { useBrowseShowsData } from '../useBrowseShowsData';

// MYK9-780: Find Shows fell back to the device-wide shows replica whenever a
// signed-out guest's public read failed or paused offline, and counted its
// quick stats over that replica. The replica holds whatever an earlier
// signed-in session on this device could see: a secretary's drafts, and shows
// soft-deleted on the server after they were cached (sync reads
// deleted_at IS NULL only, and the store's Show has no deletedAt).

const auth = vi.hoisted(() => ({
  value: { user: null, userWithRoles: null, loading: false } as {
    user: { id: string; is_anonymous?: boolean } | null;
    userWithRoles: { id: string; roles: string[]; databaseUserId?: string } | null;
    loading: boolean;
  },
}));

const replica = vi.hoisted(() => ({ shows: [] as Show[], reads: 0 }));
const getPublicShows = vi.hoisted(() => vi.fn());
const sync = vi.hoisted(() => ({ shows: 'synced' }));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth.value }));

vi.mock('@/store/showStore', () => {
  const store = {
    get shows() {
      replica.reads += 1;
      return replica.shows;
    },
    isLoading: false,
    error: null,
  };
  return {
    useShowStore: (selector?: (s: typeof store) => unknown) => (selector ? selector(store) : store),
  };
});

vi.mock('@/store/trialStore', () => {
  const store = { trials: [] };
  return {
    useTrialStore: (selector?: (s: typeof store) => unknown) =>
      selector ? selector(store) : store,
  };
});

vi.mock('@/store/entryStore', () => {
  const store = { entries: [], isLoading: false, error: null, loadEntries: async () => {} };
  return { useEntryStore: () => store };
});

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({ status: { tablesStatus: { shows: sync.shows } } }),
}));

vi.mock('@/hooks/useEntriesPersonId', () => ({ useEntriesPersonId: () => null }));

vi.mock('@/hooks/queries/useAccountEnteredShowIds', () => ({
  useAccountEnteredShowIds: () => ({ all: [], active: [], isLoading: false, isError: false }),
}));

vi.mock('@/services/database/shows', () => ({ getPublicShows }));

function replicaShow(overrides: Partial<Show> & Pick<Show, 'id' | 'name' | 'status'>): Show {
  return {
    organization: 'AKC',
    // Upcoming and closing within the week, so a stats pass over the replica
    // counts every one of them.
    startDate: '2099-05-01',
    endDate: '2099-05-02',
    entryOpenDate: '2000-01-01',
    entryCloseDate: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    location: 'Tulsa, OK',
    events: ['Scent Work'],
    clubId: 'club-1',
    ...overrides,
  } as Show;
}

const DRAFT = replicaShow({ id: 'show-draft', name: 'Secret Draft Trial', status: 'draft' });
// Published locally, soft-deleted on the server after this device cached it.
const DELETED = replicaShow({ id: 'show-del', name: 'Cancelled Trial', status: 'published' });

const serverPublishedRow = {
  id: 'show-pub',
  name: 'Spring Scent Trial',
  organization: 'AKC',
  status: 'published',
  start_date: '2099-05-01',
  end_date: '2099-05-02',
  entry_open_date: '2000-01-01',
  entry_close_date: '2099-04-01',
  location: 'Tulsa, OK',
  club_id: 'club-1',
  trials: [],
};

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderBrowse() {
  return renderHook(() => useBrowseShowsData({ filteredShows: [], selectedTab: 'all' }), {
    wrapper,
  });
}

const ids = (shows: Show[]) => shows.map(s => s.id);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  auth.value = { user: null, userWithRoles: null, loading: false };
  replica.shows = [DRAFT, DELETED];
  replica.reads = 0;
  sync.shows = 'synced';
  getPublicShows.mockReset();
});

afterEach(() => {
  onlineManager.setOnline(true);
  queryClient.clear();
});

describe('useBrowseShowsData for a signed-out guest (MYK9-780)', () => {
  it('a failed public read is an error, never the replica, and stats count nothing', async () => {
    getPublicShows.mockResolvedValue({ data: [], error: new Error('network') });

    const { result } = renderBrowse();

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.showsOffline).toBe(false);
    expect(ids(result.current.shows)).toEqual([]);
    expect(result.current.quickStats).toEqual({ upcoming: 0, closingSoon: 0, userEntries: 0 });
    expect(replica.reads).toBe(0);
  });

  it('offline, reports offline instead of listing the replica', async () => {
    onlineManager.setOnline(false);
    getPublicShows.mockResolvedValue({ data: [serverPublishedRow], error: null });

    const { result } = renderBrowse();

    await waitFor(() => expect(result.current.showsOffline).toBe(true));
    expect(result.current.hasError).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(ids(result.current.shows)).toEqual([]);
    expect(result.current.quickStats).toEqual({ upcoming: 0, closingSoon: 0, userEntries: 0 });
    expect(replica.reads).toBe(0);
  });

  it('while the read is in flight, lists nothing and is loading', async () => {
    getPublicShows.mockReturnValue(new Promise(() => {}));

    const { result } = renderBrowse();

    await waitFor(() => expect(getPublicShows).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(true);
    expect(ids(result.current.shows)).toEqual([]);
    expect(replica.reads).toBe(0);
  });

  it("lists and counts only the server's shows", async () => {
    getPublicShows.mockResolvedValue({ data: [serverPublishedRow], error: null });

    const { result } = renderBrowse();

    await waitFor(() => expect(ids(result.current.shows)).toEqual(['show-pub']));
    expect(result.current.hasError).toBe(false);
    expect(result.current.quickStats.upcoming).toBe(1);
    expect(replica.reads).toBe(0);
  });

  it('Try again re-reads the server', async () => {
    getPublicShows.mockResolvedValueOnce({ data: [], error: new Error('network') });
    getPublicShows.mockResolvedValue({ data: [serverPublishedRow], error: null });

    const { result } = renderBrowse();
    await waitFor(() => expect(result.current.hasError).toBe(true));

    await act(async () => {
      await result.current.handleRetry();
    });

    await waitFor(() => expect(ids(result.current.shows)).toEqual(['show-pub']));
    expect(result.current.hasError).toBe(false);
  });
});

describe('useBrowseShowsData for a signed-in viewer (MYK9-780)', () => {
  it('keeps reading the replica, offline too, and never calls the public read', async () => {
    auth.value = {
      user: { id: 'user-1' },
      userWithRoles: { id: 'user-1', roles: ['secretary'], databaseUserId: 'person-1' },
      loading: false,
    };
    onlineManager.setOnline(false);

    const { result } = renderBrowse();

    await waitFor(() => expect(ids(result.current.shows)).toEqual(['show-draft', 'show-del']));
    expect(result.current.hasError).toBe(false);
    expect(result.current.showsOffline).toBeFalsy();
    expect(result.current.quickStats.upcoming).toBe(2);
    expect(replica.reads).toBeGreaterThan(0);
    expect(getPublicShows).not.toHaveBeenCalled();
  });

  // Codex P2 on the MYK9-779/780 branch: a signed-in session whose roles have
  // not loaded (or failed to) has a session user but no userWithRoles. It is
  // not a guest, so offline it keeps its replica list rather than an error.
  it('with roles still unresolved, is not a guest: reads the replica offline', async () => {
    auth.value = { user: { id: 'user-1' }, userWithRoles: null, loading: false };
    onlineManager.setOnline(false);

    const { result } = renderBrowse();

    await waitFor(() => expect(ids(result.current.shows)).toEqual(['show-draft', 'show-del']));
    expect(result.current.hasError).toBe(false);
    expect(result.current.showsOffline).toBeFalsy();
    expect(getPublicShows).not.toHaveBeenCalled();
  });
});

// Owner decision: a ringside passcode session (an anonymous auth user scoped
// to one show) is a guest on Find Shows. On a shared device the replica still
// holds a previous secretary's drafts and shows deleted since.
describe('useBrowseShowsData for a ringside passcode session', () => {
  beforeEach(() => {
    auth.value = {
      user: { id: 'anon-1', is_anonymous: true },
      userWithRoles: { id: 'anon-1', roles: [] },
      loading: false,
    };
  });

  it("lists only the server's shows and never reads the replica", async () => {
    getPublicShows.mockResolvedValue({ data: [serverPublishedRow], error: null });

    const { result } = renderBrowse();

    await waitFor(() => expect(ids(result.current.shows)).toEqual(['show-pub']));
    expect(getPublicShows).toHaveBeenCalledTimes(1);
    expect(result.current.quickStats.upcoming).toBe(1);
    expect(replica.reads).toBe(0);
  });

  it('offline, reports offline instead of listing the replica', async () => {
    onlineManager.setOnline(false);
    getPublicShows.mockResolvedValue({ data: [serverPublishedRow], error: null });

    const { result } = renderBrowse();

    await waitFor(() => expect(result.current.showsOffline).toBe(true));
    expect(ids(result.current.shows)).toEqual([]);
    expect(replica.reads).toBe(0);
  });

  // Replication never syncs for a passcode session, so an idle shows sync is
  // not "still downloading": an empty server list must settle, not spin.
  it('an empty server list settles even though the shows sync never ran', async () => {
    sync.shows = 'idle';
    getPublicShows.mockResolvedValue({ data: [], error: null });

    const { result } = renderBrowse();

    await waitFor(() => expect(getPublicShows).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasError).toBe(false);
    expect(ids(result.current.shows)).toEqual([]);
    expect(replica.reads).toBe(0);
  });
});
