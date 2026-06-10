import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  useJudgeAssignments,
  mapAssignmentRowToJudgeClass,
  parseScheduledTime,
  type JudgeAssignmentRow,
} from '../useJudgeAssignments';

// ── Auth context mock ──────────────────────────────────────────────────────────
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'person-123' },
  }),
}));

// ── Supabase mock ──────────────────────────────────────────────────────────────
const mockIn = vi.fn();
const mockEq = vi.fn(() => ({ in: mockIn }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
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

const makeRow = (overrides: Partial<JudgeAssignmentRow> = {}): JudgeAssignmentRow => ({
  id: 'assignment-1',
  class_id: 'class-1',
  show_id: 'show-1',
  status: 'confirmed',
  classes: {
    id: 'class-1',
    name: 'Interior Novice A',
    element: 'Interior',
    level: 'Novice',
    status: 'upcoming',
    start_time: '09:00:00',
    total_entries_count: 20,
    scored_count: 5,
    trial_id: 'trial-1',
    trials: { id: 'trial-1', date: '2026-06-10', show_id: 'show-1' },
  },
  ...overrides,
});

describe('mapAssignmentRowToJudgeClass', () => {
  it('maps a full row to a JudgeClass', () => {
    const result = mapAssignmentRowToJudgeClass(makeRow());

    expect(result).toEqual({
      id: 'assignment-1',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
      name: 'Interior Novice A',
      element: 'Interior',
      level: 'Novice',
      trialDate: '2026-06-10',
      scheduledTime: new Date('2026-06-10T09:00:00'),
      ringNumber: null,
      totalEntries: 20,
      completedEntries: 5,
      status: 'pending',
    });
  });

  it("maps class status 'in_progress' to dashboard status 'in-progress'", () => {
    const row = makeRow();
    row.classes!.status = 'in_progress';
    expect(mapAssignmentRowToJudgeClass(row)?.status).toBe('in-progress');
  });

  it("maps class status 'completed' through unchanged", () => {
    const row = makeRow();
    row.classes!.status = 'completed';
    expect(mapAssignmentRowToJudgeClass(row)?.status).toBe('completed');
  });

  it("maps 'setup' and null class statuses to 'pending'", () => {
    const setupRow = makeRow();
    setupRow.classes!.status = 'setup';
    expect(mapAssignmentRowToJudgeClass(setupRow)?.status).toBe('pending');

    const nullRow = makeRow();
    nullRow.classes!.status = null;
    expect(mapAssignmentRowToJudgeClass(nullRow)?.status).toBe('pending');
  });

  it('returns null when the assignment has no class attached', () => {
    expect(mapAssignmentRowToJudgeClass(makeRow({ classes: null }))).toBeNull();
  });

  it('returns null when the class has no trial attached', () => {
    const row = makeRow();
    row.classes!.trials = null;
    expect(mapAssignmentRowToJudgeClass(row)).toBeNull();
  });

  it('returns null for cancelled classes', () => {
    const row = makeRow();
    row.classes!.status = 'cancelled';
    expect(mapAssignmentRowToJudgeClass(row)).toBeNull();
  });

  it('falls back to the trial show_id when the assignment show_id is null', () => {
    const row = makeRow({ show_id: null });
    expect(mapAssignmentRowToJudgeClass(row)?.showId).toBe('show-1');
  });

  it('defaults null entry counts to zero', () => {
    const row = makeRow();
    row.classes!.total_entries_count = null;
    row.classes!.scored_count = null;
    const result = mapAssignmentRowToJudgeClass(row);
    expect(result?.totalEntries).toBe(0);
    expect(result?.completedEntries).toBe(0);
  });
});

describe('parseScheduledTime', () => {
  it('combines trial date with a Postgres TIME value', () => {
    expect(parseScheduledTime('2026-06-10', '14:30:00')).toEqual(new Date('2026-06-10T14:30:00'));
  });

  it('parses a full ISO timestamp directly', () => {
    expect(parseScheduledTime('2026-06-10', '2026-06-11T08:00:00Z')).toEqual(
      new Date('2026-06-11T08:00:00Z')
    );
  });

  it('falls back to local midnight of the trial date when start_time is null', () => {
    expect(parseScheduledTime('2026-06-10', null)).toEqual(new Date('2026-06-10T00:00:00'));
  });
});

describe('useJudgeAssignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries judge_assignments filtered to the signed-in judge and active statuses', async () => {
    mockIn.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useJudgeAssignments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFrom).toHaveBeenCalledWith('judge_assignments');
    expect(mockEq).toHaveBeenCalledWith('person_id', 'person-123');
    expect(mockIn).toHaveBeenCalledWith('status', ['confirmed', 'invited']);
    expect(result.current.assignments).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it('returns mapped assignments sorted by scheduled time', async () => {
    const later = makeRow({ id: 'a-later', class_id: 'class-later' });
    later.classes!.id = 'class-later';
    later.classes!.start_time = '13:00:00';
    const earlier = makeRow({ id: 'a-earlier', class_id: 'class-earlier' });
    earlier.classes!.id = 'class-earlier';
    earlier.classes!.start_time = '08:00:00';

    mockIn.mockResolvedValueOnce({ data: [later, earlier], error: null });

    const { result } = renderHook(() => useJudgeAssignments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.assignments.map(a => a.id)).toEqual(['a-earlier', 'a-later']);
  });

  it('drops rows that cannot be judged (no class, cancelled)', async () => {
    const cancelled = makeRow({ id: 'a-cancelled' });
    cancelled.classes!.status = 'cancelled';

    mockIn.mockResolvedValueOnce({
      data: [makeRow(), makeRow({ id: 'a-orphan', classes: null }), cancelled],
      error: null,
    });

    const { result } = renderHook(() => useJudgeAssignments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.assignments.map(a => a.id)).toEqual(['assignment-1']);
  });

  it('surfaces query failures as isError', async () => {
    mockIn.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

    const { result } = renderHook(() => useJudgeAssignments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.assignments).toEqual([]);
  });
});
