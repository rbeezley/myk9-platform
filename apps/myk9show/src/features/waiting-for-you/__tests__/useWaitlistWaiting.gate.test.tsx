import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWaitlistWaiting } from '../useWaitlistWaiting';

const mocks = vi.hoisted(() => ({
  readShowWaitlist: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/services/database/waitlists/waitingRead', () => ({
  readShowWaitlist: mocks.readShowWaitlist,
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/services/database/waitlists/replicaDependencies', () => ({
  WAITLIST_READ_TABLES: [],
}));

function mount(manages: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useWaitlistWaiting('show-1', manages), { wrapper });
}

describe('useWaitlistWaiting gate', () => {
  beforeEach(() => {
    mocks.readShowWaitlist.mockReset().mockResolvedValue({ classes: [], waitlist: [] });
    mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('makes no waitlist read and no judge-day RPC for a viewer who cannot manage the show', async () => {
    const { result } = mount(false);
    // Give any query a turn to start before asserting it never did.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.readShowWaitlist).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('reads both for a viewer who manages the show', async () => {
    mount(true);
    await waitFor(() => expect(mocks.readShowWaitlist).toHaveBeenCalledWith('show-1'));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('get_show_judge_day_capacity_for_manager', {
        p_show_id: 'show-1',
      })
    );
  });
});
