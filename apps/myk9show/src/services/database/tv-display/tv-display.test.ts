import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

import { getTVDisplayData, getTVDisplayResults } from '.';

const showRow = {
  id: 'show-1',
  name: 'Spring Trial 2026',
  start_date: '2026-04-01',
  end_date: '2026-04-02',
};

const activeClassRows = [
  {
    id: 'class-active',
    name: 'Novice A',
    element: 'Container',
    level: 'Novice',
    status: 'in_progress',
    total_entries_count: 10,
    scored_count: 3,
    start_time: '09:00',
    trials: { trial_date: '2026-04-01', trial_number: '1' },
    judge_assignments: [{ people: { first_name: 'John', last_name: 'Smith' } }],
  },
];

const activeEntryRows = [
  {
    id: 'entry-next',
    class_id: 'class-active',
    armband: '42',
    handler: 'J. Martinez',
    run_order: 2,
    is_in_ring: false,
    is_scored: false,
    dogs: {
      name: 'Luna Star',
      call_name: 'Luna',

      image_url: null,
    },
  },
  {
    id: 'entry-ring',
    class_id: 'class-active',
    armband: '41',
    handler: 'S. Johnson',
    run_order: 9,
    is_in_ring: true,
    is_scored: true,
    dogs: {
      name: 'Comet Dash',
      call_name: 'Comet',

      image_url: null,
    },
  },
];

const completedClassRows = [
  {
    id: 'class-done',
    name: 'Advanced',
    element: 'Interior',
    level: 'Advanced',
    total_entries_count: 20,
    judge_assignments: [{ people: { first_name: 'Alice', last_name: 'Smith' } }],
  },
];

const placementRows = [
  {
    id: 'entry-1',
    class_id: 'class-done',
    armband: '42',
    handler: 'J. Martinez',
    final_placement: 1,
    search_time_seconds: 35.1,
    total_score: 87.5,
    result_status: 'qualified',
    dog_name: 'Luna Star',
    dog_call_name: 'Luna',
    dog_image_url: null,
  },
  {
    id: 'entry-2',
    class_id: 'class-done',
    armband: '18',
    handler: 'S. Johnson',
    final_placement: 2,
    search_time_seconds: 38.2,
    total_score: null,
    result_status: 'qualified',
    dog_name: 'Comet Dash',
    dog_call_name: 'Comet',
    dog_image_url: null,
  },
];

const qualifiedRows = [
  { class_id: 'class-done', search_time_seconds: 35.1 },
  { class_id: 'class-done', search_time_seconds: 38.2 },
  { class_id: 'class-done', search_time_seconds: 40 },
];

const COUNT_QUERY_FAILURE = {
  count: null,
  error: { message: 'permission denied for table entries' },
};

/**
 * `entries` is hit twice per board refresh: once for the running order, then
 * once per class as an exact head count. The fixtures deliberately keep a stale
 * `total_entries_count: 10` on the class row — a total that follows the count
 * rather than that column is the whole point of MYK9-65.
 */
function mockActiveDisplayQueries(options: { entryCount?: number; countFails?: boolean } = {}) {
  const { entryCount = 4, countFails = false } = options;
  let entriesCall = 0;
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'shows') return createChainableQuery({ data: showRow, error: null });
    if (table === 'classes') return createChainableQuery({ data: activeClassRows, error: null });
    if (table === 'entries') {
      entriesCall += 1;
      if (entriesCall === 1) return createChainableQuery({ data: activeEntryRows, error: null });
      return createChainableQuery(
        countFails ? COUNT_QUERY_FAILURE : { count: entryCount, error: null }
      );
    }
    return createChainableQuery();
  });
}

function mockCompletedResultQueries(options: { entryCount?: number; countFails?: boolean } = {}) {
  const { entryCount = 20, countFails = false } = options;
  let resultsCall = 0;
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'classes') return createChainableQuery({ data: completedClassRows, error: null });
    if (table === 'entries') {
      return createChainableQuery(
        countFails ? COUNT_QUERY_FAILURE : { count: entryCount, error: null }
      );
    }
    // Results are read through the cascade-gated public view, not the raw table.
    if (table === 'view_public_entry_results') {
      resultsCall += 1;
      return createChainableQuery({
        data: resultsCall === 1 ? placementRows : qualifiedRows,
        error: null,
      });
    }
    return createChainableQuery();
  });
}

describe('tv-display database reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockSupabase();
  });

  it('reads active TV data through PostgREST for the public TV route', async () => {
    mockActiveDisplayQueries();

    const result = await getTVDisplayData('show-1');

    expect(mockSupabase.from.mock.calls.map(([table]) => table)).toEqual([
      'shows',
      'classes',
      'entries',
      'entries',
    ]);
    expect(result.show).toEqual({
      id: 'show-1',
      name: 'Spring Trial 2026',
      startDate: '2026-04-01',
      endDate: '2026-04-02',
    });
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]).toMatchObject({
      id: 'class-active',
      name: 'Novice A',
      judgeName: 'John Smith',
      // Counted entry rows (4), NOT the class row's stale total_entries_count (10).
      totalEntries: 4,
      scoredCount: 3,
      trialDate: '2026-04-01',
      trialNumber: 1,
    });
    expect(result.classes[0].entries.map(entry => entry.id)).toEqual(['entry-ring', 'entry-next']);
    expect(result.classes[0].entries[0].dog?.callName).toBe('Comet');
  });

  it('returns the show with an empty class list when no active classes are online', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'shows') return createChainableQuery({ data: showRow, error: null });
      if (table === 'classes') return createChainableQuery({ data: [], error: null });
      return createChainableQuery();
    });

    const result = await getTVDisplayData('show-1');

    expect(mockSupabase.from.mock.calls.map(([table]) => table)).toEqual(['shows', 'classes']);
    expect(result.show?.id).toBe('show-1');
    expect(result.classes).toEqual([]);
  });

  it('assembles completed TV results from PostgREST placement and qualified rows', async () => {
    mockCompletedResultQueries();

    const result = await getTVDisplayResults('show-1');

    expect(mockSupabase.from.mock.calls.map(([table]) => table)).toEqual([
      'classes',
      'entries',
      'view_public_entry_results',
      'view_public_entry_results',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'class-done',
      name: 'Advanced',
      judgeName: 'Alice Smith',
      totalEntries: 20,
      qualifiedCount: 3,
      fastestTime: 35.1,
    });
    expect(result[0].placements.map(placement => placement.placement)).toEqual([1, 2]);
    expect(result[0].placements[0].totalScore).toBe(87.5);
    expect(result[0].placements[0].dog?.name).toBe('Luna Star');
  });

  // MYK9-65. classes.total_entries_count has no maintaining trigger and is 0 for
  // every class in the database, while scored_count IS advanced by scoring — so
  // reading it published "3 / 0" to the venue board. These pin the total to the
  // canonical entry rows so the column can never creep back in.
  describe('canonical entry counts (MYK9-65)', () => {
    it('never asks for the unmaintained class snapshot column', async () => {
      mockActiveDisplayQueries();
      await getTVDisplayData('show-1');
      mockCompletedResultQueries();
      await getTVDisplayResults('show-1');

      const selects = mockSupabase.from.mock.results
        .flatMap(result => (result.value as { select?: { mock: { calls: unknown[][] } } }).select)
        .flatMap(select => select?.mock.calls ?? [])
        .map(([columns]) => String(columns));

      expect(selects.some(columns => columns.includes('total_entries_count'))).toBe(false);
    });

    it('reports a scored class with a zero snapshot at its true entry total', async () => {
      // The exact reproduction: 3 scored, snapshot 0 — the board must not say "3 / 0".
      mockActiveDisplayQueries({ entryCount: 8 });

      const result = await getTVDisplayData('show-1');

      expect(result.classes[0].totalEntries).toBe(8);
      expect(result.classes[0].scoredCount).toBe(3);
    });

    it('counts a genuinely empty class as zero once the count query succeeds', async () => {
      mockActiveDisplayQueries({ entryCount: 0 });

      const result = await getTVDisplayData('show-1');

      expect(result.classes[0].totalEntries).toBe(0);
    });

    it('reports the total as unavailable rather than zero when the count fails', async () => {
      mockActiveDisplayQueries({ countFails: true });

      const result = await getTVDisplayData('show-1');

      // null, never 0 — TVClassCard suppresses the counter, so an unreachable
      // database shows nothing instead of a confident wrong number.
      expect(result.classes[0].totalEntries).toBeNull();
      expect(result.classes[0].id).toBe('class-active');
    });

    it('applies the same contract to finalized result classes', async () => {
      mockCompletedResultQueries({ entryCount: 12 });

      const result = await getTVDisplayResults('show-1');

      expect(result[0].totalEntries).toBe(12);
    });

    it('reports finalized totals as unavailable when the count fails', async () => {
      mockCompletedResultQueries({ countFails: true });

      const result = await getTVDisplayResults('show-1');

      expect(result[0].totalEntries).toBeNull();
      expect(result[0].qualifiedCount).toBe(3);
    });
  });
});
