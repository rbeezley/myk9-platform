import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '@/services/database/supabaseClient';
import {
  useClassReleasedResults,
  mapReleasedResultRow,
} from '@/hooks/queries/useClassReleasedResults';

const mockFrom = vi.mocked(supabase.from);

const CLASS_ID = 'class-1';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    class_id: CLASS_ID,
    show_id: 'show-1',
    dog_id: 'dog-1',
    handler_id: 'handler-1',
    armband: '101',
    handler: 'Sarah',
    result_status: 'qualified',
    is_scored: true,
    search_time_seconds: 38.2,
    total_faults: 0,
    final_placement: 1,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: '2026-06-16T00:00:00Z',
    check_in_status: 'completed',
    run_order: 2,
    created_at: null,
    updated_at: null,
    dog_name: 'Magnolia',
    dog_call_name: 'Maggie',
    dog_breed: 'Labrador',
    ...overrides,
  };
}

/** Build the chained `.select().eq().eq().order().order()` mock. */
function mockQuery(rows: Record<string, unknown>[]) {
  const result = { data: rows, error: null };
  const order2 = vi.fn().mockResolvedValue(result);
  const order1 = vi.fn().mockReturnValue({ order: order2 });
  const eq2 = vi.fn().mockReturnValue({ order: order1 });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  mockFrom.mockReturnValue({ select } as unknown as ReturnType<typeof supabase.from>);
  return { select, eq1, eq2 };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('mapReleasedResultRow', () => {
  it('maps a qualified row into raw + display shapes', () => {
    const { raw, entry } = mapReleasedResultRow(makeRow());

    expect(raw.id).toBe('entry-1');
    expect(raw.is_scored).toBe(true);
    expect(raw.result_status).toBe('qualified');
    expect(raw.final_placement).toBe(1);
    expect(raw.search_time_seconds).toBe(38.2);
    expect(raw.dog?.call_name).toBe('Maggie');
    expect(raw.dog?.breed).toBe('Labrador');

    expect(entry.status).toBe('Qualified');
    expect(entry.placement).toBe('1');
    expect(entry.time).toBe('0:38.20');
    expect(entry.dog).toBe('Maggie');
    expect(entry.armband).toBe('101');
  });

  it('maps an NQ row to "Not Qualified" with empty placement', () => {
    const { entry } = mapReleasedResultRow(
      makeRow({ result_status: 'nq', final_placement: null, search_time_seconds: null })
    );
    expect(entry.status).toBe('Not Qualified');
    expect(entry.placement).toBe('');
    expect(entry.time).toBe('');
  });
});

describe('useClassReleasedResults', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not query when results are not released', () => {
    mockQuery([]);
    const { result } = renderHook(() => useClassReleasedResults(CLASS_ID, null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isReleased).toBe(false);
    expect(result.current.rawEntries).toEqual([]);
    expect(result.current.entryData).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not query when classId is undefined', () => {
    mockQuery([]);
    renderHook(() => useClassReleasedResults(undefined, '2026-06-16T00:00:00Z'), {
      wrapper: createWrapper(),
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('reads released results directly, filtered by class_id and is_scored', async () => {
    const { eq1, eq2 } = mockQuery([makeRow()]);

    const { result } = renderHook(
      () => useClassReleasedResults(CLASS_ID, '2026-06-16T00:00:00Z'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.rawEntries).toHaveLength(1));

    expect(mockFrom).toHaveBeenCalledWith('view_public_entry_results');
    expect(eq1).toHaveBeenCalledWith('class_id', CLASS_ID);
    expect(eq2).toHaveBeenCalledWith('is_scored', true);

    expect(result.current.entryData[0].status).toBe('Qualified');
    expect(result.current.entryData[0].placement).toBe('1');
    expect(result.current.rawEntries[0].dog?.call_name).toBe('Maggie');
  });
});
