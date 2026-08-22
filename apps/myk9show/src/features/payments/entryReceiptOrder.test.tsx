import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { maybeSingle, eq, select, range, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const range = vi.fn();
  const from = vi.fn(() => ({ select, range }));
  return { maybeSingle, eq, select, range, from };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from,
  },
}));

import { useEntryReceiptOrder } from './entryReceiptOrder';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useEntryReceiptOrder', () => {
  it('fetches one order by id independently of payment-list bounds', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: 'order-2025',
        amount_cents: 6500,
        currency: 'usd',
        stripe_payment_intent_id: 'pi_order_2025',
        entry_ids: ['entry-a'],
      },
      error: null,
    });

    const { result } = renderHook(() => useEntryReceiptOrder('order-2025'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(from).toHaveBeenCalledWith('stripe_orders');
    expect(select).toHaveBeenCalledWith(
      'id, amount_cents, currency, stripe_payment_intent_id, entry_ids'
    );
    expect(eq).toHaveBeenCalledWith('id', 'order-2025');
    expect(range).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({
      id: 'order-2025',
      amountCents: 6500,
      currency: 'usd',
      reference: 'pi_order_2025',
      entryIds: ['entry-a'],
    });
  });
});
