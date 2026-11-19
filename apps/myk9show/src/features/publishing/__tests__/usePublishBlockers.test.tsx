import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useClubPublishBlockers, usePublishBlockers } from '../usePublishBlockers';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePublishBlockers (MYK9-2198)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the server lines for the show', async () => {
    rpc.mockResolvedValue({
      data: [{ key: 'premium_not_published', waiting_on: 'secretary', eta: null }],
      error: null,
    });
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(rpc).toHaveBeenCalledWith('show_publish_blockers', { p_show_id: 'show-1' });
    expect(result.current).toEqual({
      status: 'ready',
      blockers: [{ key: 'premium_not_published', waitingOn: 'secretary', eta: null }],
    });
  });

  it('returns an empty ready list when nothing blocks', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });

    await waitFor(() => expect(result.current).toEqual({ status: 'ready', blockers: [] }));
  });

  it('is an error state, never an empty list, when the call fails or offline', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).not.toHaveProperty('blockers');
  });

  it('retry asks the server again', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    const { result } = renderHook(() => usePublishBlockers('show-1'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));

    rpc.mockResolvedValueOnce({ data: [], error: null });
    if (result.current.status === 'error') result.current.retry();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not ask when disabled', () => {
    renderHook(() => usePublishBlockers('show-1', false), { wrapper });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads the club lines from the club RPC', async () => {
    rpc.mockResolvedValue({
      data: [{ key: 'club_not_approved', waiting_on: 'myk9', eta: 'about a day' }],
      error: null,
    });
    const { result } = renderHook(() => useClubPublishBlockers('club-1'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(rpc).toHaveBeenCalledWith('club_publish_blockers', { p_club_id: 'club-1' });
  });
});
