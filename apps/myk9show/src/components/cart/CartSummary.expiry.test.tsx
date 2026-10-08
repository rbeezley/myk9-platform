/**
 * CartSummary — a lapsed cart is saved, not held (MYK9-1012).
 *
 * The cart's 30-minute timer never held a spot: spots are held only from the
 * Pay click until the Stripe page expires (`hold_cart_spots`). Its heads-up
 * ("Your hold has lapsed", one-tap Extend, Pay disabled until extended)
 * promised a hold that did not exist, and stripe-checkout reactivates a lapsed
 * cart at Pay and re-checks every spot then. So a lapsed cart reads like any
 * other: no timer copy, Pay live, and the one line about holding at Pay.
 * Still no countdown and no expiry redirect (UX walk remediation 4.B).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CartSummary } from './CartSummary';

const storeState = { cart: null as unknown, itemCount: 1, totalEntryFees: 2500 };

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      cart: storeState.cart,
      getTotalEntryFees: () => storeState.totalEntryFees,
      getItemCount: () => storeState.itemCount,
    }),
}));

function cartExpiring(msFromNow: number, entryCloseDate = '2027-06-30') {
  return {
    id: 'cart-1',
    exhibitor_id: 'ex-1',
    show_id: 'show-1',
    status: 'active',
    expires_at: new Date(Date.now() + msFromNow).toISOString(),
    show: {
      id: 'show-1',
      name: 'Heartland Scent Work Classic',
      start_date: '2027-08-01',
      entry_close_date: entryCloseDate,
    },
  };
}

const TIMER_COPY = /hold has lapsed|expire soon|expiring very soon|extend/i;

beforeEach(() => {
  storeState.itemCount = 1;
  storeState.totalEntryFees = 2500;
});

describe('CartSummary — a lapsed cart is saved, not held', () => {
  it('offers payment on a cart whose timer lapsed, with no timer copy', () => {
    storeState.cart = cartExpiring(-60_000);

    const { container } = render(<CartSummary onCheckout={() => {}} />);

    expect(screen.getByRole('button', { name: /^pay \$\d/i })).toBeEnabled();
    expect(container.textContent).not.toMatch(TIMER_COPY);
    expect(
      screen.getByText("We're holding your spots for 30 minutes while you pay.")
    ).toBeInTheDocument();
  });

  it('shows no near-expiry warning either', () => {
    storeState.cart = cartExpiring(60_000);

    const { container } = render(<CartSummary onCheckout={() => {}} />);

    expect(container.textContent).not.toMatch(TIMER_COPY);
    expect(screen.getByRole('button', { name: /^pay \$\d/i })).toBeEnabled();
  });

  it('still names entries closed as the blocker', () => {
    storeState.cart = cartExpiring(-60_000, '2020-01-01');

    render(<CartSummary onCheckout={() => {}} />);

    expect(screen.getByRole('button', { name: /entries closed/i })).toBeDisabled();
    expect(
      screen.queryByText("We're holding your spots for 30 minutes while you pay.")
    ).not.toBeInTheDocument();
  });
});
