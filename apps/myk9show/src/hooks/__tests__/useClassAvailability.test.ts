import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useClassAvailability } from '../useClassAvailability';

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// classes: .select().eq().order()
function makeClassQuery(data: unknown[] | null, error: unknown = null) {
  const order = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  return { select };
}

/**
 * What an exhibitor's session actually gets back from `entries` for a class
 * filled by OTHER exhibitors: nothing. The entries RLS returns only rows the
 * caller handles or whose dog they own (MYK9-705), and
 * myk9_705_656_class_entry_availability_test.sql proves that against the real
 * policies. Any chain shape resolves to the empty set.
 */
function makeExhibitorRlsEntriesQuery() {
  const result = Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'is', 'eq']) {
    chain[method] = vi.fn(() => Object.assign(result, chain));
  }
  chain.single = vi.fn(() =>
    Promise.resolve({ data: { default_judge_day_capacity: 125 }, error: null })
  );
  return chain;
}

const CLASS_DATA = [
  {
    id: 'c1',
    name: 'Handler Discrimination Advanced',
    element: 'Handler Discrimination',
    level: 'Advanced',
    section: null,
    status: 'upcoming',
    max_entries: 1,
    allow_waitlist: false,
    trial_id: 't1',
    trials: { id: 't1', name: 'Trial 1', date: '2026-10-10', show_id: 'show-1' },
  },
];

interface AvailabilityRow {
  class_id: string;
  entry_count: number;
  waitlist_count: number;
  has_started: boolean;
  class_full: boolean;
  judge_id: string | null;
  judge_day_available: number | null;
  judge_day_full: boolean;
  allow_waitlist: boolean;
  self_service_block: string | null;
}

function row(overrides: Partial<AvailabilityRow> = {}): AvailabilityRow {
  return {
    class_id: 'c1',
    entry_count: 0,
    waitlist_count: 0,
    has_started: false,
    class_full: false,
    judge_id: null,
    judge_day_available: null,
    judge_day_full: false,
    allow_waitlist: false,
    self_service_block: null,
    ...overrides,
  };
}

function serve(rows: AvailabilityRow[] | null, rpcError: unknown = null, classes = CLASS_DATA) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'classes') return makeClassQuery(classes);
    // Everything else an exhibitor could read directly returns what it would:
    // no wait-list rows of other people, and the show's own settings.
    return makeExhibitorRlsEntriesQuery();
  });
  mockRpc.mockResolvedValue({ data: rows, error: rpcError });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

async function renderFor(showId: string | undefined) {
  const hook = renderHook(() => useClassAvailability(showId), { wrapper: createWrapper() });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook.result;
}

describe('useClassAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty state when showId is undefined', () => {
    const { result } = renderHook(() => useClassAvailability(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.classes).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("reads a class filled by other exhibitors as full, although the exhibitor's RLS returns none of its entries (MYK9-705)", async () => {
    serve([row({ entry_count: 1, class_full: true, self_service_block: 'full' })]);

    const result = await renderFor('show-1');

    expect(mockRpc).toHaveBeenCalledWith('get_show_class_availability', { p_show_id: 'show-1' });
    const cls = result.current.classes[0]!;
    expect(cls.currentEntries).toBe(1);
    expect(cls.isFull).toBe(true);
    expect(cls.judgeDayFull).toBe(false);
    expect(cls.spotsAvailable).toBe(0);
    expect(cls.allowsWaitlist).toBe(false);
  });

  it('reads a judge day filled by other exhibitors as full (MYK9-705)', async () => {
    serve([
      row({
        entry_count: 0,
        judge_id: 'judge-1',
        judge_day_available: 0,
        judge_day_full: true,
        self_service_block: 'full',
      }),
    ]);

    const result = await renderFor('show-1');

    const cls = result.current.classes[0]!;
    expect(cls.judgeId).toBe('judge-1');
    expect(cls.judgeDayFull).toBe(true);
    expect(cls.judgeDayAvailable).toBe(0);
    expect(cls.isFull).toBe(true);
    expect(cls.spotsAvailable).toBe(0);
  });

  it('reports open judge-day room as the spots left', async () => {
    serve([row({ entry_count: 2, judge_id: 'judge-1', judge_day_available: 103 })]);

    const result = await renderFor('show-1');

    const cls = result.current.classes[0]!;
    expect(cls.isFull).toBe(false);
    expect(cls.spotsAvailable).toBe(103);
  });

  it('keeps wait-list permission separate from the fullness decision', async () => {
    serve([row({ entry_count: 1, class_full: true, allow_waitlist: true, waitlist_count: 3 })]);

    const result = await renderFor('show-1');

    const cls = result.current.classes[0]!;
    expect(cls.isFull).toBe(true);
    expect(cls.allowsWaitlist).toBe(true);
    expect(cls.hasWaitlist).toBe(true);
    expect(cls.waitlistCount).toBe(3);
  });

  it('reports a class another exhibitor has in the ring as started', async () => {
    serve([row({ has_started: true, self_service_block: 'started' })]);

    const result = await renderFor('show-1');

    expect(result.current.classes[0]!.hasStarted).toBe(true);
  });

  it('fails rather than reading every class as open when the server returns no counts', async () => {
    serve([]);

    const result = await renderFor('show-1');

    expect(result.current.classes).toEqual([]);
    expect(result.current.error).toMatch(/availability/i);
  });

  it('returns empty classes when the show has no classes', async () => {
    serve([], null, []);

    const result = await renderFor('show-1');

    expect(result.current.classes).toEqual([]);
    expect(result.current.fullClasses).toBe(0);
    expect(result.current.totalSpotsAvailable).toBe(0);
  });

  it('sets error when the class fetch fails', async () => {
    mockFrom.mockImplementation(() => makeClassQuery(null, { message: 'network error' }));

    const result = await renderFor('show-1');

    expect(result.current.error).toBe('network error');
  });

  it('sets error when the availability read fails', async () => {
    serve(null, { message: 'availability network error' });

    const result = await renderFor('show-1');

    expect(result.current.error).toBe('availability network error');
  });
});
