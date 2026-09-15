/**
 * MYK9-509 — a completed payment must never be represented as cancelled, or
 * offered for repeat payment.
 *
 * Stripe's cancel_url is not only reached by pressing Cancel: Back from the
 * receipt, a restored tab and a re-followed history entry all land here with a
 * session that was PAID. The page answered "Payment Cancelled" unconditionally
 * and — since the amend button — put a live cart one click away.
 *
 * Three cases, because the wrong one is a money bug in both directions:
 *  - paid           -> the receipt, and NO route back into a payable cart;
 *  - not paid       -> today's cancel landing, unchanged;
 *  - no session id  -> today's cancel landing, unchanged (every pre-MYK9-509
 *                      link and any hand-typed visit).
 */

import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';

const verifyCheckoutSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe', () => ({
  verifyCheckoutSession: verifyCheckoutSessionMock,
}));

vi.mock('@/store/cartStore', () => ({
  // A show id is present, so the amend button is the one that would render —
  // exactly the state the money boundary has to suppress.
  useCartStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      cart: { show_id: 'show-1' },
      cartRecoveryInfo: { showId: 'show-1' },
    }),
  useCartItems: () => [],
}));

import CheckoutCancelPage from '@/pages/CheckoutCancelPage';

const PAID = {
  success: true as const,
  verificationStatus: 'succeeded' as const,
  orderId: 'order-1',
  entryIds: ['entry-1'],
};

const NOT_PAID = {
  success: false as const,
  verificationStatus: 'not_found' as const,
  error: "We can't find this payment on this account yet.",
};

beforeEach(() => {
  verifyCheckoutSessionMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CheckoutCancelPage — a paid session is not a cancelled one', () => {
  it('shows the paid state and no path back into the cart when the session was paid', async () => {
    verifyCheckoutSessionMock.mockResolvedValue(PAID);

    render(<CheckoutCancelPage />, {
      initialRoute: '/checkout/cancel?session_id=cs_test_paid',
    });

    expect(verifyCheckoutSessionMock).toHaveBeenCalledWith('cs_test_paid');

    await screen.findByRole('heading', { name: /this payment went through/i });
    // The claim the money boundary is about.
    expect(screen.queryByText(/payment cancelled/i)).not.toBeInTheDocument();

    // Neither route back to a payable cart survives.
    expect(screen.queryByRole('button', { name: /add or change entries/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /return to cart/i })).not.toBeInTheDocument();

    // And the receipt is reachable.
    expect(screen.getByRole('button', { name: /view your receipt/i })).toBeInTheDocument();
  });

  it('keeps the cancel landing when the session is not a completed payment', async () => {
    verifyCheckoutSessionMock.mockResolvedValue(NOT_PAID);

    render(<CheckoutCancelPage />, {
      initialRoute: '/checkout/cancel?session_id=cs_test_abandoned',
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add or change entries/i })).toBeEnabled();
    });
    expect(screen.getByRole('heading', { name: /payment cancelled/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /return to cart/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /this payment went through/i })
    ).not.toBeInTheDocument();
  });

  it('keeps the cancel landing, and never asks, with no session id in the URL', async () => {
    render(<CheckoutCancelPage />, { initialRoute: '/checkout/cancel' });

    expect(await screen.findByRole('heading', { name: /payment cancelled/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add or change entries/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /return to cart/i })).toBeInTheDocument();
    // No id to ask about — and asking with an empty one would be a round trip
    // that can only answer "unavailable".
    expect(verifyCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('does not offer the amend button while the answer is still in flight', async () => {
    let resolve: (value: typeof PAID) => void = () => {};
    verifyCheckoutSessionMock.mockReturnValue(
      new Promise<typeof PAID>(r => {
        resolve = r;
      })
    );

    render(<CheckoutCancelPage />, {
      initialRoute: '/checkout/cancel?session_id=cs_test_slow',
    });

    // Suppressed, not merely "probably fast enough".
    expect(screen.getByRole('button', { name: /add or change entries/i })).toBeDisabled();

    resolve(PAID);
    await screen.findByRole('heading', { name: /this payment went through/i });
  });
});
