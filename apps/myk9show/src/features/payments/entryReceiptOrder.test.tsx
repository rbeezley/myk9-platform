import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { maybeSingle, eq, overlaps, select, range, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const overlaps = vi.fn();
  const select = vi.fn(() => ({ eq, overlaps }));
  const range = vi.fn();
  const from = vi.fn(() => ({ select, range }));
  return { maybeSingle, eq, overlaps, select, range, from };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from,
  },
}));

import { useEntryReceiptOrders } from './entryReceiptOrder';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useEntryReceiptOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches one order by id independently of payment-list bounds', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: 'order-2025',
        amount_cents: 6500,
        currency: 'usd',
        stripe_payment_intent_id: 'pi_order_2025',
        status: 'succeeded',
        entry_ids: ['entry-a'],
      },
      error: null,
    });

    const { result } = renderHook(
      () =>
        useEntryReceiptOrders({
          requestedOrderId: 'order-2025',
          entryIds: ['entry-a'],
          enabled: true,
        }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(from).toHaveBeenCalledWith('stripe_orders');
    expect(select).toHaveBeenCalledWith(
      'id, amount_cents, currency, stripe_payment_intent_id, status, entry_ids'
    );
    expect(eq).toHaveBeenCalledWith('id', 'order-2025');
    expect(range).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([
      {
        id: 'order-2025',
        amountCents: 6500,
        currency: 'usd',
        reference: 'pi_order_2025',
        status: 'succeeded',
        entryIds: ['entry-a'],
      },
    ]);
  });

  it('discovers every order overlapping the card entries for direct receipt access', async () => {
    overlaps.mockResolvedValue({
      data: [
        {
          id: 'order-2',
          amount_cents: 7500,
          currency: 'usd',
          stripe_payment_intent_id: 'pi_2',
          status: 'refunded',
          entry_ids: ['entry-b'],
        },
        {
          id: 'order-1',
          amount_cents: 6500,
          currency: 'usd',
          stripe_payment_intent_id: 'pi_1',
          status: 'pending',
          entry_ids: ['entry-a'],
        },
      ],
      error: null,
    });

    const { result } = renderHook(
      () =>
        useEntryReceiptOrders({
          requestedOrderId: null,
          entryIds: ['entry-b', 'entry-a'],
          enabled: true,
        }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(overlaps).toHaveBeenCalledWith('entry_ids', ['entry-a', 'entry-b']);
    expect(eq).not.toHaveBeenCalled();
    expect(result.current.data?.map(order => [order.id, order.status])).toEqual([
      ['order-1', 'pending'],
      ['order-2', 'refunded'],
    ]);
  });
});
