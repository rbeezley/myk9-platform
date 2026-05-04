import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useJudgeTodayStats } from '../useJudgeTodayStats';

// ── Auth context mock ──────────────────────────────────────────────────────────
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'person-123' },
  }),
}));

// ── Supabase mock ──────────────────────────────────────────────────────────────
const mockSelect = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({ select: mockSelect })),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const TODAY = new Date().toISOString().slice(0, 10);

describe('useJudgeTodayStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero stats and no error when judge has no assignments', async () => {
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        in: vi.fn().mockResolvedValueOnce({ data: [], error: null }),
      }),
    });

    const { result } = renderHook(() => useJudgeTodayStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totalToday).toBe(0);
    expect(result.current.completedToday).toBe(0);
    expect(result.current.totalEntries).toBe(0);
    expect(result.current.checkedInCount).toBe(0);
    expect(result.current.nextClass).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("correctly aggregates stats for today's assignments", async () => {
    const rows = [
      {
        id: 'a1',
        class_id: 'c1',
        status: 'confirmed',
        classes: {
          id: 'c1',
          name: 'Interior Novice A',
          status: 'pending',
          total_entries_count: 20,
          checked_in_count: 10,
          start_time: '09:00:00',
          trials: { id: 't1', date: TODAY },
        },
      },
      {
        id: 'a2',
        class_id: 'c2',
        status: 'confirmed',
        classes: {
          id: 'c2',
          name: 'Container Excellent',
          status: 'completed',
          total_entries_count: 15,
          checked_in_count: 15,
          start_time: '11:00:00',
          trials: { id: 't1', date: TODAY },
        },
      },
    ];

    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        in: vi.fn().mockResolvedValueOnce({ data: rows, error: null }),
      }),
    });

    const { result } = renderHook(() => useJudgeTodayStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totalToday).toBe(2);
    expect(result.current.completedToday).toBe(1);
    expect(result.current.totalEntries).toBe(35);
    expect(result.current.checkedInCount).toBe(25);
    // next class = first non-completed by start_time = Interior Novice A
    expect(result.current.nextClass).toBe('Interior Novice A');
    expect(result.current.error).toBeNull();
  });

  it('filters out assignments from other dates', async () => {
    const rows = [
      {
        id: 'a1',
        class_id: 'c1',
        status: 'confirmed',
        classes: {
          id: 'c1',
          name: 'Old Class',
          status: 'completed',
          total_entries_count: 10,
          checked_in_count: 10,
          start_time: '08:00:00',
          trials: { id: 't1', date: '2020-01-01' }, // different day
        },
      },
    ];

    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        in: vi.fn().mockResolvedValueOnce({ data: rows, error: null }),
      }),
    });

    const { result } = renderHook(() => useJudgeTodayStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totalToday).toBe(0);
    expect(result.current.totalEntries).toBe(0);
  });

  it('surfaces error from supabase', async () => {
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        in: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'DB error' } }),
      }),
    });

    const { result } = renderHook(() => useJudgeTodayStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('DB error');
    expect(result.current.totalToday).toBe(0);
  });
});
