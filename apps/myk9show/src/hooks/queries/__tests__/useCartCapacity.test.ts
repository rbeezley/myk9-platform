/**
 * MYK9-753: the /cart wait-list/pay split reads fullness from the server's
 * availability read (`get_show_class_availability`), never from a count of the
 * `entries` rows the exhibitor's RLS returns. Those are only the exhibitor's own
 * entries, so a class or judge day filled by OTHER exhibitors used to look
 * payable, went to Stripe, and was refunded by the webhook's overflow path.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCartCapacity } from '../useCartCapacity';
import { buildCartFulfillmentView } from '@/features/payments/cartFulfillmentView';
import type { CartItemWithDetails } from '@/store/cartStore';

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function makeClassQuery(data: unknown[]) {
  const order = vi.fn().mockResolvedValue({ data, error: null });
  const eq = vi.fn().mockReturnValue({ order });
  return { select: vi.fn().mockReturnValue({ eq }) };
}

/** What the exhibitor's own session gets from `entries`: none of the other exhibitors' rows. */
function makeExhibitorRlsEntriesQuery() {
  const result = Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'is', 'eq']) {
    chain[method] = vi.fn(() => Object.assign(result, chain));
  }
  return chain;
}

function classRow(id: string, maxEntries: number, allowWaitlist: boolean) {
  return {
    id,
    name: `Class ${id}`,
    element: 'Container',
    level: 'Novice',
    section: null,
    status: 'upcoming',
    max_entries: maxEntries,
    allow_waitlist: allowWaitlist,
    trial_id: 't1',
    trials: { id: 't1', name: 'Trial 1', date: '2026-10-10', show_id: 'show-1' },
  };
}

function availability(classId: string, overrides: Record<string, unknown> = {}) {
  return {
    class_id: classId,
    entry_count: 0,
    waitlist_count: 0,
    has_started: false,
    class_full: false,
    judge_id: null,
    judge_day_available: null,
    judge_day_full: false,
    allow_waitlist: true,
    self_service_block: null,
    ...overrides,
  };
}

function cartItem(id: string, classId: string, allowWaitlist = true): CartItemWithDetails {
  return {
    id,
    class_id: classId,
    entry_id: null,
    entry_fee_cents: 3000,
    class: { name: `Class ${classId}`, allow_waitlist: allowWaitlist },
  } as unknown as CartItemWithDetails;
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

async function renderFor(showId: string | undefined) {
  const hook = renderHook(() => useCartCapacity(showId), { wrapper: createWrapper() });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook.result;
}

describe('useCartCapacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled with no show and asks nothing', () => {
    const { result } = renderHook(() => useCartCapacity(undefined), { wrapper: createWrapper() });
    expect(result.current.judgeDays).toEqual([]);
    expect(result.current.fullClassIds).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("routes a class filled by other exhibitors to the wait list before Pay, though the exhibitor's RLS returns none of its entries", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'classes'
        ? makeClassQuery([classRow('c-full', 10, true), classRow('c-open', 10, true)])
        : makeExhibitorRlsEntriesQuery()
    );
    mockRpc.mockResolvedValue({
      data: [
        availability('c-full', { entry_count: 10, class_full: true }),
        availability('c-open', { entry_count: 2 }),
      ],
      error: null,
    });

    const result = await renderFor('show-1');

    expect(mockRpc).toHaveBeenCalledWith('get_show_class_availability', { p_show_id: 'show-1' });
    // No client-side recount: the entries table is never read.
    expect(mockFrom).not.toHaveBeenCalledWith('entries');
    expect(result.current.fullClassIds).toEqual(['c-full']);

    const view = buildCartFulfillmentView(
      [cartItem('i1', 'c-full'), cartItem('i2', 'c-open')],
      result.current.judgeDays,
      result.current.fullClassIds
    );
    expect(view.fulfillmentByItemId).toEqual({ i1: 'waitlist', i2: 'payable' });
  });

  it('holds back a judge day filled by other exhibitors, and counts the cart against what is left of it', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'classes'
        ? makeClassQuery([
            classRow('c-a', 0, true),
            classRow('c-b', 0, false),
            classRow('c-c', 0, true),
          ])
        : makeExhibitorRlsEntriesQuery()
    );
    mockRpc.mockResolvedValue({
      data: [
        // Judge J1's day has one self-service spot left, shared by c-a and c-c.
        availability('c-a', { judge_id: 'j1', judge_day_available: 1 }),
        availability('c-c', { judge_id: 'j1', judge_day_available: 1 }),
        // Judge J2's day is full; c-b takes no wait list.
        availability('c-b', {
          judge_id: 'j2',
          judge_day_available: 0,
          judge_day_full: true,
          allow_waitlist: false,
          self_service_block: 'full',
        }),
      ],
      error: null,
    });

    const result = await renderFor('show-1');

    expect(result.current.judgeDays).toEqual(
      expect.arrayContaining([
        { judgeId: 'j1', showDate: '2026-10-10', availableSpots: 1, classIds: ['c-a', 'c-c'] },
        { judgeId: 'j2', showDate: '2026-10-10', availableSpots: 0, classIds: ['c-b'] },
      ])
    );

    const view = buildCartFulfillmentView(
      [cartItem('i1', 'c-a'), cartItem('i2', 'c-c'), cartItem('i3', 'c-b', false)],
      result.current.judgeDays,
      result.current.fullClassIds
    );
    expect(view.fulfillmentByItemId).toEqual({ i1: 'payable', i2: 'waitlist', i3: 'blocked' });
  });

  it('reports the read as failed, never as open, when the server returns no counts for a visible class', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'classes'
        ? makeClassQuery([classRow('c1', 10, true)])
        : makeExhibitorRlsEntriesQuery()
    );
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await renderFor('show-1');

    expect(result.current.error).toMatch(/could not be read/);
    expect(result.current.fullClassIds).toEqual([]);
  });

  it('returns the fresh split facts from refetch, for the submit-time re-check', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'classes'
        ? makeClassQuery([classRow('c1', 1, true)])
        : makeExhibitorRlsEntriesQuery()
    );
    mockRpc.mockResolvedValueOnce({ data: [availability('c1')], error: null });

    const result = await renderFor('show-1');
    expect(result.current.fullClassIds).toEqual([]);

    mockRpc.mockResolvedValueOnce({
      data: [availability('c1', { entry_count: 1, class_full: true })],
      error: null,
    });
    const fresh = await result.current.refetch();

    expect(fresh.isError).toBe(false);
    expect(fresh.data?.fullClassIds).toEqual(['c1']);
  });
});
