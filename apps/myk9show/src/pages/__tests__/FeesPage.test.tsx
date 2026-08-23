/**
 * MYK9-229 — /fees is the one canonical, shareable fee explanation. It must
 * carry the club-keeps-100% statement, must label the split approximate, and
 * every figure on it must come from the calculator that prices the charge.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { calculatePlatformFeeCents, type PlatformFeeRates } from '@/store/cartStore.helpers';
import FeesPage from '../FeesPage';

const rates = vi.hoisted(() => ({
  current: { percent: 7, flatCents: 0, minCents: 0 } as PlatformFeeRates,
}));

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRates: () => rates.current,
}));

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The example table row for a given entry subtotal, as rendered. */
function rowFor(subtotalCents: number): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(`^\\${money(subtotalCents)}\\s`) });
}

describe('FeesPage', () => {
  it('says the club receives 100% of entry fees and is never charged the fee', () => {
    rates.current = { percent: 7, flatCents: 0, minCents: 0 };
    render(<FeesPage />);

    expect(
      screen.getByRole('heading', { name: /Your club receives 100% of entry fees/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/never deducted from a club/i)).toBeInTheDocument();
  });

  it('labels the split approximate and says the exact Stripe fee is not known yet', () => {
    rates.current = { percent: 7, flatCents: 0, minCents: 0 };
    render(<FeesPage />);

    const note = screen.getByText(/figures are approximate/i);
    expect(note).toBeInTheDocument();
    expect(note.textContent).toMatch(/only known once the payment settles/i);
  });

  it('derives every example from calculatePlatformFeeCents', () => {
    rates.current = { percent: 7, flatCents: 0, minCents: 0 };
    render(<FeesPage />);

    [2500, 5000, 10000, 20000, 50000].forEach(subtotalCents => {
      const cells = within(rowFor(subtotalCents)).getAllByRole('cell');
      const charged = calculatePlatformFeeCents(subtotalCents, rates.current);
      expect(cells[0]).toHaveTextContent(money(charged));
      // The two approximate columns reconstruct the exact fee.
      const processing = Number(cells[1].textContent?.replace(/[$,]/g, ''));
      const platform = Number(cells[2].textContent?.replace(/[$,]/g, ''));
      expect(Math.round((processing + platform) * 100)).toBe(charged);
    });
  });

  it('tracks a rate change instead of quoting a compiled-in 7%', () => {
    rates.current = { percent: 4, flatCents: 50, minCents: 0 };
    render(<FeesPage />);

    // $25.00 of entries at 4% + 50¢ = $1.50, not $1.75.
    expect(calculatePlatformFeeCents(2500, rates.current)).toBe(150);
    const cells = within(rowFor(2500)).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('$1.50');
    expect(screen.getByText(/4% \+ \$0\.50 on top/i)).toBeInTheDocument();
  });

  it('shows card processing as a bigger share of a small order than a large one', () => {
    rates.current = { percent: 7, flatCents: 0, minCents: 0 };
    render(<FeesPage />);

    const small = within(rowFor(2500)).getAllByRole('cell');
    const large = within(rowFor(50000)).getAllByRole('cell');
    const share = (cells: HTMLElement[]) =>
      Number(cells[1].textContent?.replace(/[$,]/g, '')) /
      Number(cells[0].textContent?.replace(/[$,]/g, ''));
    expect(share(small)).toBeGreaterThan(share(large));
  });

  it('makes no infrastructure cost list and no SMS claim', () => {
    rates.current = { percent: 7, flatCents: 0, minCents: 0 };
    const { container } = render(<FeesPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\bSMS\b/i);
    expect(text).not.toMatch(/\btext message/i);
    expect(text).not.toMatch(/\bhosting\b/i);
    expect(text).not.toMatch(/\bserver costs?\b/i);
    expect(text).not.toMatch(/\bdatabase storage\b/i);
  });
});
