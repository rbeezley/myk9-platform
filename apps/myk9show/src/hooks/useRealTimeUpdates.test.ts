import { renderHook } from '@testing-library/react';
import { supabase } from '@/lib/supabase';
import { useRealTimeUpdates } from './useRealTimeUpdates';

const channel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};

vi.mock('@/lib/supabase', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}));
vi.mock('@/store/showStore', () => {
  const useShowStore = Object.assign(() => ({ shows: [], loadShows: vi.fn() }), {
    getState: () => ({ updateShowLegacy: vi.fn() }),
  });
  return { useShowStore };
});
vi.mock('@/store/entryStore', () => {
  const useEntryStore = Object.assign(() => ({ loadEntries: vi.fn() }), {
    getState: () => ({ updateRegistrationLegacy: vi.fn() }),
  });
  return { useEntryStore };
});
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: null }),
}));
vi.mock('@/utils/show-management-tracking', () => ({
  syncShowRelationships: vi.fn(),
  RelationshipPerformanceMonitor: {
    getInstance: () => ({ recordOperation: vi.fn(), getMetrics: vi.fn(() => ({})) }),
  },
}));

describe('useRealTimeUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.channel).mockReturnValue(channel as never);
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
});
