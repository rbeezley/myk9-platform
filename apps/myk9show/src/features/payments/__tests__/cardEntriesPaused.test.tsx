import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import {
  CARD_ENTRIES_PAUSED_MESSAGE,
  takesCheckOrCash,
  useShowCardEntriesPaused,
} from '../cardEntriesPaused';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const noCheckOrCash = {
  id: 'show-1',
  status: 'published',
  acceptCheckPayments: false,
  acceptCashPayments: false,
};

describe('cardEntriesPaused', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('has the neutral owner-approved copy', () => {
    expect(CARD_ENTRIES_PAUSED_MESSAGE).toBe('Card entries are paused. Contact the secretary.');
  });

  it('takes check or cash unless both are explicitly off', () => {
    expect(takesCheckOrCash({})).toBe(true);
    expect(takesCheckOrCash({ acceptCheckPayments: false })).toBe(true);
    expect(takesCheckOrCash({ acceptCheckPayments: false, acceptCashPayments: false })).toBe(false);
  });

  it('asks the server for the show and reports paused when it says true', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => useShowCardEntriesPaused(noCheckOrCash), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
    expect(rpc).toHaveBeenCalledWith('show_card_entries_paused', { p_show_id: 'show-1' });
  });

  it('never asks when the show takes check or cash', () => {
    const { result } = renderHook(
      () => useShowCardEntriesPaused({ ...noCheckOrCash, acceptCheckPayments: true }),
      { wrapper }
    );
    expect(result.current).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never asks for a show that is not public', () => {
    const { result } = renderHook(
      () => useShowCardEntriesPaused({ ...noCheckOrCash, status: 'draft' }),
      { wrapper }
    );
    expect(result.current).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads a failed call as not paused', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    const { result } = renderHook(() => useShowCardEntriesPaused(noCheckOrCash), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
