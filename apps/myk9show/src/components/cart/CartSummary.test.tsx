/**
 * CartSummary — entries-closed gating (exhibitor-ux-remediation cart-integrity).
 *
 * The audit found a cart holding an entry for a show whose entries had closed
 * weeks earlier, with a live "Pay and confirm" button still enabled. The cart
 * already joins `show.entry_close_date` — it was just never checked.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CartSummary } from './CartSummary';

const FAR_FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function mockCart(overrides: Partial<{ entry_close_date: string }> = {}) {
  return {
    id: 'cart-1',
    exhibitor_id: 'ex-1',
    show_id: 'show-1',
    status: 'active',
    expires_at: FAR_FUTURE,
    show: {
      id: 'show-1',
      name: 'Heartland Scent Work Classic',
      start_date: '2026-08-01',
      entry_close_date: '2026-06-30',
      ...overrides,
    },
  };
}

const storeState = { cart: mockCart() as unknown, itemCount: 1 };

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      cart: storeState.cart,
      getTotalEntryFees: () => 3000,
      getItemCount: () => storeState.itemCount,
      extendExpiration: vi.fn().mockResolvedValue(true),
    }),
}));

describe('CartSummary — entries-closed gating', () => {
  it('disables checkout and explains when the show has closed entries', () => {
    storeState.cart = mockCart({ entry_close_date: '2026-06-30' });
    render(<CartSummary />);

    expect(screen.getByText('Entries are closed for this show')).toBeInTheDocument();
    const payButton = screen.getByRole('button', { name: /entries closed — cannot pay online/i });
    expect(payButton).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /pay \$.* and confirm/i })
    ).not.toBeInTheDocument();
  });

  it('allows checkout when entries are still open', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    storeState.cart = mockCart({ entry_close_date: future.toISOString().slice(0, 10) });
    render(<CartSummary />);

    expect(screen.queryByText('Entries are closed for this show')).not.toBeInTheDocument();
    const payButton = screen.getByRole('button', { name: /pay \$.* and confirm/i });
    expect(payButton).not.toBeDisabled();
  });

  // exhibitor-ux-remediation P1 (Codex review): a DATE-only close date must be
  // parsed as a local calendar date, not UTC-midnight — otherwise checkout is
  // wrongly disabled for the ENTIRE final entry day in timezones behind UTC.
  describe('close-date boundary (local calendar date, not UTC)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps checkout OPEN during the final entry day itself', () => {
      // Local noon on the close date — entries are still open all day.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 30, 12, 0, 0)); // 2026-06-30 12:00 local
      storeState.cart = mockCart({ entry_close_date: '2026-06-30' });

      render(<CartSummary />);

      expect(screen.queryByText('Entries are closed for this show')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /pay \$.* and confirm/i })).not.toBeDisabled();
    });

    it('closes checkout once the day AFTER the close date begins', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 1, 0, 1, 0)); // 2026-07-01 00:01 local
      storeState.cart = mockCart({ entry_close_date: '2026-06-30' });

      render(<CartSummary />);

      expect(screen.getByText('Entries are closed for this show')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /entries closed — cannot pay online/i })
      ).toBeDisabled();
    });
  });
});
