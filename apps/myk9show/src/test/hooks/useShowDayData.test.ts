/**
 * Tests for useShowDayData hook and its pure helper functions.
 *
 * Pure functions (computeEstimatedTime, extractActiveShows, buildClassProgressMap,
 * buildShowDayClasses) are tested directly.
 * The hook itself is tested via renderHook with mocked supabase + auth.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import {
  computeEstimatedTime,
  extractActiveShows,
  buildClassProgressMap,
  buildShowDayClasses,
} from '@/hooks/queries/useShowDayData';
import { getTodayLocal } from '@/utils/dateLocal';
import { DEFAULT_MINUTES_PER_DOG } from '@/types/show-day-types';
import type { ShowDayCheckRow, ShowDayDetailRow, RingProgressRow } from '@/types/show-day-types';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockSupabaseChain = {
  data: null as unknown,
  error: null as unknown,
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
};

// Each method returns the chain so calls can be chained
for (const key of ['select', 'eq', 'in', 'or', 'order'] as const) {
  mockSupabaseChain[key] = vi.fn().mockReturnValue(mockSupabaseChain);
}

// The chain resolves to { data, error } when awaited
Object.defineProperty(mockSupabaseChain, 'then', {
  get() {
    const { data, error } = mockSupabaseChain;
    return (resolve: (v: unknown) => void) => resolve({ data, error });
  },
  configurable: true,
});

const mockFrom = vi.fn().mockReturnValue(mockSupabaseChain);

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const showDayDataMocks = vi.hoisted(() => ({
  fetchReplicatedShowDayCheck: vi.fn(),
  fetchReplicatedShowDayDetails: vi.fn(),
  fetchReplicatedRingProgress: vi.fn(),
}));

vi.mock('@/hooks/queries/showDayDataReplication', () => ({
  fetchReplicatedShowDayCheck: (...args: unknown[]) =>
    showDayDataMocks.fetchReplicatedShowDayCheck(...args),
  fetchReplicatedShowDayDetails: (...args: unknown[]) =>
    showDayDataMocks.fetchReplicatedShowDayDetails(...args),
  fetchReplicatedRingProgress: (...args: unknown[]) =>
    showDayDataMocks.fetchReplicatedRingProgress(...args),
}));

const mockUserWithRoles = {
  databaseUserId: 'user-123',
  roles: [],
  permissions: [],
  scopes: [],
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'auth-user-123' },
    userWithRoles: mockUserWithRoles,
    loading: false,
  }),
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@/services/LoggingService', () => ({
  logger: mockLogger,
  LoggingService: {
    getInstance: () => mockLogger,
  },
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const today = getTodayLocal();

function makeCheckRow(overrides: Partial<ShowDayCheckRow> = {}): ShowDayCheckRow {
  return {
    id: 'entry-1',
    trial: {
      id: 'trial-1',
      date: today,
      show: {
        id: 'show-1',
        name: 'AKC Scent Work Trial',
        location: 'Denver, CO',
        status: 'in_progress',
        start_date: today,
        end_date: today,
        club: { name: 'Mile High Club' },
      },
    },
    ...overrides,
  };
}

function makeDetailRow(overrides: Partial<ShowDayDetailRow> = {}): ShowDayDetailRow {
  return {
    id: 'entry-1',
    check_in_status: 'checked-in',
    armband: '160',
    run_order: 5,
    is_scored: false,
    result_status: 'pending',
    is_in_ring: false,
    dog: { id: 'dog-1', call_name: 'Storm' },
    class: {
      id: 'class-1',
      name: 'Container Novice A',
      element: 'Container',
      level: 'Novice',
      status: 'in-progress',
      total_entries_count: 12,
      scored_count: 3,
    },
    trial: {
      id: 'trial-1',
      date: today,
      show: {
        id: 'show-1',
        name: 'AKC Scent Work Trial',
        location: 'Denver, CO',
        status: 'in_progress',
        club: { name: 'Mile High Club' },
      },
    },
    ...overrides,
  };
}

function makeProgressRow(overrides: Partial<RingProgressRow> = {}): RingProgressRow {
  return {
    class_id: 'class-1',
    is_in_ring: false,
    is_scored: true,
    scoring_completed_at: '2026-03-09T10:05:00Z',
    run_order: 1,
    dog: { call_name: 'Buddy' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('getTodayLocal', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = getTodayLocal();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('computeEstimatedTime', () => {
  it('returns null when running order is null', () => {
    expect(computeEstimatedTime(null, 0, [])).toBeNull();
  });

  it('returns 0 when exhibitor is next up (no dogs ahead)', () => {
    // running order 4, 3 scored → 4-3-1 = 0 dogs ahead
    expect(computeEstimatedTime(4, 3, [])).toBe(0);
  });

  it('uses default 3 min per dog with fewer than 3 scored entries', () => {
    // running order 6, 2 scored → 6-2-1 = 3 dogs ahead × 3 min = 9 min
    const result = computeEstimatedTime(6, 2, []);
    expect(result).toBe(3 * DEFAULT_MINUTES_PER_DOG);
  });

  it('uses adaptive timing after 3+ scored entries', () => {
    // 4 dogs scored over 12 minutes → 4 min avg
    // running order 8, 4 scored → 8-4-1 = 3 dogs ahead × 4 min = 12 min
    const base = new Date('2026-03-09T10:00:00Z').getTime();
    const timestamps = [
      new Date(base),
      new Date(base + 4 * 60_000),
      new Date(base + 8 * 60_000),
      new Date(base + 12 * 60_000),
    ];
    const result = computeEstimatedTime(8, 4, timestamps);
    expect(result).toBe(12); // 3 dogs × 4 min
  });

  it('handles unsorted timestamps correctly', () => {
    const base = new Date('2026-03-09T10:00:00Z').getTime();
    // Intentionally out of order
    const timestamps = [new Date(base + 6 * 60_000), new Date(base), new Date(base + 3 * 60_000)];
    // Span = 6 min, 2 intervals → 3 min avg
    // running order 5, 3 scored → 5-3-1 = 1 dog ahead × 3 min = 3
    const result = computeEstimatedTime(5, 3, timestamps);
    expect(result).toBe(3);
  });

  it('falls back to default when timestamps have zero span', () => {
    const same = new Date('2026-03-09T10:00:00Z');
    const timestamps = [same, same, same];
    // span is 0, so avgMinutes stays at DEFAULT
    // running order 6, 3 scored → 2 dogs ahead × 3 min = 6
    const result = computeEstimatedTime(6, 3, timestamps);
    expect(result).toBe(2 * DEFAULT_MINUTES_PER_DOG);
  });

  it('clamps dogs ahead to 0 when scored exceeds running order', () => {
    // running order 2, 5 scored → max(0, 2-5-1) = 0
    expect(computeEstimatedTime(2, 5, [])).toBe(0);
  });
});

describe('extractActiveShows', () => {
  it('returns empty array for no rows', () => {
    expect(extractActiveShows([])).toEqual([]);
  });

  it('extracts unique shows from multiple entries', () => {
    const rows = [
      makeCheckRow({ id: 'entry-1' }),
      makeCheckRow({ id: 'entry-2' }), // same show
    ];
    const shows = extractActiveShows(rows);
    expect(shows).toHaveLength(1);
    expect(shows[0].showId).toBe('show-1');
    expect(shows[0].showName).toBe('AKC Scent Work Trial');
    expect(shows[0].clubName).toBe('Mile High Club');
  });

  it('returns multiple shows when entered in different shows', () => {
    const row2 = makeCheckRow({
      id: 'entry-2',
      trial: {
        id: 'trial-2',
        date: today,
        show: {
          id: 'show-2',
          name: 'UKC Nosework',
          location: 'Boulder, CO',
          status: 'in_progress',
          start_date: today,
          end_date: today,
          club: { name: 'Boulder K9' },
        },
      },
    });
    const shows = extractActiveShows([makeCheckRow(), row2]);
    expect(shows).toHaveLength(2);
  });

  it('handles null club gracefully', () => {
    const row = makeCheckRow();
    row.trial.show.club = null;
    const shows = extractActiveShows([row]);
    expect(shows[0].clubName).toBe('');
  });
});

describe('buildClassProgressMap', () => {
  it('returns empty map for no rows', () => {
    expect(buildClassProgressMap([]).size).toBe(0);
  });

  it('tracks scored count and timestamps per class', () => {
    const rows = [
      makeProgressRow({ run_order: 1, scoring_completed_at: '2026-03-09T10:00:00Z' }),
      makeProgressRow({ run_order: 2, scoring_completed_at: '2026-03-09T10:04:00Z' }),
      makeProgressRow({ run_order: 3, scoring_completed_at: '2026-03-09T10:07:00Z' }),
    ];
    const map = buildClassProgressMap(rows);
    const progress = map.get('class-1');
    expect(progress).toBeDefined();
    expect(progress!.scoredCount).toBe(3);
    expect(progress!.scoredTimestamps).toHaveLength(3);
    expect(progress!.currentDogInRing).toBeNull();
  });

  it('identifies current dog in ring', () => {
    const rows = [
      makeProgressRow({
        is_in_ring: true,
        is_scored: false,
        scoring_completed_at: null,
        dog: { call_name: 'Ace' },
      }),
      makeProgressRow({ is_in_ring: false, is_scored: true }),
    ];
    const map = buildClassProgressMap(rows);
    expect(map.get('class-1')!.currentDogInRing).toBe('Ace');
  });

  it('separates progress by class', () => {
    const rows = [
      makeProgressRow({ class_id: 'class-1' }),
      makeProgressRow({ class_id: 'class-2' }),
    ];
    const map = buildClassProgressMap(rows);
    expect(map.size).toBe(2);
    expect(map.get('class-1')!.scoredCount).toBe(1);
    expect(map.get('class-2')!.scoredCount).toBe(1);
  });
});

describe('buildShowDayClasses', () => {
  it('builds classes from detail rows with progress', () => {
    const details = [makeDetailRow()];
    const progressMap = buildClassProgressMap([
      makeProgressRow({ scoring_completed_at: '2026-03-09T10:00:00Z' }),
      makeProgressRow({ run_order: 2, scoring_completed_at: '2026-03-09T10:04:00Z' }),
      makeProgressRow({ run_order: 3, scoring_completed_at: '2026-03-09T10:08:00Z' }),
      makeProgressRow({
        run_order: 4,
        is_in_ring: true,
        is_scored: false,
        scoring_completed_at: null,
        dog: { call_name: 'Rex' },
      }),
    ]);

    const classes = buildShowDayClasses(details, progressMap);
    expect(classes).toHaveLength(1);

    const cls = classes[0];
    expect(cls.classId).toBe('class-1');
    expect(cls.className).toBe('Container Novice A');
    expect(cls.dogCallName).toBe('Storm');
    expect(cls.armband).toBe('160');
    expect(cls.scoredEntries).toBe(3);
    expect(cls.currentDogInRing).toBe('Rex');
    expect(cls.myRunningOrder).toBe(5);
    expect(cls.ringNumber).toBeNull();
    // 5 - 3 - 1 = 1 dog ahead; 3 scored over 8 min = 4 min avg → 1 × 4 = 4
    expect(cls.estimatedTimeMinutes).toBe(4);
  });

  it('uses check_in_status for exhibitor show-day status', () => {
    const detail = {
      ...makeDetailRow({ check_in_status: 'no-status' }),
      entry_status: 'checked-in',
    } as ShowDayDetailRow & { entry_status: string };

    const classes = buildShowDayClasses([detail], new Map());

    expect(classes[0].entryStatus).toBe('no-status');
  });

  it('falls back to no-status when check_in_status is missing', () => {
    const classes = buildShowDayClasses([makeDetailRow({ check_in_status: null })], new Map());

    expect(classes[0].entryStatus).toBe('no-status');
  });

  it('falls back to class.scored_count when no progress data', () => {
    const details = [makeDetailRow()];
    const emptyMap = new Map();

    const classes = buildShowDayClasses(details, emptyMap);
    expect(classes[0].scoredEntries).toBe(3); // from class.scored_count
    expect(classes[0].currentDogInRing).toBeNull();
  });

  it('marks scored entries correctly', () => {
    const scored = makeDetailRow({
      is_scored: true,
      result_status: 'qualified',
    });
    const classes = buildShowDayClasses([scored], new Map());
    expect(classes[0].isScored).toBe(true);
    expect(classes[0].resultStatus).toBe('qualified');
  });

  it('handles null running order', () => {
    const noOrder = makeDetailRow({ run_order: null });
    const classes = buildShowDayClasses([noOrder], new Map());
    expect(classes[0].myRunningOrder).toBeNull();
    expect(classes[0].estimatedTimeMinutes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hook integration tests
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useShowDayData hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseChain.data = null;
    mockSupabaseChain.error = null;
    showDayDataMocks.fetchReplicatedShowDayCheck.mockResolvedValue([]);
    showDayDataMocks.fetchReplicatedShowDayDetails.mockResolvedValue([]);
    showDayDataMocks.fetchReplicatedRingProgress.mockResolvedValue([]);
  });

  it('returns isShowDay: false when no entries today', async () => {
    showDayDataMocks.fetchReplicatedShowDayCheck.mockResolvedValue([]);

    const { useShowDayData } = await import('@/hooks/queries/useShowDayData');
    const { result } = renderHook(() => useShowDayData(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isShowDay).toBe(false);
    expect(result.current.activeShows).toEqual([]);
    expect(result.current.myClasses).toEqual([]);
    expect(result.current.nextUp).toBeNull();
  });

  it('returns isShowDay: true with correct data when entries exist', async () => {
    const checkData = [makeCheckRow()];
    const detailData = [
      makeDetailRow(),
      makeDetailRow({
        id: 'entry-2',
        run_order: 8,
        dog: { id: 'dog-2', call_name: 'Ace' },
        class: {
          id: 'class-2',
          name: 'Interior Novice B',
          element: 'Interior',
          level: 'Novice',
          status: 'check-in',
          total_entries_count: 8,
          scored_count: 0,
        },
      }),
    ];
    showDayDataMocks.fetchReplicatedShowDayCheck.mockResolvedValue(checkData);
    showDayDataMocks.fetchReplicatedShowDayDetails.mockResolvedValue(detailData);
    showDayDataMocks.fetchReplicatedRingProgress.mockResolvedValue([]);

    const { useShowDayData } = await import('@/hooks/queries/useShowDayData');
    const { result } = renderHook(() => useShowDayData(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isShowDay).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.myClasses.length).toBeGreaterThan(0);
    });

    expect(result.current.activeShows).toHaveLength(1);
    expect(result.current.activeShow?.showName).toBe('AKC Scent Work Trial');
    expect(result.current.stats.total).toBe(2);
  });

  it('returns isLoading: true during initial fetch', async () => {
    showDayDataMocks.fetchReplicatedShowDayCheck.mockReturnValue(new Promise(() => undefined));

    const { useShowDayData } = await import('@/hooks/queries/useShowDayData');
    const { result } = renderHook(() => useShowDayData(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);
  });

  it('sets error when query fails', async () => {
    showDayDataMocks.fetchReplicatedShowDayCheck.mockRejectedValue(new Error('Network failure'));

    const { useShowDayData } = await import('@/hooks/queries/useShowDayData');
    const { result } = renderHook(() => useShowDayData(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error?.message).toBe('Network failure');
    expect(result.current.isShowDay).toBe(false);
  });
});
