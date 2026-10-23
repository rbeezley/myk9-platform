import { act, renderHook } from '@/test/utils/testUtils';
import { supabase } from '@/lib/supabase';
import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import { useRealTimeUpdates } from './useRealTimeUpdates';

type ShowsPayload = { eventType: string; new?: Partial<Show>; old?: Partial<Show> };

const channel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};

vi.mock('@/lib/supabase', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
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
      showsHandler()({ eventType: 'UPDATE', new: makeShow('show-1', 'Alpha renamed') });
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
      showsHandler()({ eventType: 'UPDATE', new: makeShow('show-2', 'Bravo renamed') });
    });

    expect(useShowStore.getState().shows.map(s => s.name)).toEqual(['Alpha', 'Bravo renamed']);
    expect(loadShows).not.toHaveBeenCalled();

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
