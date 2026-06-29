import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';

// The four stat cards live in this grid; the mobile summary line restates some
// of the same numbers, so card-specific assertions scope here to avoid colliding
// with the summary recap.
const getGrid = (container: HTMLElement) =>
  within(container.querySelector('#exhibitor-stat-cards') as HTMLElement);

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
    const { container } = render(<CompactStatsRow {...defaultProps} />);
    const grid = getGrid(container);
    expect(grid.getByText('5')).toBeInTheDocument();
    expect(grid.getByText('Entries')).toBeInTheDocument();
    expect(grid.getByText('3 accepted · 2 pending')).toBeInTheDocument();
    expect(grid.getByText('2')).toBeInTheDocument();
    expect(grid.getByText('Upcoming Shows')).toBeInTheDocument();
    expect(grid.getByText('1')).toBeInTheDocument();
    expect(grid.getByText('Past Show')).toBeInTheDocument();
    expect(grid.getAllByText('entered')).toHaveLength(2);
    expect(grid.getByText('$150')).toBeInTheDocument();
    expect(grid.getByText('Current Fees')).toBeInTheDocument();
    expect(grid.getByText('Amount due $75')).toHaveClass('text-amber-500');
  });

  it('shows paid in full when there is no amount due', () => {
    render(<CompactStatsRow {...defaultProps} amountDue={0} />);
    expect(screen.getByText('Paid in full')).toBeInTheDocument();
    expect(screen.queryByText(/Amount due/i)).not.toBeInTheDocument();
  });

  it('uses the compact four-column layout with icons before the stat data', () => {
    const { container } = render(<CompactStatsRow {...defaultProps} />);

    const grid = container.querySelector('#exhibitor-stat-cards');
    expect(grid).toHaveClass('grid-cols-4');
    expect(grid).toHaveClass('max-[720px]:grid-cols-2');

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

    expect(feeIcon).toHaveClass('text-amber-500');
    expect(feeIcon).toHaveClass('bg-amber-500/10');
    expect(feeIcon).toHaveClass('border-amber-500/30');
    expect(screen.getByText('Amount due $75')).toHaveClass('text-amber-500');
  });

  it('uses a calmer paid-in-full fee icon when no balance is due', () => {
    render(<CompactStatsRow {...defaultProps} amountDue={0} />);

    const feeCard = screen.getByLabelText(/Current Fees.*View details/i);
    const feeIcon = feeCard.querySelector('[data-slot="icon"]');

    expect(feeIcon).toHaveClass('text-emerald-500');
    expect(feeIcon).toHaveClass('bg-emerald-500/10');
    expect(feeIcon).toHaveClass('border-emerald-500/25');
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

  describe('mobile collapse', () => {
    it('collapses the stat grid behind a summary toggle by default', () => {
      const { container } = render(<CompactStatsRow {...defaultProps} />);

      // The summary toggle is the only element exposing an expanded state.
      const toggle = screen.getByRole('button', { expanded: false });
      expect(toggle).toHaveClass('max-[720px]:flex');

      // Grid stays hidden on phones until expanded; the four cards remain in the
      // DOM (data is never removed) and visible on desktop.
      const grid = container.querySelector('#exhibitor-stat-cards');
      expect(grid).toHaveClass('max-[720px]:hidden');
      expect(screen.getByLabelText(/Entries.*View details/i)).toBeInTheDocument();
    });

    it('reveals the four deep-linked cards when the summary is expanded', async () => {
      const { container } = render(<CompactStatsRow {...defaultProps} />);

      await userEvent.click(screen.getByRole('button', { expanded: false }));

      expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
      const grid = container.querySelector('#exhibitor-stat-cards');
      expect(grid).not.toHaveClass('max-[720px]:hidden');
      // Every deep-linked card is still reachable after expanding.
      expect(screen.getByLabelText(/Entries.*View details/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Upcoming Shows.*View details/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Past Show.*View details/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Current Fees.*View details/i)).toBeInTheDocument();
    });

    it('surfaces the amount due in the collapsed summary', () => {
      render(<CompactStatsRow {...defaultProps} amountDue={75} />);

      const due = screen.getByText('$75 due');
      expect(due).toHaveClass('text-amber-500');
      // The toggle recaps entry and show counts without expanding.
      const toggle = screen.getByRole('button', { expanded: false });
      expect(toggle).toHaveTextContent('5');
      expect(toggle).toHaveTextContent('upcoming');
    });

    it('shows total fees in the summary when paid in full', () => {
      render(<CompactStatsRow {...defaultProps} currentFees={150} amountDue={0} />);

      expect(screen.getByText('$150 fees')).toBeInTheDocument();
      expect(screen.queryByText(/due/)).not.toBeInTheDocument();
    });
  });

  it('renders zero counts correctly', () => {
    const { container } = render(
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
    const grid = getGrid(container);
    const zeros = grid.getAllByText('0');
    expect(zeros).toHaveLength(3);
    expect(grid.getByText('0 accepted · 0 pending')).toBeInTheDocument();
    expect(grid.getByText('$0')).toBeInTheDocument();
  });
});
