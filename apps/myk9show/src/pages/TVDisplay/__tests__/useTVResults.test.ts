import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useTVResults } from '../useTVResults';
import { supabase } from '@/services/database/supabaseClient';
import { createChainableQuery } from '@/test/mocks/supabase';

vi.mock('@/services/database/supabaseClient');

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper };
}

const mockFinalizedClass = {
  id: 'class-done',
  name: 'Advanced',
  element: 'Interior',
  level: 'Advanced',
  total_entries_count: 20,
  is_scoring_finalized: true,
  trials: { show_id: 'show-1' },
  judge_assignments: [{ people: { first_name: 'Alice', last_name: 'Smith' } }],
};

const mockPlacements = [
  {
    id: 'e1',
    class_id: 'class-done',
    armband: '42',
    handler: 'J. Martinez',
    final_placement: 1,
    search_time_seconds: 35.1,
    total_score: null,
    result_status: 'qualified',
    dogs: { name: 'Luna Star', call_name: 'Luna', breed: 'Labrador', image_url: null },
  },
  {
    id: 'e2',
    class_id: 'class-done',
    armband: '18',
    handler: 'S. Johnson',
    final_placement: 2,
    search_time_seconds: 38.2,
    total_score: null,
    result_status: 'qualified',
    dogs: { name: 'Rex', call_name: 'Rex', breed: 'GSD', image_url: null },
  },
];

const mockQualifiedEntries = [
  { class_id: 'class-done', search_time_seconds: 35.1 },
  { class_id: 'class-done', search_time_seconds: 38.2 },
  { class_id: 'class-done', search_time_seconds: 40.0 },
];

/**
 * The entries table is queried twice:
 * 1) placements: .select().in().gte().lte().order() → mockPlacements
 * 2) qualified:  .select().in().eq()                → mockQualifiedEntries
 *
 * We track call order via a counter on `from('entries')` calls.
 */
function setupHappyPathMocks() {
  let entriesCallCount = 0;

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'classes') {
      return createChainableQuery({ data: [mockFinalizedClass], error: null }) as never;
    }
    if (table === 'entries') {
      entriesCallCount++;
      if (entriesCallCount === 1) {
        // placements query — resolves mockPlacements
        return createChainableQuery({ data: mockPlacements, error: null }) as never;
      }
      // qualified query — resolves mockQualifiedEntries
      return createChainableQuery({ data: mockQualifiedEntries, error: null }) as never;
    }
    return createChainableQuery() as never;
  });
}

describe('useTVResults', () => {
  beforeEach(() => {
    setupHappyPathMocks();
  });

  it('fetches finalized classes with top placements and dog info', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVResults('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.completedClasses).toHaveLength(1);
    const cls = result.current.completedClasses[0];
    expect(cls.id).toBe('class-done');
    expect(cls.name).toBe('Advanced');
    expect(cls.element).toBe('Interior');
    expect(cls.level).toBe('Advanced');
    expect(cls.judgeName).toBe('Alice Smith');
    expect(cls.totalEntries).toBe(20);
  });

  it('maps placement dog info via mapDogInfo', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVResults('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const cls = result.current.completedClasses[0];
    expect(cls.placements).toHaveLength(2);

    const first = cls.placements[0];
    expect(first.placement).toBe(1);
    expect(first.armband).toBe('42');
    expect(first.handler).toBe('J. Martinez');
    expect(first.searchTime).toBe(35.1);
    expect(first.dog?.name).toBe('Luna Star');
    expect(first.dog?.callName).toBe('Luna');
    expect(first.dog?.breed).toBe('Labrador');

    const second = cls.placements[1];
    expect(second.placement).toBe(2);
    expect(second.dog?.callName).toBe('Rex');
  });

  it('computes qualifiedCount and fastestTime from qualified entries', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVResults('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const cls = result.current.completedClasses[0];
    expect(cls.qualifiedCount).toBe(3);
    expect(cls.fastestTime).toBe(35.1);
  });

  it('returns empty array when no finalized classes found', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'classes') {
        return createChainableQuery({ data: [], error: null }) as never;
      }
      return createChainableQuery() as never;
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVResults('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.completedClasses).toEqual([]);
  });

  it('returns empty array when class query errors', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'classes') {
        return createChainableQuery({ data: null, error: { message: 'DB error' } }) as never;
      }
      return createChainableQuery() as never;
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVResults('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.completedClasses).toEqual([]);
  });

  it('does not run query when showId is empty', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVResults(''), { wrapper: Wrapper });

    // Query is disabled — loading stays false, no data
    expect(result.current.completedClasses).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('filters by trialId when provided', async () => {
    // eqSpy returns itself so all chained .eq() calls are captured by the same spy
    const chainable: Record<string, unknown> = {};
    const eqSpy = vi.fn().mockReturnValue(chainable);
    chainable.select = vi.fn().mockReturnValue(chainable);
    chainable.eq = eqSpy;
    chainable.in = vi.fn().mockResolvedValue({ data: [], error: null });
    // Make it thenable so awaiting the chain works
    chainable.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'classes') {
        return chainable as never;
      }
      return createChainableQuery() as never;
    });

    const { Wrapper } = makeWrapper();
    renderHook(() => useTVResults('show-1', 'trial-abc'), { wrapper: Wrapper });

    await waitFor(() => expect(eqSpy).toHaveBeenCalledWith('trial_id', 'trial-abc'));
  });
});
