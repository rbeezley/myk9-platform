/**
 * MYK9-229 — what the exhibitor actually reads in the cart.
 *
 * Assertions are on rendered output, never on the source: the point of the
 * feature is the number a person sees, and a source grep would certify a line
 * that renders nothing.
 */

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { PlatformFeeSplitLines } from './PlatformFeeSplitLines';
import { calculatePlatformFeeCents, type PlatformFeeRates } from '@/store/cartStore.helpers';

const LIVE: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 0 };

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

describe('PlatformFeeSplitLines', () => {
  it('shows the fee the charge will use, not a compiled-in percentage', () => {
    const rates: PlatformFeeRates = { percent: 12.5, flatCents: 40, minCents: 0 };
    render(<PlatformFeeSplitLines subtotalCents={2500} rates={rates} />);

    const charged = calculatePlatformFeeCents(2500, rates);
    expect(charged).toBe(353);
    expect(screen.getByText(money(charged))).toBeInTheDocument();
    // The label names every active component, so 12.5% + 40¢ cannot read "7%".
    expect(screen.getByText('Service fee (12.5% + $0.40)')).toBeInTheDocument();
  });

  it('breaks the fee into two parts that add back to it', () => {
    render(<PlatformFeeSplitLines subtotalCents={2500} rates={LIVE} />);

    expect(screen.getByText('Service fee (7%)')).toBeInTheDocument();
    expect(screen.getByText('$1.75')).toBeInTheDocument();
    expect(screen.getByText('Card processing (Stripe, 2.9% + $0.30)')).toBeInTheDocument();
    expect(screen.getByText('about $1.08')).toBeInTheDocument();
    expect(screen.getByText('myK9Show')).toBeInTheDocument();
    expect(screen.getByText('about $0.67')).toBeInTheDocument();
  });

  it('shows a different split on a large order — the ratio is not fixed', () => {
    render(<PlatformFeeSplitLines subtotalCents={50000} rates={LIVE} />);

    expect(screen.getByText('$35.00')).toBeInTheDocument();
    expect(screen.getByText('about $15.82')).toBeInTheDocument();
    expect(screen.getByText('about $19.18')).toBeInTheDocument();
  });

  it('labels the split approximate and states that the club keeps the entry fees', () => {
    render(<PlatformFeeSplitLines subtotalCents={2500} rates={LIVE} />);

    expect(screen.getByText(/approximate/i)).toBeInTheDocument();
    expect(screen.getByText(/receives 100% of the entry fees/i)).toBeInTheDocument();
  });

  it('links to the one canonical explanation rather than restating it', () => {
    render(<PlatformFeeSplitLines subtotalCents={2500} rates={LIVE} />);

    expect(screen.getByRole('link', { name: /how our fees work/i })).toHaveAttribute(
      'href',
      '/fees'
    );
  });

  it('says so when processing costs more than the whole fee, instead of printing $0.00', () => {
    render(<PlatformFeeSplitLines subtotalCents={100} rates={LIVE} />);

    expect(screen.getByText(/costs more than the whole service fee/i)).toBeInTheDocument();
    expect(screen.getByText('about $0.00')).toBeInTheDocument();
  });

  it('renders no split at all when no fee is charged', () => {
    render(
      <PlatformFeeSplitLines
        subtotalCents={2500}
        rates={{ percent: 0, flatCents: 0, minCents: 0 }}
      />
    );

    expect(screen.queryByText(/card processing/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /how our fees work/i })).not.toBeInTheDocument();
  });
});
