import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';

describe('CompactStatsRow', () => {
  const defaultProps = {
    activeEntries: 3,
    upcomingShows: 2,
    pastShows: 1,
    totalFees: 150,
    onNavigate: vi.fn(),
  };

  it('renders all four stat cards with values', () => {
    render(<CompactStatsRow {...defaultProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Active Entries')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Shows')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Past Show')).toBeInTheDocument();
    expect(screen.getByText('$150')).toBeInTheDocument();
    expect(screen.getByText('Total Fees')).toBeInTheDocument();
  });

  it('uses singular label when count is 1', () => {
    render(<CompactStatsRow {...defaultProps} activeEntries={1} upcomingShows={1} pastShows={1} />);
    expect(screen.getByText('Active Entry')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Show')).toBeInTheDocument();
    expect(screen.getByText('Past Show')).toBeInTheDocument();
  });

  it('uses plural label when count is not 1', () => {
    render(<CompactStatsRow {...defaultProps} activeEntries={0} upcomingShows={5} pastShows={3} />);
    expect(screen.getByText('Active Entries')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Shows')).toBeInTheDocument();
    expect(screen.getByText('Past Shows')).toBeInTheDocument();
  });

  it('navigates to entries page when entries card is clicked', async () => {
    const onNavigate = vi.fn();
    render(<CompactStatsRow {...defaultProps} onNavigate={onNavigate} />);

    const entriesCard = screen.getByLabelText(/Active Entries.*View details/i);
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

  it('applies custom className', () => {
    const { container } = render(<CompactStatsRow {...defaultProps} className="mt-4" />);
    expect(container.firstChild).toHaveClass('mt-4');
  });

  it('renders zero counts correctly', () => {
    render(<CompactStatsRow {...defaultProps} activeEntries={0} upcomingShows={0} pastShows={0} totalFees={0} />);
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(3);
    expect(screen.getByText('$0')).toBeInTheDocument();
  });
});
