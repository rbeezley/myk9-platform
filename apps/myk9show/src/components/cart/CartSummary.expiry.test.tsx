/**
 * CartSummary — the hold-expiry heads-up must survive the moment it matters.
 *
 * `showWarning` and `showUrgentWarning` both require `timeRemainingMs > 0`, so
 * at the instant a hold lapsed the banner unmounted and took the one-tap Extend
 * with it, while the Pay button stayed enabled over a dead hold. These pin the
 * repaired contract. They deliberately do NOT assert a persistent countdown or
 * an expiry redirect — the CartSummary INTENT rules both out, and
 * CartSummary.source.test.ts guards that separately.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CartSummary } from './CartSummary';

const timerState = {
  timeRemainingFormatted: '0:00',
  isExpired: false,
  showWarning: false,
  showUrgentWarning: false,
};

vi.mock('@/hooks/useCartExpirationTimer', () => ({
  useCartExpirationTimer: () => ({
    ...timerState,
    extendExpiration: vi.fn().mockResolvedValue(true),
    percentRemaining: 0,
  }),
}));

const storeState = { cart: null as unknown, itemCount: 1, totalEntryFees: 2500 };

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      cart: storeState.cart,
      getTotalEntryFees: () => storeState.totalEntryFees,
      getItemCount: () => storeState.itemCount,
      extendExpiration: vi.fn().mockResolvedValue(true),
    }),
}));

beforeEach(() => {
  storeState.cart = {
    id: 'cart-1',
    exhibitor_id: 'ex-1',
    show_id: 'show-1',
    status: 'active',
    expires_at: new Date(Date.now() - 1000).toISOString(),
    show: {
      id: 'show-1',
      name: 'Heartland Scent Work Classic',
      start_date: '2027-08-01',
      entry_close_date: '2027-06-30',
    },
  };
  storeState.itemCount = 1;
  storeState.totalEntryFees = 2500;
  timerState.timeRemainingFormatted = '0:00';
  timerState.isExpired = false;
  timerState.showWarning = false;
  timerState.showUrgentWarning = false;
});

describe('CartSummary — lapsed hold', () => {
  it('keeps the Extend affordance on screen once the hold has lapsed', () => {
    timerState.isExpired = true;

    render(<CartSummary />);

    expect(screen.getByText('Your hold has lapsed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extend' })).toBeInTheDocument();
  });

  it('reassures that nothing was removed, rather than pressing the exhibitor', () => {
    timerState.isExpired = true;

    render(<CartSummary />);

    expect(screen.getByText(/nothing has been removed from your cart/i)).toBeInTheDocument();
  });

  it('will not offer to take payment against a hold that has lapsed', () => {
    timerState.isExpired = true;

    render(<CartSummary />);

    const pay = screen.getByRole('button', { name: /extend your hold to continue/i });
    expect(pay).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^pay \$/i })).not.toBeInTheDocument();
  });

  it('still offers payment while the hold is merely near its end', () => {
    timerState.showWarning = true;
    timerState.timeRemainingFormatted = '4:30';

    render(<CartSummary />);

    expect(screen.getByText('Cart will expire soon')).toBeInTheDocument();
    // The figure includes the platform fee; what matters here is that a real
    // payable amount is offered rather than the lapsed-hold label.
    expect(screen.getByRole('button', { name: /^pay \$\d/i })).toBeEnabled();
  });
});
