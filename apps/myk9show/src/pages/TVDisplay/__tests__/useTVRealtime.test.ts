import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTVRealtime } from '../useTVRealtime';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@/services/database/supabaseClient');

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    Wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children),
    qc,
  };
}

describe('useTVRealtime', () => {
  let mockChannel: {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  let subscribeCallback: ((status: string) => void) | null;

  beforeEach(() => {
    subscribeCallback = null;
    mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        if (cb) subscribeCallback = cb;
        return mockChannel;
      }),
    };
    vi.mocked(supabase.channel).mockReturnValue(mockChannel as never);
    vi.mocked(supabase.removeChannel).mockResolvedValue('ok' as never);
  });

  it('creates a channel on mount', () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useTVRealtime('show-1'), { wrapper: Wrapper });
    expect(supabase.channel).toHaveBeenCalledWith('tv:show-1');
  });

  it('removes channel on unmount', () => {
    const { Wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useTVRealtime('show-1'), { wrapper: Wrapper });
    unmount();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });

  it('reports connected when subscribed', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVRealtime('show-1'), { wrapper: Wrapper });
    expect(result.current.isConnected).toBe(false);
    act(() => {
      subscribeCallback?.('SUBSCRIBED');
    });
    expect(result.current.isConnected).toBe(true);
  });

  it('does nothing when showId is empty', () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useTVRealtime(''), { wrapper: Wrapper });
    expect(supabase.channel).not.toHaveBeenCalled();
  });
});
