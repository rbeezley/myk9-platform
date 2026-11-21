import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import {
  cardEntriesLanding,
  CARD_PAYMENTS_PAUSED_PAY_OTHER_MESSAGE,
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

  it('is unknown, never open, when the request fails', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const { result } = renderHook(() => useShowCardEntriesPaused(cardOnly), { wrapper });
    await waitFor(() => expect(result.current).toBe('unknown'));
  });

  it('keeps the last answer when a later refetch fails', async () => {
    rpc.mockResolvedValueOnce({ data: ['s1'], error: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const local = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useShowCardEntriesPaused(cardOnly), { wrapper: local });
    await waitFor(() => expect(result.current).toBe('paused'));
    rpc.mockResolvedValueOnce({ data: null, error: new Error('flaky') });
    await client.refetchQueries({ queryKey: ['show-card-entries-paused', 's1'] });
    expect(result.current).toBe('paused');
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
      note: CARD_PAYMENTS_PAUSED_PAY_OTHER_MESSAGE,
    });
  });
  it('withholds Enter while loading or unknown, even with check or cash', () => {
    expect(cardEntriesLanding('loading', withCheck).pendingReason).toBe('card_entries_checking');
    expect(cardEntriesLanding('unknown', withCheck).pendingReason).toBe('online_setting_unknown');
  });
  it('changes nothing when open', () => {
    expect(cardEntriesLanding('open', cardOnly)).toEqual({ pendingReason: undefined, note: null });
  });
});
