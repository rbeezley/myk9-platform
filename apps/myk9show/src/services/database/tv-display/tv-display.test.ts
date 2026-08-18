import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';

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

// Shaped as `tv_board_entries` returns them: the dogs join happens server-side
// inside the SECURITY DEFINER function, so the dog arrives flattened rather than
// as a PostgREST embed (MYK9-65).
const activeEntryRows = [
  {
    id: 'entry-next',
    class_id: 'class-active',
    armband: '42',
    handler: 'J. Martinez',
    run_order: 2,
    is_in_ring: false,
    is_scored: false,
    dog_name: 'Luna Star',
    dog_call_name: 'Luna',
    dog_image_url: null,
  },
  {
    id: 'entry-ring',
    class_id: 'class-active',
    armband: '41',
    handler: 'S. Johnson',
    run_order: 9,
    is_in_ring: true,
    is_scored: true,
    dog_name: 'Comet Dash',
    dog_call_name: 'Comet',
    dog_image_url: null,
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

const COUNT_RPC_FAILURE = {
  data: null,
  error: { message: 'permission denied for function tv_class_entry_counts' },
};

/**
 * The board reads entries through two SECURITY DEFINER RPCs, never through the
 * `entries` table — that is the fix for MYK9-65, not an implementation detail.
 * Read as a plain table the counts and the running order both run under the
 * VIEWER's session, and `entries_select` is scoped to managed/handled/owned rows,
 * so a signed-in exhibitor watching a public screen saw only their own dogs and a
 * total of "3 / 2". Anything that routes these reads back through `from('entries')`
 * reintroduces that, which is why the table-call assertions below are exact.
 *
 * The fixtures deliberately keep a stale `total_entries_count: 10` on the class
 * row — a total that follows the count rather than that column is the original
 * point of the issue.
 */
function mockBoardRpcs(options: {
  entryCount?: number;
  scoredCount?: number;
  countFails?: boolean;
  entryRows?: typeof activeEntryRows;
}) {
  const { entryCount, scoredCount = 2, countFails = false, entryRows = [] } = options;
  mockSupabase.rpc.mockImplementation((name: string) => {
    if (name === 'tv_board_entries') return Promise.resolve({ data: entryRows, error: null });
    if (name === 'tv_class_entry_counts') {
      if (countFails) return Promise.resolve(COUNT_RPC_FAILURE);
      return Promise.resolve({
        data:
          entryCount === undefined
            ? []
            : [
                { class_id: 'class-active', entry_count: entryCount, scored_count: scoredCount },
                { class_id: 'class-done', entry_count: entryCount, scored_count: scoredCount },
              ],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

function mockActiveDisplayQueries(
  options: { entryCount?: number; scoredCount?: number; countFails?: boolean } = {}
) {
  const { entryCount = 4, scoredCount = 2, countFails = false } = options;
  mockBoardRpcs({ entryCount, scoredCount, countFails, entryRows: activeEntryRows });
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'shows') return createChainableQuery({ data: showRow, error: null });
    if (table === 'classes') return createChainableQuery({ data: activeClassRows, error: null });
    return createChainableQuery();
  });
}

function mockCompletedResultQueries(options: { entryCount?: number; countFails?: boolean } = {}) {
  const { entryCount = 20, countFails = false } = options;
  mockBoardRpcs({ entryCount, countFails });
  let resultsCall = 0;
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'classes') return createChainableQuery({ data: completedClassRows, error: null });
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

    // No `entries` table read: both entry reads go through the definer RPCs, so
    // the board renders the same numbers for anon and signed-in viewers alike.
    expect(mockSupabase.from.mock.calls.map(([table]) => table)).toEqual(['shows', 'classes']);
    expect(mockSupabase.rpc.mock.calls).toEqual([
      ['tv_board_entries', { p_show_id: 'show-1', p_class_ids: ['class-active'] }],
      ['tv_class_entry_counts', { p_show_id: 'show-1', p_class_ids: ['class-active'] }],
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
      // From the SAME RPC row as the total (2), NOT the class row's
      // scored_count (3). classes.scored_count is maintained without the
      // "expected to run" predicate, so mixing it with the filtered total can
      // render an impossible ratio like "3 / 2" (MYK9-65).
      scoredCount: 2,
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
      'view_public_entry_results',
      'view_public_entry_results',
    ]);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('tv_class_entry_counts', {
      p_show_id: 'show-1',
      p_class_ids: ['class-done'],
    });
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
      mockActiveDisplayQueries({ entryCount: 8, scoredCount: 3 });

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

    // `tv_class_entry_counts` drops an entry that was scored and only later
    // withdrawn/scratched/pulled, so the placements and qualified tally beside
    // the total have to drop it too. Otherwise the overlay credits a placement
    // to a dog that is no longer in the show, and the two numbers disagree —
    // the same count-disagreement MYK9-65 exists to end, on the results tab.
    it('drops entries withdrawn after scoring from placements and the qualified tally', async () => {
      mockBoardRpcs({ entryCount: 20 });
      let resultsCall = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'classes')
          return createChainableQuery({ data: completedClassRows, error: null });
        if (table === 'view_public_entry_results') {
          resultsCall += 1;
          return createChainableQuery({
            data:
              resultsCall === 1
                ? [{ ...placementRows[0], entry_status: 'withdrawn' }, placementRows[1]]
                : [{ ...qualifiedRows[0], check_in_status: 'pulled' }, ...qualifiedRows.slice(1)],
            error: null,
          });
        }
        return createChainableQuery();
      });

      const result = await getTVDisplayResults('show-1');

      // The withdrawn first place is gone; the runner-up survives untouched.
      expect(result[0].placements.map(p => p.placement)).toEqual([2]);
      // Three qualified rows, one of them pulled after scoring.
      expect(result[0].qualifiedCount).toBe(2);
    });
  });
});
