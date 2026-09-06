/**
 * Follows the real Receipt link end to end: the href `buildEntryReceiptHref`
 * produces becomes the router's location, and the amount has to come out the
 * other side.
 *
 * Deliberately NOT a test of `buildScopedPaymentFacts` with a hand-built order
 * — that function was already green while the destination printed nothing.
 * What was broken was the wiring between the URL a payment row emits and the
 * content a page renders, so that is the seam under test (MYK9-420 AC4).
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const { maybeSingle, eq, entriesIn, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  // The receipt makes TWO reads: the order by id, then the order's entries for
  // the app-recorded refund the order columns may not carry yet.
  const entriesIn = vi.fn();
  const select = vi.fn(() => ({ eq, in: entriesIn }));
  const from = vi.fn(() => ({ select }));
  return { maybeSingle, eq, entriesIn, from };
});

vi.mock('@/lib/supabase', () => ({ supabase: { from } }));

import { buildEntryReceiptHref } from '@/features/payments/entryReceiptHref';

import { ScopedPaymentSummary } from './ScopedPaymentSummary';

const ORDER_ID = 'ff08fa39-41c6-4ef7-bd8a-0195469b1bb8';
const SHOW_ID = 'a1090000-0000-4000-8000-000000000001';
const ENTRY_ID = 'df535d32-0000-4000-8000-000000000001';

/** The exact row the walk that filed MYK9-420 paid: $32.10. */
function paidRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    created_at: '2026-09-06T12:00:00Z',
    paid_at: '2026-09-06T12:00:00Z',
    amount_cents: 3210,
    currency: 'usd',
    stripe_payment_intent_id: 'pi_3RwalkDog',
    status: 'succeeded',
    entry_ids: [ENTRY_ID],
    entry_subtotal_cents: 3000,
    platform_fee_cents: 210,
    refunded_cents: null,
    make_whole_refunded_cents: null,
    refunded_at: null,
    ...overrides,
  };
}

function renderAt(href: string): ReactNode {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[href]}>
        <ScopedPaymentSummary />
      </MemoryRouter>
    </QueryClientProvider>
  ) as unknown as ReactNode;
}

describe('ScopedPaymentSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No app-recorded entry refund unless a test says otherwise.
    entriesIn.mockResolvedValue({ data: [], error: null });
  });

  it('states the amount paid on the destination of a real Receipt link', async () => {
    maybeSingle.mockResolvedValue({ data: paidRow(), error: null });

    // The producer's own output, not a hand-typed query string: a rename of
    // either param must fail here rather than silently blanking the panel.
    renderAt(buildEntryReceiptHref(SHOW_ID, [ENTRY_ID], ORDER_ID));

    expect(await screen.findByText('$32.10')).toBeInTheDocument();
    expect(screen.getByText('Amount paid')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Sep 6, 2026')).toBeInTheDocument();
    expect(screen.getByText('pi_3RwalkDog')).toBeInTheDocument();
    expect(screen.getByText('Paid for 1 entry.')).toBeInTheDocument();
    expect(from).toHaveBeenCalledWith('stripe_orders');
    expect(eq).toHaveBeenCalledWith('id', ORDER_ID);
  });

  it('states the refund rather than the gross alone when money came back', async () => {
    maybeSingle.mockResolvedValue({
      data: paidRow({ refunded_cents: 1000, refunded_at: '2026-09-08T12:00:00Z' }),
      error: null,
    });

    renderAt(buildEntryReceiptHref(SHOW_ID, [ENTRY_ID], ORDER_ID));

    expect(await screen.findByText('$22.10')).toBeInTheDocument();
    expect(screen.getByText('Net paid')).toBeInTheDocument();
    expect(screen.getByText('Partially refunded')).toBeInTheDocument();
    expect(screen.getByText('$32.10')).toBeInTheDocument();
    expect(screen.getByText('-$10.00')).toBeInTheDocument();
  });

  it('renders nothing at all when the link carries no order', () => {
    // A Receipt link for an order with no linked entry rows, and every
    // ordinary unscoped visit to My Shows. The panel must not appear, and it
    // must not query.
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[buildEntryReceiptHref(SHOW_ID, [ENTRY_ID])]}>
          <ScopedPaymentSummary />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(container).toBeEmptyDOMElement();
    expect(from).not.toHaveBeenCalled();
  });

  it('offers a retry when the payment read fails', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    renderAt(buildEntryReceiptHref(SHOW_ID, [ENTRY_ID], ORDER_ID));

    expect(
      await screen.findByText(/could not load the payment details for this receipt/i)
    ).toBeInTheDocument();

    maybeSingle.mockResolvedValueOnce({ data: paidRow(), error: null });
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('$32.10')).toBeInTheDocument();
  });

  it('dates the receipt by capture, not by row creation', async () => {
    maybeSingle.mockResolvedValue({
      data: paidRow({ paid_at: '2026-09-09T12:00:00Z' }),
      error: null,
    });
    renderAt(buildEntryReceiptHref(SHOW_ID, [ENTRY_ID], ORDER_ID));

    expect(await screen.findByText('Sep 9, 2026')).toBeInTheDocument();
    expect(screen.queryByText('Sep 6, 2026')).not.toBeInTheDocument();
  });

  it('shows an entry refund the order columns have not caught up with', async () => {
    // `stripe-refund-entry` writes entries.refund_amount synchronously; the
    // order's refunded_cents waits for Stripe to deliver charge.refunded. In
    // that window the My Payments row already shows the refund, so a receipt
    // reading only the order columns would contradict it.
    maybeSingle.mockResolvedValue({ data: paidRow(), error: null });
    entriesIn.mockResolvedValue({ data: [{ id: ENTRY_ID, refund_amount: 10 }], error: null });

    renderAt(buildEntryReceiptHref(SHOW_ID, [ENTRY_ID], ORDER_ID));

    expect(await screen.findByText('$22.10')).toBeInTheDocument();
    expect(screen.getByText('Partially refunded')).toBeInTheDocument();
    expect(screen.getByText('-$10.00')).toBeInTheDocument();
  });

  it('distinguishes an unreadable order from a failed read', async () => {
    // stripe_orders_select scopes reads to the caller's own customer, so
    // someone else's order id resolves to null rather than erroring. A retry
    // cannot change that answer, so none is offered.
    maybeSingle.mockResolvedValue({ data: null, error: null });
    renderAt(buildEntryReceiptHref(SHOW_ID, [ENTRY_ID], ORDER_ID));

    expect(await screen.findByText(/could not find that payment/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });
});
