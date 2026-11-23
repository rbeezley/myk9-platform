import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import {
  cardEntriesLanding,
  useShowCardEntriesPaused,
} from '../useShowCardEntriesPaused';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const cardOnly = {
  id: 's1',
  status: 'published',
  acceptCheckPayments: false,
  acceptCashPayments: false,
};

describe('useShowCardEntriesPaused', () => {
  beforeEach(() => {
    rpc.mockReset();
  });
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('is loading until the server answers, then paused', async () => {
    rpc.mockResolvedValue({ data: ['s1'], error: null });
    const { result } = renderHook(() => useShowCardEntriesPaused(cardOnly), { wrapper });
    expect(result.current).toBe('loading');
    await waitFor(() => expect(result.current).toBe('paused'));
    expect(rpc).toHaveBeenCalledWith('shows_card_entries_paused', { p_show_ids: ['s1'] });
  });

  it('is open when the server does not list the show', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useShowCardEntriesPaused(cardOnly), { wrapper });
    await waitFor(() => expect(result.current).toBe('open'));
  });

  it('retries a temporary failure under the app retry policy, then answers', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: new Error('503') })
      .mockResolvedValueOnce({ data: [], error: null });
    // The app's query default is a bounded retry (services/database/queryClient.ts).
    const client = new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 0 } } });
    const local = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useShowCardEntriesPaused(cardOnly), { wrapper: local });
    expect(result.current).toBe('loading');
    await waitFor(() => expect(result.current).toBe('open'));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('is unknown, never open, when the request fails', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const { result } = renderHook(() => useShowCardEntriesPaused(cardOnly), { wrapper });
    await waitFor(() => expect(result.current).toBe('unknown'));
  });

  it('is unknown when a later refetch fails after an open answer', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const local = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useShowCardEntriesPaused(cardOnly), { wrapper: local });
    await waitFor(() => expect(result.current).toBe('open'));
    rpc.mockResolvedValueOnce({ data: null, error: new Error('flaky') });
    await client.refetchQueries({ queryKey: ['show-card-entries-paused', 's1'] });
    await waitFor(() => expect(result.current).toBe('unknown'));
  });

  it('never reads an answer cached from an earlier visit as open before this visit reads', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const local = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const first = renderHook(() => useShowCardEntriesPaused(cardOnly), { wrapper: local });
    await waitFor(() => expect(first.result.current).toBe('open'));
    first.unmount();

    rpc.mockResolvedValueOnce({ data: null, error: new Error('offline-ish') });
    const seen: string[] = [];
    const second = renderHook(
      () => {
        const state = useShowCardEntriesPaused(cardOnly);
        seen.push(state);
        return state;
      },
      { wrapper: local }
    );
    await waitFor(() => expect(second.result.current).toBe('unknown'));
    expect(seen).not.toContain('open');
  });

  it('is unknown while offline', () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useShowCardEntriesPaused(cardOnly), { wrapper });
    expect(result.current).toBe('unknown');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not ask for a draft show or when disabled', () => {
    const draft = renderHook(() => useShowCardEntriesPaused({ ...cardOnly, status: 'draft' }), {
      wrapper,
    });
    const off = renderHook(() => useShowCardEntriesPaused(cardOnly, false), { wrapper });
    expect(draft.result.current).toBe('open');
    expect(off.result.current).toBe('open');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('cardEntriesLanding', () => {
  const withCheck = { ...cardOnly, acceptCheckPayments: true };

  it('withholds Enter with neutral copy for a paused card-only show', () => {
    expect(cardEntriesLanding('paused', cardOnly)).toEqual({
      pendingReason: 'card_entries_paused',
      note: null,
    });
  });
  it('keeps Enter and adds one line for a paused show that takes check or cash', () => {
    expect(cardEntriesLanding('paused', withCheck)).toEqual({
      pendingReason: undefined,
      note: 'Card payments are paused. Pay by check.',
    });
  });
  it.each([
    [true, false, 'Card payments are paused. Pay by check.'],
    [false, true, 'Card payments are paused. Pay by cash.'],
    [true, true, 'Card payments are paused. Pay by check or cash.'],
    [undefined, undefined, 'Card payments are paused. Pay by check or cash.'],
  ])('names only the methods the show takes (check %s, cash %s)', (check, cash, line) => {
    const show = { ...cardOnly, acceptCheckPayments: check, acceptCashPayments: cash };
    expect(cardEntriesLanding('paused', show).note).toBe(line);
  });
  it('withholds Enter while loading or unknown, even with check or cash', () => {
    expect(cardEntriesLanding('loading', withCheck).pendingReason).toBe('card_entries_checking');
    expect(cardEntriesLanding('unknown', withCheck).pendingReason).toBe('online_setting_unknown');
  });
  it('changes nothing when open', () => {
    expect(cardEntriesLanding('open', cardOnly)).toEqual({ pendingReason: undefined, note: null });
  });
});
