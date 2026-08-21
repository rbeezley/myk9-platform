import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const inFilter = vi.fn();
const refundedEntriesRange = vi.fn();
const refundedEntriesOrder = vi.fn();
const refundedEntriesQuery = {
  order: refundedEntriesOrder,
  range: refundedEntriesRange,
};
refundedEntriesOrder.mockImplementation(() => refundedEntriesQuery);
const refundedEntriesLt = vi.fn(() => ({ order: refundedEntriesOrder }));
const refundedEntriesGte = vi.fn(() => ({ lt: refundedEntriesLt }));
const entriesSelect = vi.fn((columns: string) =>
  columns === 'id' ? { gte: refundedEntriesGte } : { in: inFilter }
);
const stripeOrdersRange = vi.fn();
const stripeOrdersOrder = vi.fn();
const stripeOrdersQuery = {
  order: stripeOrdersOrder,
  or: vi.fn(() => stripeOrdersQuery),
  overlaps: vi.fn(() => stripeOrdersQuery),
  range: stripeOrdersRange,
};
stripeOrdersOrder.mockImplementation(() => stripeOrdersQuery);
const stripeOrdersSelect = vi.fn(() => ({ order: stripeOrdersOrder }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) =>
      table === 'entries' ? { select: entriesSelect } : { select: stripeOrdersSelect },
  },
}));

import { useMyPaymentYears, useMyPayments } from './useMyPayments';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useMyPayments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inFilter.mockResolvedValue({ data: [], error: null });
    refundedEntriesRange.mockResolvedValue({ data: [], error: null });
    stripeOrdersRange.mockResolvedValue({ data: [], error: null });
  });

  it('maps stripe_orders rows to MyPayment, preferring paid_at for the date', async () => {
    stripeOrdersRange.mockResolvedValue({
      data: [
        {
          id: 'o1',
          amount_cents: 5300,
          currency: 'usd',
          status: 'succeeded',
          paid_at: '2026-06-10T00:00:00Z',
          created_at: '2026-06-09T00:00:00Z',
          stripe_payment_intent_id: 'pi_1',
          entry_ids: ['e1', 'e2'],
          show_id: 'show-1',
          show: { name: 'Spring Trial' },
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useMyPayments(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      {
        id: 'o1',
        date: '2026-06-10T00:00:00Z',
        showId: 'show-1',
        showName: 'Spring Trial',
        amountCents: 5300,
        netPaidCents: 5300,
        currency: 'usd',
        status: 'succeeded',
        reference: 'pi_1',
        refundedAt: null,
        entryIds: ['e1', 'e2'],
        refunds: [],
      },
    ]);
  });

  it('falls back to created_at and null show when fields are missing', async () => {
    stripeOrdersRange.mockResolvedValue({
      data: [
        {
          id: 'o2',
          amount_cents: 499,
          currency: null,
          status: 'succeeded',
          paid_at: null,
          created_at: '2026-06-01T00:00:00Z',
          stripe_payment_intent_id: null,
          entry_ids: null,
          show_id: null,
          show: null,
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useMyPayments(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({
      date: '2026-06-01T00:00:00Z',
      showId: null,
      showName: null,
      netPaidCents: 499,
      currency: 'usd',
      reference: null,
      entryIds: [],
      refunds: [],
    });
  });

  it('propagates a query error', async () => {
    stripeOrdersRange.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useMyPayments(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('subtracts linked entry refunds even when the stripe order still says succeeded', async () => {
    stripeOrdersRange.mockResolvedValue({
      data: [
        {
          id: 'o3',
          amount_cents: 5300,
          currency: 'usd',
          status: 'succeeded',
          paid_at: '2026-06-10T00:00:00Z',
          created_at: '2026-06-09T00:00:00Z',
          stripe_payment_intent_id: 'pi_3',
          entry_ids: ['e1', 'e2'],
          show: { name: 'Spring Trial' },
        },
      ],
      error: null,
    });
    inFilter.mockResolvedValue({
      data: [
        {
          id: 'e1',
          refund_amount: 30,
          refunded_at: '2026-06-12T00:00:00Z',
          dogs: { call_name: 'Copper' },
          classes: { name: 'Advanced A' },
        },
        { id: 'e2', refund_amount: null, refunded_at: null, dogs: null, classes: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMyPayments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(entriesSelect).toHaveBeenCalledWith(
      'id, refund_amount, refunded_at, dogs(call_name), classes(name)'
    );
    expect(inFilter).toHaveBeenCalledWith('id', ['e1', 'e2']);
    expect(result.current.data?.[0]).toMatchObject({
      amountCents: 5300,
      netPaidCents: 2300,
      status: 'succeeded',
      refunds: [
        {
          entryId: 'e1',
          amountCents: 3000,
          date: '2026-06-12T00:00:00Z',
          label: 'Copper - Advanced A',
        },
      ],
    });
  });

  it('pages the all-time order query instead of silently truncating payment history', async () => {
    const tiedCreatedAt = '2026-06-09T00:00:00Z';
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `o${String(101 - index).padStart(3, '0')}`,
      amount_cents: 100,
      currency: 'usd',
      status: 'succeeded',
      paid_at: '2026-06-10T00:00:00Z',
      refunded_at: null,
      created_at: tiedCreatedAt,
      stripe_payment_intent_id: `pi_${index}`,
      entry_ids: [],
      show_id: null,
      show: null,
    }));
    stripeOrdersRange
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({
        data: [
          {
            ...firstPage[0],
            id: 'o001',
            stripe_payment_intent_id: 'pi_101',
          },
        ],
        error: null,
      });

    const { result } = renderHook(() => useMyPayments(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(stripeOrdersRange).toHaveBeenNthCalledWith(1, 0, 99);
    expect(stripeOrdersRange).toHaveBeenNthCalledWith(2, 100, 199);
    expect(stripeOrdersOrder.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(new Set(result.current.data?.map(payment => payment.id)).size).toBe(101);
  });

  it('uses a deterministic refunded-at/id order across tied refund page boundaries', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `e${String(101 - index).padStart(3, '0')}`,
    }));
    refundedEntriesRange
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [{ id: 'e001' }], error: null });

    const { result } = renderHook(() => useMyPayments('2026'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(refundedEntriesRange).toHaveBeenNthCalledWith(1, 0, 99);
    expect(refundedEntriesRange).toHaveBeenNthCalledWith(2, 100, 199);
    expect(refundedEntriesOrder.mock.calls).toEqual([
      ['refunded_at', { ascending: false }],
      ['id', { ascending: false }],
      ['refunded_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(stripeOrdersQuery.overlaps).toHaveBeenCalledTimes(2);
  });

  it('loads bounded all-history year metadata without fetching money amounts', async () => {
    stripeOrdersRange.mockResolvedValueOnce({
      data: [
        {
          id: 'o-meta',
          paid_at: '2026-06-10T00:00:00Z',
          refunded_at: null,
          created_at: '2026-06-09T00:00:00Z',
          entry_ids: ['e-meta'],
        },
      ],
      error: null,
    });
    inFilter.mockResolvedValueOnce({
      data: [{ id: 'e-meta', refunded_at: '2025-12-31T12:00:00Z' }],
      error: null,
    });

    const { result } = renderHook(() => useMyPaymentYears(true), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(stripeOrdersSelect).toHaveBeenCalledWith(
      'id, paid_at, refunded_at, created_at, entry_ids'
    );
    expect(stripeOrdersRange).toHaveBeenCalledWith(0, 99);
    expect(inFilter).toHaveBeenCalledWith('id', ['e-meta']);
    expect(result.current.data).toEqual(['2026', '2025']);
  });

  it('applies the selected local year as a server-side order range', async () => {
    stripeOrdersRange.mockResolvedValueOnce({
      data: [
        {
          id: 'o-year',
          amount_cents: 100,
          currency: 'usd',
          status: 'succeeded',
          paid_at: '2026-01-01T12:00:00Z',
          refunded_at: null,
          created_at: '2026-01-01T12:00:00Z',
          stripe_payment_intent_id: 'pi_year',
          entry_ids: [],
          show_id: null,
          show: null,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMyPayments('2026'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(stripeOrdersQuery.or).toHaveBeenCalledOnce();
    const predicate = (stripeOrdersQuery.or.mock.calls as unknown as Array<[string]>)[0][0];
    expect(predicate).toContain('paid_at.gte.');
    expect(predicate).toContain('paid_at.lt.');
    expect(predicate).toContain('paid_at.is.null');
    expect(predicate).toContain('created_at.gte.');
    expect(predicate).toContain('refunded_at.gte.');
    expect(stripeOrdersRange).toHaveBeenCalledWith(0, 99);
  });

  it('falls back to the complete paged ledger when a selected year has no rows', async () => {
    stripeOrdersRange.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
      data: [
        {
          id: 'o-existing',
          amount_cents: 100,
          currency: 'usd',
          status: 'succeeded',
          paid_at: '2026-01-01T12:00:00Z',
          refunded_at: null,
          created_at: '2026-01-01T12:00:00Z',
          stripe_payment_intent_id: 'pi_existing',
          entry_ids: [],
          show_id: null,
          show: null,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMyPayments('2019'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(stripeOrdersRange).toHaveBeenNthCalledWith(1, 0, 99);
    expect(stripeOrdersRange).toHaveBeenNthCalledWith(2, 0, 99);
    expect(result.current.data?.map(payment => payment.id)).toEqual(['o-existing']);
  });

  it('keeps a prior-year order when one of its entries was refunded in the selected year', async () => {
    stripeOrdersRange.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
      data: [
        {
          id: 'o-old',
          amount_cents: 5300,
          currency: 'usd',
          status: 'succeeded',
          paid_at: '2025-12-20T12:00:00Z',
          refunded_at: null,
          created_at: '2025-12-20T12:00:00Z',
          stripe_payment_intent_id: 'pi_old',
          entry_ids: ['e-refunded'],
          show_id: null,
          show: null,
        },
      ],
      error: null,
    });
    refundedEntriesRange.mockResolvedValueOnce({
      data: [{ id: 'e-refunded' }],
      error: null,
    });
    inFilter.mockResolvedValueOnce({
      data: [
        {
          id: 'e-refunded',
          refund_amount: 53,
          refunded_at: '2026-01-08T12:00:00Z',
          dogs: null,
          classes: null,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMyPayments('2026'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(stripeOrdersQuery.overlaps).toHaveBeenCalledWith('entry_ids', ['e-refunded']);
    expect(result.current.data?.[0].refunds[0]).toMatchObject({
      entryId: 'e-refunded',
      date: '2026-01-08T12:00:00Z',
    });
  });

  it('chunks the entry detail follow-up so no PostgREST IN list can grow without bound', async () => {
    const entryIds = Array.from({ length: 101 }, (_, index) => `e${index}`);
    stripeOrdersRange.mockResolvedValueOnce({
      data: [
        {
          id: 'o-many',
          amount_cents: 10100,
          currency: 'usd',
          status: 'succeeded',
          paid_at: '2026-06-10T00:00:00Z',
          refunded_at: null,
          created_at: '2026-06-09T00:00:00Z',
          stripe_payment_intent_id: 'pi_many',
          entry_ids: entryIds,
          show_id: null,
          show: null,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMyPayments(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(inFilter).toHaveBeenCalledTimes(2);
    expect(inFilter.mock.calls[0][1]).toHaveLength(100);
    expect(inFilter.mock.calls[1][1]).toEqual(['e100']);
  });
});
