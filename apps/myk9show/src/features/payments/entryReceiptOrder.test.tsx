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
        created_at: '2025-06-01T00:00:00Z',
        paid_at: '2025-06-01T00:00:00Z',
        amount_cents: 6500,
        currency: 'usd',
        stripe_payment_intent_id: 'pi_order_2025',
        status: 'succeeded',
        entry_ids: ['entry-a'],
        entry_subtotal_cents: 6000,
        platform_fee_cents: 500,
        refunded_cents: null,
        make_whole_refunded_cents: null,
        refunded_at: null,
      },
      error: null,
    });

    const { result } = renderHook(
      () =>
        useEntryReceiptOrders({
          requestedOrderId: 'order-2025',
          entryIds: ['entry-a'],
          enabled: true,
          viewerId: 'viewer-1',
        }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(from).toHaveBeenCalledWith('stripe_orders');
    expect(select).toHaveBeenCalledWith(
      'id, created_at, paid_at, amount_cents, currency, stripe_payment_intent_id, status, entry_ids, entry_subtotal_cents, platform_fee_cents, refunded_cents, make_whole_refunded_cents, refunded_at'
    );
    expect(eq).toHaveBeenCalledWith('id', 'order-2025');
    expect(range).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([
      {
        id: 'order-2025',
        createdAt: '2025-06-01T00:00:00Z',
        paidOn: '2025-06-01T00:00:00Z',
        amountCents: 6500,
        currency: 'usd',
        reference: 'pi_order_2025',
        status: 'succeeded',
        entryIds: ['entry-a'],
        entrySubtotalCents: 6000,
        platformFeeCents: 500,
        // Null refund columns must read as zero, never as unknown money.
        refundedCents: 0,
        makeWholeRefundedCents: 0,
        refundedAt: null,
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
          viewerId: 'viewer-1',
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
