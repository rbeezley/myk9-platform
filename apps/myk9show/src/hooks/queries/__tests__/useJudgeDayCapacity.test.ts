import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useJudgeDayCapacity } from '../useJudgeDayCapacity';

const mockSelect = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function mockJudgeAssignments(data: unknown[] = []) {
  mockSelect.mockReturnValueOnce({
    eq: vi.fn().mockReturnValueOnce({
      eq: vi.fn().mockResolvedValueOnce({ data, error: null }),
    }),
  });
}

function mockClassCapacity() {
  mockSelect.mockReturnValueOnce({
    eq: vi.fn().mockResolvedValueOnce({ data: [], error: null }),
  });
}

describe('useJudgeDayCapacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
  });

  it('returns empty array and no loading when showId is undefined', () => {
    const { result } = renderHook(() => useJudgeDayCapacity(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.judgeDays).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches judge-day capacity from judge_day_summary view', async () => {
    const mockSummaryData = [
      {
        show_id: 'show-1',
        judge_id: 'judge-1',
        judge_name: 'Jane Doe',
        show_date: '2026-05-01',
        class_ids: ['c1', 'c2'],
        class_names: ['Novice A', 'Novice B'],
        confirmed_count: 80,
        waitlist_count: 5,
      },
    ];

    const mockShowData = {
      default_judge_day_capacity: 125,
      mail_in_strategy: 'none',
      mail_in_value: null,
      mail_in_deadline: null,
    };

    // First call: judge_day_summary view
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValueOnce({ data: mockSummaryData, error: null }),
    });
    // Second call: shows table
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({ data: mockShowData, error: null }),
      }),
    });
    mockJudgeAssignments();
    mockClassCapacity();

    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.judgeDays).toHaveLength(1);
    const day = result.current.judgeDays[0]!;
    expect(day.judgeName).toBe('Jane Doe');
    expect(day.confirmedCount).toBe(80);
    expect(day.capacity).toBe(125);
    expect(day.availableSpots).toBe(45);
    expect(day.mailInReserved).toBe(0);
  });

  it('calculates mail-in reserved spots for fixed strategy', async () => {
    const mockSummaryData = [
      {
        show_id: 'show-1',
        judge_id: 'judge-1',
        judge_name: 'Jane Doe',
        show_date: '2026-05-01',
        class_ids: ['c1'],
        class_names: ['Novice A'],
        confirmed_count: 50,
        waitlist_count: 0,
      },
    ];

    const mockShowData = {
      default_judge_day_capacity: 125,
      mail_in_strategy: 'fixed',
      mail_in_value: 20,
      mail_in_deadline: null,
    };

    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValueOnce({ data: mockSummaryData, error: null }),
    });
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({ data: mockShowData, error: null }),
      }),
    });
    mockJudgeAssignments();
    mockClassCapacity();

    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const day = result.current.judgeDays[0]!;
    expect(day.mailInReserved).toBe(20);
    expect(day.availableSpots).toBe(55); // 125 - 50 - 20
  });

  it('calculates mail-in reserved spots for percentage strategy', async () => {
    const mockSummaryData = [
      {
        show_id: 'show-1',
        judge_id: 'judge-1',
        judge_name: 'Jane Doe',
        show_date: '2026-05-01',
        class_ids: ['c1'],
        class_names: ['Novice A'],
        confirmed_count: 0,
        waitlist_count: 0,
      },
    ];

    const mockShowData = {
      default_judge_day_capacity: 100,
      mail_in_strategy: 'percentage',
      mail_in_value: 15,
      mail_in_deadline: null,
    };

    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValueOnce({ data: mockSummaryData, error: null }),
    });
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({ data: mockShowData, error: null }),
      }),
    });
    mockJudgeAssignments();
    mockClassCapacity();

    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const day = result.current.judgeDays[0]!;
    expect(day.mailInReserved).toBe(15); // 15% of 100
    expect(day.availableSpots).toBe(85);
  });

  it('auto-releases mail-in reserved spots after the release date', async () => {
    const mockSummaryData = [
      {
        show_id: 'show-1',
        judge_id: 'judge-1',
        judge_name: 'Jane Doe',
        show_date: '2026-05-01',
        class_ids: ['c1'],
        class_names: ['Novice A'],
        confirmed_count: 50,
        waitlist_count: 0,
      },
    ];

    const mockShowData = {
      default_judge_day_capacity: 125,
      mail_in_strategy: 'fixed',
      mail_in_value: 20,
      mail_in_deadline: null,
      mail_in_auto_release: true,
      mail_in_release_date: '2020-01-01',
    };

    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValueOnce({ data: mockSummaryData, error: null }),
    });
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({ data: mockShowData, error: null }),
      }),
    });
    mockJudgeAssignments();
    mockClassCapacity();

    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const day = result.current.judgeDays[0]!;
    expect(day.mailInReserved).toBe(0);
    expect(day.availableSpots).toBe(75); // 125 - 50
  });

  it('surfaces error from supabase', async () => {
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'DB error' } }),
    });
    // Second select call (shows query) needs a stub so Promise.all doesn't crash
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      }),
    });
    mockJudgeAssignments();

    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('DB error');
  });

  it.each([
    { direction: 'above', override: 150 },
    { direction: 'below', override: 80 },
  ])('uses the $direction judge-day override instead of the show default', async ({ override }) => {
    const mockSummaryData = [
      {
        show_id: 'show-1',
        judge_id: 'judge-1',
        judge_name: 'Jane Doe',
        show_date: '2026-05-01',
        class_ids: ['c1'],
        class_names: ['Novice A'],
        confirmed_count: override,
        waitlist_count: 0,
      },
    ];

    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValueOnce({ data: mockSummaryData, error: null }),
    });
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: {
            default_judge_day_capacity: 125,
            mail_in_strategy: 'none',
            mail_in_value: null,
          },
          error: null,
        }),
      }),
    });
    mockJudgeAssignments([
      {
        class_id: 'c1',
        person_id: 'judge-1',
        day_capacity_override: override,
        trials: { date: '2026-05-01' },
      },
    ]);
    mockClassCapacity();

    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.judgeDays[0]?.capacity).toBe(override);
    expect(result.current.judgeDays[0]?.availableSpots).toBe(0);
  });
});
