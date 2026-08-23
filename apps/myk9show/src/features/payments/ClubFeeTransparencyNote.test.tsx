/**
 * MYK9-229 — the club admin never sees a cart, so this note is the only place
 * they learn what the exhibitor pays and what happens to the club's own money.
 * The retention fact (the club keeps 100% of entry fees) must be stated, not
 * implied.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { calculatePlatformFeeCents, type PlatformFeeRates } from '@/store/cartStore.helpers';
import { ClubFeeTransparencyNote } from './ClubFeeTransparencyNote';

const rates = vi.hoisted(() => ({
  current: { percent: 7, flatCents: 0, minCents: 0 } as PlatformFeeRates,
}));

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRates: () => rates.current,
}));

describe('ClubFeeTransparencyNote', () => {
  it('states that the club receives 100% of entry fees and keeps its whole payout', () => {
    rates.current = { percent: 7, flatCents: 0, minCents: 0 };
    render(<ClubFeeTransparencyNote />);

    expect(
      screen.getByText(/Your club receives 100% of entry fees\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/never deducted from your payout/i)).toBeInTheDocument();
  });

  it('quotes the live fee and an example split, labelled approximate', () => {
    rates.current = { percent: 7, flatCents: 0, minCents: 0 };
    render(<ClubFeeTransparencyNote />);

    // $50.00 of entries → $3.50 fee, of which ~$1.85 is card processing.
    expect(calculatePlatformFeeCents(5000, rates.current)).toBe(350);
    const body = screen.getByText(/Exhibitors pay/i).textContent ?? '';
    expect(body).toContain('7%');
    expect(body).toContain('$3.50');
    expect(body).toContain('$1.85');
    expect(body).toMatch(/approximate/i);
  });

  it('follows a rate change rather than a hardcoded percentage', () => {
    rates.current = { percent: 3, flatCents: 25, minCents: 0 };
    render(<ClubFeeTransparencyNote />);

    const body = screen.getByText(/Exhibitors pay/i).textContent ?? '';
    expect(body).toContain('3% + $0.25');
    // 3% of $50.00 plus 25¢ = $1.75, and nothing here may still read $3.50.
    expect(calculatePlatformFeeCents(5000, rates.current)).toBe(175);
    expect(body).toContain('$1.75');
    expect(body).not.toContain('$3.50');
  });

  it('links to the shareable explanation instead of repeating it', () => {
    rates.current = { percent: 7, flatCents: 0, minCents: 0 };
    render(<ClubFeeTransparencyNote />);

    expect(screen.getByRole('link', { name: /how our fees work/i })).toHaveAttribute(
      'href',
      '/fees'
    );
  });
});
