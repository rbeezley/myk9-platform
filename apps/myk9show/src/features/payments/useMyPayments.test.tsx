import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const order = vi.fn();
const inFilter = vi.fn();
const entriesSelect = vi.fn(() => ({ in: inFilter }));
const stripeOrdersOrder = vi.fn();
const stripeOrdersSelect = vi.fn(() => ({ order: stripeOrdersOrder }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) =>
      table === 'entries' ? { select: entriesSelect } : { select: stripeOrdersSelect },
  },
}));

import { useMyPayments } from './useMyPayments';

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
    stripeOrdersOrder.mockImplementation(order);
  });

  it('maps stripe_orders rows to MyPayment, preferring paid_at for the date', async () => {
    order.mockResolvedValue({
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
        showName: 'Spring Trial',
        amountCents: 5300,
        netPaidCents: 5300,
        currency: 'usd',
        status: 'succeeded',
        reference: 'pi_1',
        entryIds: ['e1', 'e2'],
      },
    ]);
  });

  it('falls back to created_at and null show when fields are missing', async () => {
    order.mockResolvedValue({
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
          show: null,
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useMyPayments(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({
      date: '2026-06-01T00:00:00Z',
      showName: null,
      netPaidCents: 499,
      currency: 'usd',
      reference: null,
      entryIds: [],
    });
  });

  it('propagates a query error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useMyPayments(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('subtracts linked entry refunds even when the stripe order still says succeeded', async () => {
    order.mockResolvedValue({
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
        { id: 'e1', refund_amount: 30 },
        { id: 'e2', refund_amount: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMyPayments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(entriesSelect).toHaveBeenCalledWith('id, refund_amount');
    expect(inFilter).toHaveBeenCalledWith('id', ['e1', 'e2']);
    expect(result.current.data?.[0]).toMatchObject({
      amountCents: 5300,
      netPaidCents: 2300,
      status: 'succeeded',
    });
  });
});
