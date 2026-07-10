import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import {
  CURRENT_ENTRIES_LABEL,
  CURRENT_ENTRIES_QUALIFIER,
} from '@/pages/MyEntriesPage/modules/myShowsCopy';

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
    expect(grid.getByText(CURRENT_ENTRIES_LABEL)).toBeInTheDocument();
    expect(grid.getByText(CURRENT_ENTRIES_QUALIFIER)).toBeInTheDocument();
    expect(grid.getByText('3 accepted · 2 pending')).toBeInTheDocument();
    expect(grid.getByText('2')).toBeInTheDocument();
    expect(grid.getByText('Upcoming Shows')).toBeInTheDocument();
    expect(grid.getByText('1')).toBeInTheDocument();
    expect(grid.getByText('Past Show')).toBeInTheDocument();
    expect(grid.getAllByText('entered')).toHaveLength(2);
    expect(grid.getByText('$150')).toBeInTheDocument();
    expect(grid.getByText('Current Fees')).toBeInTheDocument();
    expect(grid.getByText('Amount due $75')).toHaveClass('text-warning');
  });

  it('shows paid in full when there is no amount due, without a dollar total on the fees card', () => {
    const { container } = render(<CompactStatsRow {...defaultProps} amountDue={0} />);
    const grid = getGrid(container);
    expect(grid.getByText('Paid in full')).toBeInTheDocument();
    expect(grid.queryByText(/Amount due/i)).not.toBeInTheDocument();
    const feesCard = grid.getByLabelText(/Current Fees.*Paid in full/i);
    expect(within(feesCard).queryByText(/^\$\d/)).not.toBeInTheDocument();

    const mobileSummary = screen.getByRole('button', { expanded: false });
    expect(mobileSummary).toHaveTextContent('Paid in full');
    expect(within(mobileSummary).queryByText(/^\$\d+ fees$/i)).not.toBeInTheDocument();
  });

  it('shows a trailing chevron affordance on every clickable stat card', () => {
    const { container } = render(<CompactStatsRow {...defaultProps} />);
    const grid = getGrid(container);
    const cards = grid.getAllByRole('button');
    expect(cards).toHaveLength(4);
    cards.forEach(card => {
      expect(card.querySelector('svg.lucide-chevron-right')).toBeInTheDocument();
    });
  });

  it('uses one column on narrow phones, two on wider screens, and four on desktop', () => {
    const { container } = render(<CompactStatsRow {...defaultProps} />);

    const grid = container.querySelector('#exhibitor-stat-cards');
    // A 390px viewport leaves only ~66px for text inside each two-column card
    // after icon, gap, and padding. Keep narrow phones one-up so 14px scope and
    // status copy remains readable; return to two columns once there is room.
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('min-[480px]:grid-cols-2');
    expect(grid).toHaveClass('xl:grid-cols-4');
    expect(grid).not.toHaveClass('grid-cols-2');

    const entriesCard = screen.getByLabelText(/Entries.*View details/i);
    const icon = entriesCard.querySelector('[data-slot="icon"]');
    const label = screen.getByText(CURRENT_ENTRIES_LABEL);

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

  it('uses the readable text token for stat labels and explanatory copy', () => {
    const { container } = render(<CompactStatsRow {...defaultProps} />);
    const grid = getGrid(container);

    for (const text of [
      CURRENT_ENTRIES_LABEL,
      CURRENT_ENTRIES_QUALIFIER,
      '3 accepted · 2 pending',
    ]) {
      const copy = grid.getByText(text);
      expect(copy).toHaveClass('text-xs');
      expect(copy).not.toHaveClass('text-[11px]');
    }
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
    expect(within(feeCard).getByText('Paid in full')).toHaveClass('text-muted-foreground');
  });

  it('uses singular label for shows when count is 1 (current-entries label is fixed wording)', () => {
    render(
      <CompactStatsRow
        {...defaultProps}
        acceptedEntries={1}
        pendingEntries={0}
        upcomingShows={1}
        pastShows={1}
      />
    );
    expect(screen.getByText(CURRENT_ENTRIES_LABEL)).toBeInTheDocument();
    expect(screen.getByText('Upcoming Show')).toBeInTheDocument();
    expect(screen.getByText('Past Show')).toBeInTheDocument();
  });

  it('uses plural label for shows when count is not 1', () => {
    render(
      <CompactStatsRow
        {...defaultProps}
        acceptedEntries={0}
        pendingEntries={5}
        upcomingShows={5}
        pastShows={3}
      />
    );
    expect(screen.getByText(CURRENT_ENTRIES_LABEL)).toBeInTheDocument();
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

  it('links Current Fees to My Payments when no payment is due', async () => {
    const onNavigate = vi.fn();
    render(
      <CompactStatsRow {...defaultProps} currentFees={125} amountDue={0} onNavigate={onNavigate} />
    );

    const feesCard = screen.getByLabelText(/Current Fees.*Paid in full/i);
    await userEvent.click(feesCard);

    expect(onNavigate).toHaveBeenCalledWith('/exhibitor/payments');
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
      expect(due).toHaveClass('text-warning');
      // The toggle recaps entry and show counts without expanding.
      const toggle = screen.getByRole('button', { expanded: false });
      expect(toggle).toHaveTextContent('5');
      expect(toggle).toHaveTextContent('upcoming');
    });

    it('shows paid in full in the summary without repeating historical fees', () => {
      render(<CompactStatsRow {...defaultProps} currentFees={150} amountDue={0} />);

      const toggle = screen.getByRole('button', { expanded: false });
      expect(toggle).toHaveTextContent('Paid in full');
      expect(toggle).not.toHaveTextContent('$150 fees');
      expect(toggle).not.toHaveTextContent(/due/i);
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
    expect(grid.getByText('Paid in full')).toBeInTheDocument();
  });
});
