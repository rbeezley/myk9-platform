/**
 * MYK9-229 — the cart's fee disclosure, asserted through CartSummary itself so
 * the WIRING is covered too: the split has to be computed from the subtotal the
 * cart is actually charging, not from some other number in scope.
 */

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CartSummary } from './CartSummary';
import { calculatePlatformFeeCents, type PlatformFeeRates } from '@/store/cartStore.helpers';

const FAR_FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const h = vi.hoisted(() => ({
  subtotalCents: 2500,
  rates: { percent: 7, flatCents: 0, minCents: 0 } as PlatformFeeRates,
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      cart: {
        id: 'cart-1',
        exhibitor_id: 'ex-1',
        show_id: 'show-1',
        status: 'active',
        expires_at: FAR_FUTURE,
        show: { id: 'show-1', name: 'Heartland Scent Work Classic', start_date: '2027-08-01' },
      },
      getTotalEntryFees: () => h.subtotalCents,
      getItemCount: () => 1,
      extendExpiration: vi.fn().mockResolvedValue(true),
    }),
}));

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRates: () => h.rates,
}));

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

describe('CartSummary — service fee split', () => {
  it('splits the fee on a $25 cart, and the parts add back to the charged fee', () => {
    h.subtotalCents = 2500;
    h.rates = { percent: 7, flatCents: 0, minCents: 0 };
    render(<CartSummary onCheckout={() => {}} />);

    const charged = calculatePlatformFeeCents(2500, h.rates);
    expect(charged).toBe(175);
    expect(screen.getByText(money(charged))).toBeInTheDocument();
    expect(screen.getByText('about $1.08')).toBeInTheDocument();
    expect(screen.getByText('about $0.67')).toBeInTheDocument();
    // 108 + 67 === 175 — the disclosure totals the fee, exactly.
    expect(108 + 67).toBe(charged);
  });

  it('splits the fee on a $500 cart at a different ratio', () => {
    h.subtotalCents = 50000;
    h.rates = { percent: 7, flatCents: 0, minCents: 0 };
    render(<CartSummary onCheckout={() => {}} />);

    const charged = calculatePlatformFeeCents(50000, h.rates);
    expect(charged).toBe(3500);
    expect(screen.getByText('about $15.82')).toBeInTheDocument();
    expect(screen.getByText('about $19.18')).toBeInTheDocument();
    expect(1582 + 1918).toBe(charged);
    // 62% of the fee at $25 vs 45% here: not a fixed ratio.
    expect(1582 / charged).toBeLessThan(108 / 175);
  });

  it('follows a non-zero flat component and floor rather than a fixed 7%', () => {
    h.subtotalCents = 2500;
    h.rates = { percent: 7, flatCents: 30, minCents: 250 };
    render(<CartSummary onCheckout={() => {}} />);

    const charged = calculatePlatformFeeCents(2500, h.rates);
    expect(charged).toBe(250); // 175 + 30 lifted to the $2.50 floor
    expect(screen.getByText('Service fee (7% + $0.30, $2.50 minimum)')).toBeInTheDocument();
    expect(screen.getByText(money(charged))).toBeInTheDocument();
    expect(screen.getByText('about $1.10')).toBeInTheDocument();
    expect(screen.getByText('about $1.40')).toBeInTheDocument();
  });

  it('keeps a $30 one-entry cart concise while labelling both estimates approximate', () => {
    h.subtotalCents = 3000;
    h.rates = { percent: 7, flatCents: 0, minCents: 0 };
    render(<CartSummary onCheckout={() => {}} />);

    expect(screen.getByText('Entry Fees (1 entry)')).toBeInTheDocument();
    expect(screen.getByText('$2.10')).toBeInTheDocument();
    expect(screen.getByText('about $1.23')).toBeInTheDocument();
    expect(screen.getByText('about $0.87')).toBeInTheDocument();
    expect(screen.queryByText(/These two amounts are approximate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/receives 100% of the entry fees/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /how our fees work/i })).toHaveAttribute(
      'href',
      '/fees'
    );
  });

  it('keeps the conditional note when card processing covers the whole fee', () => {
    h.subtotalCents = 100;
    h.rates = { percent: 7, flatCents: 0, minCents: 0 };
    render(<CartSummary onCheckout={() => {}} />);

    expect(screen.getByText('about $0.00')).toBeInTheDocument();
    expect(screen.getByText(/entire service fee/i)).toBeInTheDocument();
    expect(screen.queryByText(/These two amounts are approximate/i)).not.toBeInTheDocument();
  });

  it('links to the fees page from the cart', () => {
    h.subtotalCents = 2500;
    h.rates = { percent: 7, flatCents: 0, minCents: 0 };
    render(<CartSummary onCheckout={() => {}} />);

    expect(screen.getByRole('link', { name: /how our fees work/i })).toHaveAttribute(
      'href',
      '/fees'
    );
  });
});
