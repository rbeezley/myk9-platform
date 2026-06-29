import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';

describe('CompactStatsRow', () => {
  const defaultProps = {
    acceptedEntries: 3,
    pendingEntries: 2,
    upcomingShows: 2,
    pastShows: 1,
    currentFees: 150,
    amountDue: 75,
    onNavigate: vi.fn(),
  };

  it('renders all four stat cards with values', () => {
    render(<CompactStatsRow {...defaultProps} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('3 accepted · 2 pending')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Shows')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Past Show')).toBeInTheDocument();
    expect(screen.getAllByText('entered')).toHaveLength(2);
    expect(screen.getByText('$150')).toBeInTheDocument();
    expect(screen.getByText('Current Fees')).toBeInTheDocument();
    expect(screen.getByText('Amount due $75')).toHaveClass('text-warning');
  });

  it('shows paid in full when there is no amount due', () => {
    render(<CompactStatsRow {...defaultProps} amountDue={0} />);
    expect(screen.getByText('Paid in full')).toBeInTheDocument();
    expect(screen.queryByText(/Amount due/i)).not.toBeInTheDocument();
  });

  it('uses the compact four-column layout with icons before the stat data', () => {
    const { container } = render(<CompactStatsRow {...defaultProps} />);

    expect(container.firstChild).toHaveClass('grid-cols-4');
    expect(container.firstChild).toHaveClass('max-[720px]:grid-cols-2');

    const entriesCard = screen.getByLabelText(/Entries.*View details/i);
    const icon = entriesCard.querySelector('[data-slot="icon"]');
    const label = screen.getByText('Entries');

    expect(entriesCard).toHaveClass('rounded-xl');
    expect(entriesCard).toHaveClass('bg-card');
    expect(entriesCard.querySelector('.h-1')).not.toBeInTheDocument();
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('text-muted-foreground');
    expect(icon).toHaveClass('border-muted-foreground/20');
    expect(icon).toHaveClass('bg-muted/25');
    expect(icon?.compareDocumentPosition(label) ?? Node.DOCUMENT_POSITION_PRECEDING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('uses attention color only for a fee balance due', () => {
    render(<CompactStatsRow {...defaultProps} />);

    const feeCard = screen.getByLabelText(/Current Fees.*View details/i);
    const feeIcon = feeCard.querySelector('[data-slot="icon"]');

    expect(feeIcon).toHaveClass('text-warning');
    expect(feeIcon).toHaveClass('bg-warning/10');
    expect(feeIcon).toHaveClass('border-warning/30');
    expect(screen.getByText('Amount due $75')).toHaveClass('text-warning');
  });

  it('uses a calmer paid-in-full fee icon when no balance is due', () => {
    render(<CompactStatsRow {...defaultProps} amountDue={0} />);

    const feeCard = screen.getByLabelText(/Current Fees.*View details/i);
    const feeIcon = feeCard.querySelector('[data-slot="icon"]');

    expect(feeIcon).toHaveClass('text-success');
    expect(feeIcon).toHaveClass('bg-success/10');
    expect(feeIcon).toHaveClass('border-success/25');
    expect(screen.getByText('Paid in full')).toHaveClass('text-muted-foreground');
  });

  it('uses singular label when count is 1', () => {
    render(
      <CompactStatsRow
        {...defaultProps}
        acceptedEntries={1}
        pendingEntries={0}
        upcomingShows={1}
        pastShows={1}
      />
    );
    expect(screen.getByText('Entry')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Show')).toBeInTheDocument();
    expect(screen.getByText('Past Show')).toBeInTheDocument();
  });

  it('uses plural label when count is not 1', () => {
    render(
      <CompactStatsRow
        {...defaultProps}
        acceptedEntries={0}
        pendingEntries={5}
        upcomingShows={5}
        pastShows={3}
      />
    );
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Shows')).toBeInTheDocument();
    expect(screen.getByText('Past Shows')).toBeInTheDocument();
  });

  it('navigates to entries page when entries card is clicked', async () => {
    const onNavigate = vi.fn();
    render(<CompactStatsRow {...defaultProps} onNavigate={onNavigate} />);

    const entriesCard = screen.getByLabelText(/Entries.*View details/i);
    await userEvent.click(entriesCard);
    expect(onNavigate).toHaveBeenCalledWith('/exhibitor/entries');
  });

  it('navigates to shows page when shows card is clicked', async () => {
    const onNavigate = vi.fn();
    render(<CompactStatsRow {...defaultProps} onNavigate={onNavigate} />);

    const showsCard = screen.getByLabelText(/Upcoming Shows.*View details/i);
    await userEvent.click(showsCard);
    expect(onNavigate).toHaveBeenCalledWith('/shows');
  });

  it('navigates to completed entries when past shows card is clicked', async () => {
    const onNavigate = vi.fn();
    render(<CompactStatsRow {...defaultProps} onNavigate={onNavigate} />);

    const pastCard = screen.getByLabelText(/Past Show.*View details/i);
    await userEvent.click(pastCard);
    expect(onNavigate).toHaveBeenCalledWith('/exhibitor/entries?tab=completed');
  });

  it('opens the cart from Current Fees when an amount is due', async () => {
    const onNavigate = vi.fn();
    render(
      <CompactStatsRow
        {...defaultProps}
        currentFees={125}
        amountDue={125}
        onNavigate={onNavigate}
      />
    );

    const feesCard = screen.getByLabelText(/Current Fees.*Amount due/i);
    await userEvent.click(feesCard);

    expect(onNavigate).toHaveBeenCalledWith('/cart');
  });

  it('uses the provided exact payment recovery URL for Current Fees', async () => {
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

    const feesCard = screen.getByLabelText(/Current Fees.*Amount due/i);
    await userEvent.click(feesCard);

    expect(onNavigate).toHaveBeenCalledWith('/cart?showId=show-1&entryIds=entry-1%2Centry-2');
  });

  it('keeps Current Fees on My Shows when no payment is due', async () => {
    const onNavigate = vi.fn();
    render(
      <CompactStatsRow {...defaultProps} currentFees={125} amountDue={0} onNavigate={onNavigate} />
    );

    const feesCard = screen.getByLabelText(/Current Fees.*Paid in full/i);
    await userEvent.click(feesCard);

    expect(onNavigate).toHaveBeenCalledWith('/exhibitor/entries');
  });

  it('applies custom className', () => {
    const { container } = render(<CompactStatsRow {...defaultProps} className="mt-4" />);
    expect(container.firstChild).toHaveClass('mt-4');
  });

  it('renders zero counts correctly', () => {
    render(
      <CompactStatsRow
        {...defaultProps}
        acceptedEntries={0}
        pendingEntries={0}
        upcomingShows={0}
        pastShows={0}
        currentFees={0}
        amountDue={0}
      />
    );
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(3);
    expect(screen.getByText('0 accepted · 0 pending')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
  });
});
