import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useJudgeDayCapacity } from '../useJudgeDayCapacity';
import { supabase } from '@/services/database/supabaseClient';

const mockEq = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({ select: () => ({ eq: mockEq }) })),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const summaryRow = (over: Record<string, unknown> = {}) => ({
  show_id: 'show-1',
  judge_id: 'judge-1',
  judge_name: 'Jane Doe',
  show_date: '2026-05-01',
  class_ids: ['c1', 'c2'],
  class_names: ['Novice A', 'Novice B'],
  confirmed_count: 80,
  waitlist_count: 5,
  ...over,
});

const serverRow = (over: Record<string, unknown> = {}) => ({
  class_id: 'c1',
  judge_id: 'judge-1',
  show_date: '2026-05-01',
  day_capacity: 125,
  day_taken: 80,
  day_mail_in_reserved: 0,
  day_remaining: 45,
  ...over,
});

function script(summary: unknown[], rows: unknown[] | null, rpcError: unknown = null) {
  mockEq.mockResolvedValueOnce({ data: summary, error: null });
  mockRpc.mockResolvedValueOnce({ data: rows, error: rpcError });
}

describe('useJudgeDayCapacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockReset();
    mockRpc.mockReset();
  });

  it('returns empty array and no loading when showId is undefined', () => {
    const { result } = renderHook(() => useJudgeDayCapacity(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.judgeDays).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("puts the server's figures on the card, not a recomputation (MYK9-1005)", async () => {
    // Taken (82), mail-in (20) and remaining (23) are deliberately NOT what the view's count
    // (80) and a client recompute (125 - 80 - 20 = 25) would give.
    script(
      [summaryRow()],
      [
        serverRow({ day_taken: 82, day_mail_in_reserved: 20, day_remaining: 23 }),
        serverRow({ class_id: 'c2', day_taken: 82, day_mail_in_reserved: 20, day_remaining: 23 }),
      ]
    );
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
      availableSpots: 23,
      classIds: ['c1', 'c2'],
      classNames: ['Novice A', 'Novice B'],
    });
    expect(mockRpc).toHaveBeenCalledWith('get_show_class_judge_day_availability', {
      p_show_id: 'show-1',
    });
    // Capacity is never rebuilt from the show's settings or the judge assignments.
    expect(vi.mocked(supabase.from).mock.calls.map(([table]) => table)).toEqual([
      'judge_day_summary',
    ]);
  });

  it('keeps an over-limit day over the limit instead of clamping it', async () => {
    script([summaryRow()], [serverRow({ day_capacity: 3, day_taken: 5, day_remaining: 0 })]);
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
    script([], []);
    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.judgeDays).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('judge-days the server did not report are an error, never a false zero', async () => {
    script([summaryRow()], []);
    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.judgeDays).toEqual([]);
  });

  it('a day missing from the server rows is an error', async () => {
    script([summaryRow()], [serverRow({ judge_id: 'judge-2' })]);
    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.judgeDays).toEqual([]);
  });

  it('surfaces an RPC failure as an error', async () => {
    script([summaryRow()], null, { message: 'rpc down' });
    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBe('rpc down'));
    expect(result.current.judgeDays).toEqual([]);
  });
});
