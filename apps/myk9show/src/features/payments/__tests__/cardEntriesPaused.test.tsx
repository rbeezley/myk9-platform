import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import {
  CARD_ENTRIES_PAUSED_MESSAGE,
  cardPausedCandidateIds,
  takesCheckOrCash,
  useShowCardEntriesPaused,
  useShowsCardEntriesPaused,
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

  it('asks only about public shows that take neither check nor cash, sorted and unique', () => {
    expect(
      cardPausedCandidateIds([
        { ...noCheckOrCash, id: 'b' },
        { ...noCheckOrCash, id: 'a' },
        { ...noCheckOrCash, id: 'a' },
        { ...noCheckOrCash, id: 'draft', status: 'draft' },
        { ...noCheckOrCash, id: 'check', acceptCheckPayments: true },
      ])
    ).toEqual(['a', 'b']);
  });

  it('asks ONE batched question for a whole list and reads the paused ids', async () => {
    rpc.mockResolvedValue({ data: ['b'], error: null });
    const shows = [
      { ...noCheckOrCash, id: 'b' },
      { ...noCheckOrCash, id: 'a' },
      { ...noCheckOrCash, id: 'c' },
    ];
    const { result } = renderHook(() => useShowsCardEntriesPaused(shows), { wrapper });
    await waitFor(() => expect(result.current.has('b')).toBe(true));
    expect(result.current.has('a')).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('shows_card_entries_paused', {
      p_show_ids: ['a', 'b', 'c'],
    });
  });

  it('asks the same function with one id for the detail page', async () => {
    rpc.mockResolvedValue({ data: ['show-1'], error: null });
    const { result } = renderHook(() => useShowCardEntriesPaused(noCheckOrCash), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
    expect(rpc).toHaveBeenCalledWith('shows_card_entries_paused', { p_show_ids: ['show-1'] });
  });

  it('never asks when every show takes check or cash or is not public', () => {
    const { result } = renderHook(
      () =>
        useShowsCardEntriesPaused([
          { ...noCheckOrCash, acceptCheckPayments: true },
          { ...noCheckOrCash, id: 'draft', status: 'draft' },
        ]),
      { wrapper }
    );
    expect(result.current.size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads a failed call as not paused', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    const { result } = renderHook(() => useShowCardEntriesPaused(noCheckOrCash), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
