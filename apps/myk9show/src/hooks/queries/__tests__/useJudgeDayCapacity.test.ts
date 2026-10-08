import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useJudgeDayCapacity } from '../useJudgeDayCapacity';

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const managerRow = (over: Record<string, unknown> = {}) => ({
  judge_id: 'judge-1',
  judge_full_name: 'Jane Doe',
  show_date: '2026-05-01',
  class_ids: ['c1', 'c2'],
  class_names: ['Novice A', 'Novice B'],
  day_capacity: 125,
  day_taken: 80,
  day_mail_in_reserved: 0,
  day_remaining: 45,
  waitlist_count: 5,
  ...over,
});

function script(rows: unknown[] | null, error: unknown = null) {
  mockRpc.mockResolvedValueOnce({ data: rows, error });
}

describe('useJudgeDayCapacity', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it('returns empty array and no loading when showId is undefined', () => {
    const { result } = renderHook(() => useJudgeDayCapacity(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.judgeDays).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("puts the manager read's figures on the card in one call, not a recomputation (MYK9-1005)", async () => {
    // Remaining (21) is deliberately not capacity - taken - mail-in (23): the card shows the
    // server's figure, never a recomputation.
    script([managerRow({ day_taken: 82, day_mail_in_reserved: 20, day_remaining: 21 })]);
    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.judgeDays).toHaveLength(1));
    expect(result.current.judgeDays[0]).toEqual({
      judgeId: 'judge-1',
      judgeName: 'Jane Doe',
      showDate: '2026-05-01',
      capacity: 125,
      confirmedCount: 82,
      waitlistCount: 5,
      mailInReserved: 20,
      availableSpots: 21,
      classIds: ['c1', 'c2'],
      classNames: ['Novice A', 'Novice B'],
    });
    // The manager read counts every account's holds, the secretary's own included; the cart's
    // read (get_show_class_judge_day_availability) leaves the caller's own holds out.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_show_judge_day_capacity_for_manager', {
      p_show_id: 'show-1',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('keeps an over-limit day over the limit instead of clamping it', async () => {
    script([managerRow({ day_capacity: 3, day_taken: 5, day_remaining: 0 })]);
    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.judgeDays).toHaveLength(1));
    expect(result.current.judgeDays[0]).toMatchObject({
      capacity: 3,
      confirmedCount: 5,
      availableSpots: 0,
    });
  });

  it('a show with no judge-days is an empty list, not an error', async () => {
    script([]);
    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.judgeDays).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('a day without figures is an error, never a false zero', async () => {
    script([managerRow({ day_capacity: null, day_taken: null, day_remaining: null })]);
    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.judgeDays).toEqual([]);
  });

  it('surfaces an RPC failure as an error', async () => {
    script(null, { message: 'rpc down' });
    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBe('rpc down'));
    expect(result.current.judgeDays).toEqual([]);
  });
});
