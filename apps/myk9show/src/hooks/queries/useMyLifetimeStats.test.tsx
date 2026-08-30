import { createElement, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';
import { useMyLifetimeStats } from './useMyLifetimeStats';

const { mockFrom, mockUseDogsQuery } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockUseDogsQuery: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('./useDogsDatabase', () => ({
  useDogsQuery: mockUseDogsQuery,
}));

interface ResultRow {
  id: string;
  dog_id: string;
  dog_call_name: string;
  show_id: string;
  class_id: string;
  class_name: string;
  class_element: string;
  class_level: string;
  result_text: 'Q' | null;
  search_time_seconds: number | null;
  total_faults: number | null;
  final_placement: number | null;
  show_name: string;
  show_start_date: string;
  show_organization: string;
  created_at: string;
}

function makeRow(index: number, overrides: Partial<ResultRow> = {}): ResultRow {
  return {
    id: `entry-${String(index).padStart(4, '0')}`,
    dog_id: 'dog-1',
    dog_call_name: 'Willow',
    show_id: 'show-1',
    class_id: 'class-1',
    class_name: 'Container Novice A',
    class_element: 'Container',
    class_level: 'Novice',
    result_text: null,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    show_name: 'Heartland Scent Work Classic',
    show_start_date: '2026-07-31',
    show_organization: 'AKC',
    created_at: '2026-08-29T01:21:41.177426+00:00',
    ...overrides,
  };
}

function createPagedQuery(pages: ResultRow[][], errorPage?: number) {
  let cursor: string | undefined;
  const query = {
    select: vi.fn(),
    in: vi.fn(),
    gt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.gt.mockImplementation((_column: string, value: string) => {
    cursor = value;
    return query;
  });
  query.order.mockReturnValue(query);
  query.limit.mockImplementation(async () => {
    const pageIndex = cursor === undefined ? 0 : 1;
    if (pageIndex === errorPage) {
      return { data: null, error: new Error('results page unavailable') };
    }
    return { data: pages[pageIndex] ?? [], error: null };
  });

  return query;
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: createTestQueryClient() }, children);
}

describe('useMyLifetimeStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDogsQuery.mockReturnValue({ data: [{ id: 'dog-1' }] });
  });

  it('returns lifetime entries beyond the PostgREST response cap', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => makeRow(index));
    const secondPage = [
      makeRow(1000),
      makeRow(1001, {
        dog_call_name: 'Scout',
        result_text: 'Q',
        search_time_seconds: 41.2,
        total_faults: 0,
        final_placement: 2,
      }),
    ];
    const query = createPagedQuery([firstPage, secondPage]);
    mockFrom.mockReturnValue(query);

    const { result } = renderHook(() => useMyLifetimeStats(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const entries = result.current.data;

    expect(entries).toHaveLength(1002);
    expect(entries?.find(entry => entry.id === 'entry-1001')).toMatchObject({
      dogCallName: 'Scout',
      resultText: 'Q',
      searchTimeSeconds: 41.2,
      totalFaults: 0,
      finalPlacement: 2,
    });
    expect(query.gt).toHaveBeenCalledWith('id', 'entry-0999');
    expect(query.order).toHaveBeenCalledTimes(2);
    expect(query.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(query.limit).toHaveBeenCalledTimes(2);
    expect(query.limit).toHaveBeenCalledWith(1000);
  });

  it('rejects when a later page fails instead of returning partial lifetime statistics', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => makeRow(index));
    mockFrom.mockReturnValue(createPagedQuery([firstPage], 1));

    const { result } = renderHook(() => useMyLifetimeStats(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('results page unavailable'));
    expect(result.current.data).toBeUndefined();
  });

  it('returns no entries without reading the database when the exhibitor has no dogs', async () => {
    mockUseDogsQuery.mockReturnValue({ data: [] });

    const { result } = renderHook(() => useMyLifetimeStats(), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns newest entries first with entry ID as the deterministic timestamp tie-breaker', async () => {
    mockFrom.mockReturnValue(
      createPagedQuery([
        [
          makeRow(1, { created_at: '2026-08-28T12:00:00+00:00' }),
          makeRow(2, { created_at: '2026-08-29T12:00:00+00:00' }),
          makeRow(3, { created_at: '2026-08-29T12:00:00+00:00' }),
        ],
      ])
    );

    const { result } = renderHook(() => useMyLifetimeStats(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map(entry => entry.id)).toEqual([
      'entry-0003',
      'entry-0002',
      'entry-0001',
    ]);
  });
});
