import { act, renderHook } from '@/test/utils/testUtils';
import { supabase } from '@/lib/supabase';
import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import { readClubsByIdOrThrow } from '@/store/showStoreReads';
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

function showsHandler(): (payload: ShowsPayload) => void {
  const call = channel.on.mock.calls.find(([, filter]) => filter.table === 'shows');
  if (!call) throw new Error('shows postgres_changes handler was not registered');
  return call[2];
}

describe('useRealTimeUpdates', () => {
  let loadShows: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.channel).mockReturnValue(channel as never);
    vi.mocked(readClubsByIdOrThrow).mockResolvedValue(new Map());
    loadShows = vi.fn();
    useShowStore.setState({
      shows: [makeShow('show-1', 'Alpha'), makeShow('show-2', 'Bravo')],
      loadShows: loadShows as never,
    });
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

  it('subscribes exactly once across store updates that change shows', () => {
    const { rerender, unmount } = renderHook(() => useRealTimeUpdates());
    expect(channel.subscribe).toHaveBeenCalledTimes(1);

    act(() => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha renamed') });
    });
    act(() => {
      useShowStore.setState({ shows: [makeShow('show-3', 'Charlie')] });
    });
    rerender();

    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['show-3']);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(supabase.channel).toHaveBeenCalledTimes(1);
    expect(supabase.removeChannel).not.toHaveBeenCalled();

    unmount();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('updates only the changed show on UPDATE', () => {
    const { unmount } = renderHook(() => useRealTimeUpdates());

    act(() => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-2', 'Bravo renamed') });
    });

    expect(useShowStore.getState().shows.map(s => s.name)).toEqual(['Alpha', 'Bravo renamed']);
    expect(loadShows).not.toHaveBeenCalled();

    unmount();
  });

  it('maps a snake_case UPDATE row to camelCase Show fields and keeps club fields', () => {
    useShowStore.setState({
      shows: [{ ...makeShow('show-1', 'Alpha'), clubName: 'Desert K9' } as Show],
    });
    const { unmount } = renderHook(() => useRealTimeUpdates());

    act(() => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-1', 'Alpha renamed') });
    });

    const updated = useShowStore.getState().shows[0] as unknown as Record<string, unknown>;
    expect(updated).toMatchObject({
      id: 'show-1',
      name: 'Alpha renamed',
      clubId: 'club-9',
      startDate: '2026-12-01',
      entryOpenDate: '2026-11-01',
      clubName: 'Desert K9',
    });
    expect(updated).not.toHaveProperty('club_id');
    expect(updated).not.toHaveProperty('start_date');

    unmount();
  });

  it('adds a show that arrives as an INSERT', async () => {
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'INSERT', new: makeRow('show-3', 'Charlie') });
    });

    const shows = useShowStore.getState().shows;
    expect(shows.map(s => s.id)).toEqual(['show-1', 'show-2', 'show-3']);
    expect(shows[2]).toMatchObject({ name: 'Charlie', clubId: 'club-9' });

    unmount();
  });

  it('gives an INSERTed show its club name from the replicated clubs', async () => {
    vi.mocked(readClubsByIdOrThrow).mockResolvedValue(
      new Map([['club-9', { id: 'club-9', name: 'Desert K9' }]]) as never
    );
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'INSERT', new: makeRow('show-3', 'Charlie') });
    });

    expect(useShowStore.getState().shows[2]).toMatchObject({ clubName: 'Desert K9' });

    unmount();
  });

  it('does not add a show that arrives as an UPDATE when the store never had it', async () => {
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({ eventType: 'UPDATE', new: makeRow('show-3', 'Charlie') });
    });

    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['show-1', 'show-2']);

    unmount();
  });

  it('removes a show whose UPDATE soft-deletes it', async () => {
    const { unmount } = renderHook(() => useRealTimeUpdates());

    await act(async () => {
      showsHandler()({
        eventType: 'UPDATE',
        new: makeRow('show-1', 'Alpha', { deleted_at: '2026-11-23T00:00:00Z' }),
      });
    });

    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['show-2']);

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

    expect(useShowStore.getState().shows.map(s => s.id)).toEqual(['show-1', 'show-2']);

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
