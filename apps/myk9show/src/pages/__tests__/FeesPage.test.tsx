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
  current: { percent: 7, flatCents: 0, minCents: 0 } as PlatformFeeRates | null,
  state: 'ready' as 'loading' | 'unavailable' | 'absent' | 'ready',
}));

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRatesQuery: () => ({ rates: rates.current, state: rates.state }),
}));

function readyAt(next: PlatformFeeRates) {
  rates.current = next;
  rates.state = 'ready';
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The example table row for a given entry subtotal, as rendered. */
function rowFor(subtotalCents: number): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(`^\\${money(subtotalCents)}\\s`) });
}

describe('FeesPage', () => {
  it('says the club receives 100% of entry fees and is never charged the fee', () => {
    readyAt({ percent: 7, flatCents: 0, minCents: 0 });
    render(<FeesPage />);

    expect(
      screen.getByRole('heading', { name: /Your club receives 100% of entry fees/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/never deducted from a club/i)).toBeInTheDocument();
  });

  it('labels the split approximate and says the exact Stripe fee is not known yet', () => {
    readyAt({ percent: 7, flatCents: 0, minCents: 0 });
    render(<FeesPage />);

    const note = screen.getByText(/figures are approximate/i);
    expect(note).toBeInTheDocument();
    expect(note.textContent).toMatch(/only known once the payment settles/i);
  });

  it('derives every example from calculatePlatformFeeCents', () => {
    readyAt({ percent: 7, flatCents: 0, minCents: 0 });
    render(<FeesPage />);

    [2500, 5000, 10000, 20000, 50000].forEach(subtotalCents => {
      const cells = within(rowFor(subtotalCents)).getAllByRole('cell');
      const charged = calculatePlatformFeeCents(subtotalCents, rates.current!);
      expect(cells[0]).toHaveTextContent(money(charged));
      // The two approximate columns reconstruct the exact fee.
      const processing = Number(cells[1].textContent?.replace(/[$,]/g, ''));
      const platform = Number(cells[2].textContent?.replace(/[$,]/g, ''));
      expect(Math.round((processing + platform) * 100)).toBe(charged);
    });
  });

  it('tracks a rate change instead of quoting a compiled-in 7%', () => {
    readyAt({ percent: 4, flatCents: 50, minCents: 0 });
    render(<FeesPage />);

    // $25.00 of entries at 4% + 50¢ = $1.50, not $1.75.
    expect(calculatePlatformFeeCents(2500, rates.current!)).toBe(150);
    const cells = within(rowFor(2500)).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('$1.50');
    expect(screen.getByText(/4% \+ \$0\.50 on top/i)).toBeInTheDocument();
  });

  it('shows card processing as a bigger share of a small order than a large one', () => {
    readyAt({ percent: 7, flatCents: 0, minCents: 0 });
    render(<FeesPage />);

    const small = within(rowFor(2500)).getAllByRole('cell');
    const large = within(rowFor(50000)).getAllByRole('cell');
    const share = (cells: HTMLElement[]) =>
      Number(cells[1].textContent?.replace(/[$,]/g, '')) /
      Number(cells[0].textContent?.replace(/[$,]/g, ''));
    expect(share(small)).toBeGreaterThan(share(large));
  });

  // The table used to print the clamped $0.00 share as bare fact on every row —
  // the exact coincidental zero the flag exists to prevent, wired into the cart
  // and nowhere else.
  it('marks and explains a $0.00 myK9Show share instead of publishing bare zeros', () => {
    readyAt({ percent: 2, flatCents: 0, minCents: 0 });
    render(<FeesPage />);

    // Every row clamps at 2%, including the $500 one.
    [2500, 50000].forEach(subtotalCents => {
      const cells = within(rowFor(subtotalCents)).getAllByRole('cell');
      // The zero must be MARKED. Unmarked it reads as a computed result, and
      // the footnote below has nothing to point at.
      expect(cells[2].textContent).toContain('$0.00');
      expect(cells[2].textContent).toContain('*');
    });
    // Scoped to the table's own section: the Card processing prose carries the
    // same sentence now (see the S1 test below), so an unscoped query is
    // ambiguous — and it is the FOOTNOTE that has to explain the marker.
    const tableSection = screen
      .getByRole('heading', { name: 'What that looks like' })
      .closest('section') as HTMLElement;
    const footnote = within(tableSection).getByText(/entire service fee/i);
    expect(footnote).toBeInTheDocument();
    expect(footnote.textContent).not.toMatch(/small/i);
  });

  // S1 — round-1 B2 surviving inside the fix for round-1 B2. The table and the
  // club note consulted the flag; this PROSE paragraph rendered the same split
  // unguarded, so at 2% it read "on $25.00 of entries it is about $0.50 of the
  // $0.50 fee" — a clamped figure printed as a computed one, with the
  // explanatory footnote two sections further down.
  it('does not print a clamped figure as a computed one in the prose', () => {
    readyAt({ percent: 2, flatCents: 0, minCents: 0 });
    render(<FeesPage />);

    const section = screen
      .getByRole('heading', { name: 'Card processing' })
      .closest('section') as HTMLElement;

    // The example sentence is gone, not merely accompanied by a note.
    expect(section.textContent).not.toMatch(/\$0\.50 of the \$0\.50 fee/);
    // And so is the claim it carried: at 2% the share is 100% at EVERY size,
    // so "a bigger share of smaller orders" is simply false.
    expect(section.textContent).not.toMatch(/bigger share of smaller orders/i);
    expect(section.textContent).toMatch(/entire service fee/i);
  });

  it('keeps the prose example and the size claim when the split is real', () => {
    readyAt({ percent: 7, flatCents: 0, minCents: 0 });
    render(<FeesPage />);

    const section = screen
      .getByRole('heading', { name: 'Card processing' })
      .closest('section') as HTMLElement;

    expect(section.textContent).toMatch(/bigger share of smaller orders/i);
    expect(section.textContent).toMatch(/\$1\.08 of the \$1\.75 fee/);
    expect(section.textContent).not.toMatch(/entire service fee/i);
  });

  it('distinguishes an absent rate from an unreadable one', () => {
    rates.current = null;
    rates.state = 'absent';
    render(<FeesPage />);

    expect(screen.getByText(/No service fee is configured/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it('shows no footnote and no marker when the share is a real number', () => {
    readyAt({ percent: 7, flatCents: 0, minCents: 0 });
    render(<FeesPage />);

    expect(screen.queryByText(/entire service fee/i)).not.toBeInTheDocument();
    [2500, 50000].forEach((subtotalCents: number) => {
      const cells = within(rowFor(subtotalCents)).getAllByRole('cell');
      expect(cells[2].textContent).not.toContain('*');
    });
  });

  // A page whose job is to state the fee publicly must not publish the
  // compiled-in fallback as fact. The fallback equals the live values today, so
  // a stale render would look correct right up until it wasn't.
  it('admits it could not read the rate rather than showing the fallback', () => {
    rates.current = null;
    rates.state = 'unavailable';
    render(<FeesPage />);

    expect(screen.getByText(/could not load the current service fee/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // 7% is the fallback. It must not appear anywhere as a stated rate.
    expect(document.body.textContent).not.toMatch(/\b7%/);
    expect(document.body.textContent).not.toContain('$1.75');
  });

  it('says it is still loading rather than guessing', () => {
    rates.current = null;
    rates.state = 'loading';
    render(<FeesPage />);

    expect(screen.getByText(/loading the current service fee/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('makes no infrastructure cost list and no SMS claim', () => {
    readyAt({ percent: 7, flatCents: 0, minCents: 0 });
    const { container } = render(<FeesPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\bSMS\b/i);
    expect(text).not.toMatch(/\btext message/i);
    expect(text).not.toMatch(/\bhosting\b/i);
    expect(text).not.toMatch(/\bserver costs?\b/i);
    expect(text).not.toMatch(/\bdatabase storage\b/i);
  });
});
