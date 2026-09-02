import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { render } from '@/test/utils/testUtils';

/**
 * This component was a four-across stat grid (Current entries · Upcoming shows ·
 * Completed shows · Current fees) with a mobile collapse. Three cards and the
 * collapse are deleted; the assertions describing them went with them. Every
 * assertion about the FEE card's behaviour is preserved below, because that
 * behaviour is unchanged — including the #1696 invariant that its destination
 * is never a no-op back to the page the exhibitor is already on.
 */
describe('CompactStatsRow', () => {
  const defaultProps = {
    currentFees: 150,
    amountDue: 75,
    onNavigate: vi.fn(),
  };

  it('shows the amount owed against the total entered', () => {
    render(<CompactStatsRow {...defaultProps} />);

    expect(screen.getByText('Entry fees')).toBeInTheDocument();
    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByText(/due of \$150\.00 entered/)).toBeInTheDocument();
  });

  it('labels debt from past entries as an outstanding balance', () => {
    render(<CompactStatsRow {...defaultProps} currentFees={0} amountDue={90} />);

    expect(screen.getByText('$90.00')).toBeInTheDocument();
    expect(screen.getByText('outstanding balance')).toBeInTheDocument();
    expect(screen.queryByText(/due of/)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Entry fees: $90.00 outstanding. Finish payment.')
    ).toBeInTheDocument();
  });

  it('formats money with cents', () => {
    // A plain toLocaleString printed a $1,234.50 balance as "$1,234.5" on the
    // exhibitor's money surface.
    render(<CompactStatsRow {...defaultProps} currentFees={1234.5} amountDue={1234.5} />);
    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
  });

  it('goes quiet when nothing is owed, with no dollar total and no pay action', () => {
    render(<CompactStatsRow {...defaultProps} amountDue={0} />);

    expect(screen.getByText('Paid in full')).toBeInTheDocument();
    expect(screen.queryByText('$150.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/Finish Payment/i)).not.toBeInTheDocument();
  });

  it('offers the pay action only while a balance is outstanding', () => {
    render(<CompactStatsRow {...defaultProps} />);
    expect(screen.getByText(/Finish Payment/i)).toBeInTheDocument();
  });

  it('uses attention color only for a fee balance due', () => {
    render(<CompactStatsRow {...defaultProps} />);

    const icon = screen.getByRole('button').querySelector('[data-slot="icon"]');
    expect(icon).toHaveClass('text-warning');
    expect(icon).toHaveClass('bg-warning/10');
    expect(icon).toHaveClass('border-warning/30');
    expect(screen.getByText('$75.00')).toHaveClass('text-warning');
  });

  it('uses a calmer paid-in-full fee icon when no balance is due', () => {
    render(<CompactStatsRow {...defaultProps} amountDue={0} />);

    const button = screen.getByRole('button');
    const icon = button.querySelector('[data-slot="icon"]');
    expect(icon).toHaveClass('text-success');
    expect(icon).toHaveClass('bg-success/10');
    expect(icon).toHaveClass('border-success/25');
    expect(within(button).getByText('Paid in full')).toHaveClass('text-success');
  });

  it('opens the cart when an amount is due', async () => {
    const onNavigate = vi.fn();
    render(
      <CompactStatsRow
        {...defaultProps}
        currentFees={125}
        amountDue={125}
        onNavigate={onNavigate}
      />
    );

    await userEvent.click(screen.getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith('/cart');
  });

  it('uses the provided exact payment recovery URL', async () => {
    // The pay link must target the SAME debt the amount describes
    // (exhibitor-money-clarity), so an explicit href always wins over /cart.
    const onNavigate = vi.fn();
    render(
      <CompactStatsRow
        {...defaultProps}
        currentFees={125}
        amountDue={125}
        currentFeesHref="/cart?showId=show-1&entryIds=entry-1%2Centry-2"
        onNavigate={onNavigate}
      />
    );

    await userEvent.click(screen.getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith('/cart?showId=show-1&entryIds=entry-1%2Centry-2');
  });

  it('links to My Payments when no payment is due', async () => {
    const onNavigate = vi.fn();
    render(
      <CompactStatsRow {...defaultProps} currentFees={125} amountDue={0} onNavigate={onNavigate} />
    );

    await userEvent.click(screen.getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith('/exhibitor/payments');
  });

  it('never navigates to the page the exhibitor is already on', async () => {
    // The #1696 invariant, kept: a bare `/exhibitor/entries` is a no-op dressed
    // up as a control. It outlived the three cards it was written for.
    const onNavigate = vi.fn();
    for (const amountDue of [0, 75]) {
      onNavigate.mockClear();
      const { unmount } = render(
        <CompactStatsRow {...defaultProps} amountDue={amountDue} onNavigate={onNavigate} />
      );
      await userEvent.click(screen.getByRole('button'));
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate.mock.calls[0]?.[0]).not.toBe('/exhibitor/entries');
      unmount();
    }
  });

  it('names the balance and the action for assistive tech', () => {
    render(<CompactStatsRow {...defaultProps} />);
    expect(
      screen.getByLabelText('Entry fees: $75.00 due of $150.00. Finish payment.')
    ).toBeInTheDocument();
  });

  it('is always visible — the balance is never collapsed behind a disclosure', () => {
    // INTENT: the old mobile summary line existed to keep THIS number reachable
    // when a four-card grid was too tall for a phone. With one strip there is
    // nothing to hide, so there must be no toggle at any width.
    render(<CompactStatsRow {...defaultProps} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByRole('button', { expanded: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { expanded: true })).not.toBeInTheDocument();
  });
});
