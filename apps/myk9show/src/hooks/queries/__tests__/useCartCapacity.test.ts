import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CART_CAPACITY_UNREADABLE, useCartCapacity } from '../useCartCapacity';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mockRpc },
}));

vi.mock('../useShowJudges', () => ({
  useShowJudges: () => ({ data: [{ id: 'alma', name: 'Alma Judge' }] }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

const ROWS = [
  {
    class_id: 'interior',
    class_max_entries: null,
    class_entry_count: 1,
    class_remaining: null,
    class_full: false,
    allow_waitlist: false,
    self_service_block: 'full',
    judge_id: 'alma',
    show_date: '2026-10-10',
    day_capacity: 1,
    day_taken: 1,
    day_mail_in_reserved: 0,
    day_remaining: 0,
  },
  {
    class_id: 'interior',
    class_max_entries: null,
    class_entry_count: 1,
    class_remaining: null,
    class_full: false,
    allow_waitlist: false,
    self_service_block: 'full',
    judge_id: 'bert',
    show_date: '2026-10-10',
    day_capacity: 3,
    day_taken: 0,
    day_mail_in_reserved: 0,
    day_remaining: 3,
  },
];

describe('useCartCapacity (MYK9-753)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('reads every judge day from get_show_class_judge_day_availability', async () => {
    mockRpc.mockResolvedValueOnce({ data: ROWS, error: null });

    const { result } = renderHook(() => useCartCapacity('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockRpc).toHaveBeenCalledWith('get_show_class_judge_day_availability', {
      p_show_id: 'show-1',
    });
    expect(result.current.error).toBeNull();
    expect(result.current.judgeDays).toEqual([
      { judgeId: 'alma', showDate: '2026-10-10', availableSpots: 0, classIds: ['interior'] },
      { judgeId: 'bert', showDate: '2026-10-10', availableSpots: 3, classIds: ['interior'] },
    ]);
    expect(result.current.judgeNameById.get('alma')).toBe('Alma Judge');
  });

  it('reports a failed read as an error, never as open', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });

    const { result } = renderHook(() => useCartCapacity('show-1'), { wrapper });

    await waitFor(() => expect(result.current.error).toBe('permission denied'));
    expect(result.current.judgeDays).toEqual([]);
  });

  it('reports a show that returned no rows as unreadable', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useCartCapacity('show-1'), { wrapper });

    await waitFor(() => expect(result.current.error).toBe(CART_CAPACITY_UNREADABLE));
  });

  it('asks nothing without a show', () => {
    const { result } = renderHook(() => useCartCapacity(undefined), { wrapper });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.current.judgeDays).toEqual([]);
  });
});
