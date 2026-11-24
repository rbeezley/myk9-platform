import { act, renderHook } from '@/test/utils/testUtils';
import { supabase } from '@/lib/supabase';
import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import { readClubsByIdOrThrow, readJudgeAssignmentsOrNull } from '@/store/showStoreReads';
import { replicatedShowsTable, type ReplicatedShow } from '@/services/replication';
import { rowToShow } from '@/services/replication/showRowMapping';
import { useRealTimeUpdates } from './useRealTimeUpdates';

type ShowsPayload = { eventType: string; new?: Record<string, unknown>; old?: Partial<Show> };

const channel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};

vi.mock('@/lib/supabase', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}));
vi.mock('@/store/showStoreReads', async importOriginal => ({
  ...(await importOriginal<typeof import('@/store/showStoreReads')>()),
  readClubsByIdOrThrow: vi.fn(),
  readJudgeAssignmentsOrNull: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: null }),
}));
vi.mock('@/utils/show-management-tracking', () => ({
  syncShowRelationships: vi.fn(),
  RelationshipPerformanceMonitor: {
    getInstance: () => ({ recordOperation: vi.fn(), getMetrics: vi.fn(() => ({})) }),
  },
}));

const makeShow = (id: string, name: string) => ({ id, name }) as unknown as Show;
const makeRow = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  club_id: 'club-9',
  start_date: '2026-12-01',
  end_date: '2026-12-02',
  entry_open_date: '2026-11-01',
  ...extra,
});
const replicated = (row: Record<string, unknown>) =>
  rowToShow(row as Parameters<typeof rowToShow>[0]) as ReplicatedShow;

/** What the server returns for a show id when the hook re-reads it. */
let serverRows: Map<string, Record<string, unknown>>;
const pullShowById = () => vi.mocked(replicatedShowsTable.pullShowById);

/** Holds the next re-read until `release()`; the row is looked up when it is released. */
function deferredPull() {
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => (release = resolve));
  pullShowById().mockImplementationOnce(async id => {
    await gate;
    const row = serverRows.get(id);
    return row ? replicated(row) : null;
  });
  return () => release();
}

function showsHandler(): (payload: ShowsPayload) => void {
  const call = channel.on.mock.calls.find(([, filter]) => filter.table === 'shows');
  if (!call) throw new Error('shows postgres_changes handler was not registered');
  return call[2];
}

const ids = () => useShowStore.getState().shows.map(s => s.id);

describe('useRealTimeUpdates', () => {
  let loadShows: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.channel).mockReturnValue(channel as never);
    vi.mocked(readClubsByIdOrThrow).mockResolvedValue(new Map());
    vi.mocked(readJudgeAssignmentsOrNull).mockResolvedValue(null);
    serverRows = new Map([
      ['show-1', makeRow('show-1', 'Alpha')],
      ['show-2', makeRow('show-2', 'Bravo')],
    ]);
    vi.spyOn(replicatedShowsTable, 'pullShowById').mockImplementation(async id => {
      const row = serverRows.get(id);
      return row ? replicated(row) : null;
    });
    loadShows = vi.fn();
    useShowStore.setState({
      shows: [makeShow('show-1', 'Alpha'), makeShow('show-2', 'Bravo')],
      loadShows: loadShows as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the public show listener without subscribing Browse Shows to entries', () => {
    const { unmount } = renderHook(() => useRealTimeUpdates());

    expect(supabase.channel).toHaveBeenCalledTimes(1);
    expect(supabase.channel).toHaveBeenCalledWith('realtime-shows');
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'shows' }),
      expect.any(Function)
    );
    expect(channel.on).not.toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'entries' }),
      expect.any(Function)
    );

    unmount();
  });

  it('subscribes exactly once across store updates that change shows', async () => {
    const { rerender, unmount } = renderHook(() => useRealTimeUpdates());
    expect(channel.subscribe).toHaveBeenCalledTimes(1);

    serverRows.set('show-1', makeRow('show-1', 'Alpha renamed'));
    await act(async () => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha renamed') });
    });
    act(() => {
      useShowStore.setState({ shows: [makeShow('show-3', 'Charlie')] });
    });
    rerender();

    expect(ids()).toEqual(['show-3']);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(supabase.channel).toHaveBeenCalledTimes(1);
    expect(supabase.removeChannel).not.toHaveBeenCalled();

    unmount();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('re-reads only the changed show on UPDATE, without reloading the list', async () => {
    serverRows.set('show-2', makeRow('show-2', 'Bravo renamed'));
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-2', 'Bravo renamed') });
    });

    expect(pullShowById()).toHaveBeenCalledTimes(1);
    expect(pullShowById()).toHaveBeenCalledWith('show-2');
    expect(useShowStore.getState().shows.map(s => s.name)).toEqual(['Alpha', 'Bravo renamed']);
    expect(loadShows).not.toHaveBeenCalled();

    unmount();
  });

  it('takes the show from the re-read row, not the partial UPDATE payload', async () => {
    // A partial UPDATE leaves out unchanged TOASTed columns; the server row still has them.
    serverRows.set(
      'show-1',
      makeRow('show-1', 'Alpha 2', {
        confirmation_message: 'A long confirmation message',
        experience_published_content: { keep: 1 },
        logo_url: null,
      })
    );
    useShowStore.setState({
      shows: [
        {
          ...makeShow('show-1', 'Alpha'),
          clubName: 'Desert K9',
          confirmationMessage: 'A long confirmation message',
          logoUrl: 'https://example.test/old-logo.png',
        } as Show,
      ],
    });
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha 2') });
    });

    const updated = useShowStore.getState().shows[0] as unknown as Record<string, unknown>;
    expect(updated).toMatchObject({
      id: 'show-1',
      name: 'Alpha 2',
      clubId: 'club-9',
      startDate: '2026-12-01',
      entryOpenDate: '2026-11-01',
      clubName: 'Desert K9',
      confirmationMessage: 'A long confirmation message',
      experiencePublishedContent: { keep: 1 },
    });
    // A cleared logo stays cleared: the old value is not carried over.
    expect(updated.logoUrl).toBeFalsy();
    expect(updated).not.toHaveProperty('club_id');

    unmount();
  });

  it('re-hydrates club fields when an UPDATE moves the show to another club', async () => {
    vi.mocked(readClubsByIdOrThrow).mockResolvedValue(
      new Map([['club-7', { id: 'club-7', name: 'Mesa Scent Club' }]]) as never
    );
    serverRows.set('show-1', makeRow('show-1', 'Alpha', { club_id: 'club-7' }));
    useShowStore.setState({
      shows: [{ ...makeShow('show-1', 'Alpha'), clubId: 'club-9', clubName: 'Desert K9' } as Show],
    });
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({
        eventType: 'UPDATE',
        new: makeRow('show-1', 'Alpha', { club_id: 'club-7' }),
      });
    });

    expect(useShowStore.getState().shows[0]).toMatchObject({
      clubId: 'club-7',
      clubName: 'Mesa Scent Club',
    });

    unmount();
  });

  it('adds a show that arrives as an INSERT, with its club name', async () => {
    vi.mocked(readClubsByIdOrThrow).mockResolvedValue(
      new Map([['club-9', { id: 'club-9', name: 'Desert K9' }]]) as never
    );
    serverRows.set('show-3', makeRow('show-3', 'Charlie'));
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'INSERT', new: makeRow('show-3', 'Charlie') });
    });

    expect(ids()).toEqual(['show-1', 'show-2', 'show-3']);
    expect(useShowStore.getState().shows[2]).toMatchObject({
      name: 'Charlie',
      clubId: 'club-9',
      clubName: 'Desert K9',
    });

    unmount();
  });

  it('does not add an INSERTed show that is deleted while it is re-read', async () => {
    serverRows.set('show-3', makeRow('show-3', 'Charlie'));
    const release = deferredPull();
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'INSERT', new: makeRow('show-3', 'Charlie') });
      await vi.waitFor(() => expect(pullShowById()).toHaveBeenCalledTimes(1));
      showsHandler()({ eventType: 'DELETE', old: { id: 'show-3' } });
      release();
    });

    expect(ids()).toEqual(['show-1', 'show-2']);

    unmount();
  });

  it('updates rather than duplicates a show replication added during the re-read', async () => {
    serverRows.set('show-3', makeRow('show-3', 'Charlie'));
    const release = deferredPull();
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'INSERT', new: makeRow('show-3', 'Charlie') });
      useShowStore.getState().addShowLegacy(makeShow('show-3', 'From replication'));
      release();
    });

    const matches = useShowStore.getState().shows.filter(s => s.id === 'show-3');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe('Charlie');

    unmount();
  });

  it('collapses a burst of UPDATEs to one read of the newest row', async () => {
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha 2') });
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha 3') });
      serverRows.set('show-1', makeRow('show-1', 'Alpha 3'));
    });

    expect(pullShowById()).toHaveBeenCalledTimes(1);
    expect(useShowStore.getState().shows[0]?.name).toBe('Alpha 3');

    unmount();
  });

  it('re-reads after an in-flight read when a newer UPDATE arrives, and applies the newest', async () => {
    const release = deferredPull();
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha 2') });
      await vi.waitFor(() => expect(pullShowById()).toHaveBeenCalledTimes(1));
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha 3') });
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha 4') });
      serverRows.set('show-1', makeRow('show-1', 'Alpha 4'));
      release();
    });

    // The first read was in flight; the middle event is skipped; the last reads again.
    expect(pullShowById()).toHaveBeenCalledTimes(2);
    expect(useShowStore.getState().shows[0]?.name).toBe('Alpha 4');

    unmount();
  });

  it('applies an UPDATE that arrives while an INSERT for the same show is re-read', async () => {
    serverRows.set('show-3', makeRow('show-3', 'Charlie'));
    const release = deferredPull();
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'INSERT', new: makeRow('show-3', 'Charlie') });
      await vi.waitFor(() => expect(pullShowById()).toHaveBeenCalledTimes(1));
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-3', 'Charlie 2') });
      serverRows.set('show-3', makeRow('show-3', 'Charlie 2'));
      release();
    });

    const matches = useShowStore.getState().shows.filter(s => s.id === 'show-3');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe('Charlie 2');

    unmount();
  });

  it('does not add or read a show that arrives as an UPDATE when the store never had it', async () => {
    serverRows.set('show-3', makeRow('show-3', 'Charlie'));
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-3', 'Charlie') });
    });

    expect(ids()).toEqual(['show-1', 'show-2']);
    expect(pullShowById()).not.toHaveBeenCalled();

    unmount();
  });

  it('removes a show the re-read no longer returns', async () => {
    serverRows.delete('show-1');
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha') });
    });

    expect(ids()).toEqual(['show-2']);

    unmount();
  });

  it('keeps the show as it was when the re-read fails', async () => {
    pullShowById().mockRejectedValueOnce(new Error('offline'));
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha 2') });
    });

    expect(useShowStore.getState().shows.map(s => s.name)).toEqual(['Alpha', 'Bravo']);

    unmount();
  });

  it('removes a show whose UPDATE soft-deletes it, without a re-read', async () => {
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({
        eventType: 'UPDATE',
        new: makeRow('show-1', 'Alpha', { deleted_at: '2026-11-23T00:00:00Z' }),
      });
    });

    expect(ids()).toEqual(['show-2']);
    expect(pullShowById()).not.toHaveBeenCalled();

    unmount();
  });

  it('never adds a soft-deleted show that arrives as an INSERT', async () => {
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({
        eventType: 'INSERT',
        new: makeRow('show-3', 'Charlie', { deleted_at: '2026-11-23T00:00:00Z' }),
      });
    });

    expect(ids()).toEqual(['show-1', 'show-2']);

    unmount();
  });

  it('removes only the deleted show on DELETE without reloading the list', () => {
    const { unmount } = renderHook(() => useRealTimeUpdates());

    act(() => {
      showsHandler()({ eventType: 'DELETE', old: { id: 'show-1' } });
    });

    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['show-2']);
    expect(loadShows).not.toHaveBeenCalled();

    unmount();
  });

  it('ignores a DELETE payload that carries no id', () => {
    const { unmount } = renderHook(() => useRealTimeUpdates());

    act(() => {
      showsHandler()({ eventType: 'DELETE', old: {} });
    });

    expect(useShowStore.getState().shows).toHaveLength(2);
    expect(loadShows).not.toHaveBeenCalled();

    unmount();
  });
});
