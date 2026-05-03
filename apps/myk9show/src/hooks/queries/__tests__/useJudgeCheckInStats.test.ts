import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useJudgeCheckInStats } from '../useJudgeCheckInStats';

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

describe('useJudgeCheckInStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty rings array when judge has no assignments', async () => {
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        in: vi.fn().mockResolvedValueOnce({ data: [], error: null }),
      }),
    });

    const { result } = renderHook(() => useJudgeCheckInStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rings).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("maps today's assignments to JudgeRingAssignment shape", async () => {
    const rows = [
      {
        id: 'a1',
        class_id: 'c1',
        status: 'confirmed',
        classes: {
          id: 'c1',
          name: 'Interior Novice A',
          total_entries_count: 20,
          checked_in_count: 14,
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
          total_entries_count: 10,
          checked_in_count: 10,
          trials: { id: 't1', date: TODAY },
        },
      },
    ];

    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        in: vi.fn().mockResolvedValueOnce({ data: rows, error: null }),
      }),
    });

    const { result } = renderHook(() => useJudgeCheckInStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rings).toHaveLength(2);
    const first = result.current.rings[0]!;
    expect(first.classId).toBe('c1');
    expect(first.className).toBe('Interior Novice A');
    expect(first.totalEntries).toBe(20);
    expect(first.checkedIn).toBe(14);
    expect(first.conflicts).toBe(0);
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
          total_entries_count: 5,
          checked_in_count: 5,
          trials: { id: 't1', date: '2020-01-01' },
        },
      },
    ];

    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        in: vi.fn().mockResolvedValueOnce({ data: rows, error: null }),
      }),
    });

    const { result } = renderHook(() => useJudgeCheckInStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rings).toHaveLength(0);
  });

  it('surfaces error from supabase', async () => {
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValueOnce({
        in: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Network error' } }),
      }),
    });

    const { result } = renderHook(() => useJudgeCheckInStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Network error');
    expect(result.current.rings).toEqual([]);
  });
});
