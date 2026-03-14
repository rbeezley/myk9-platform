import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';

describe('CompactStatsRow', () => {
  const defaultProps = {
    activeEntries: 3,
    upcomingShows: 2,
    totalDogs: 1,
    onNavigate: vi.fn(),
  };

  it('renders all three stat cards with values', () => {
    render(<CompactStatsRow {...defaultProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Active Entries')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Shows')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Dog Registered')).toBeInTheDocument(); // singular
  });

  it('uses singular label when count is 1', () => {
    render(<CompactStatsRow {...defaultProps} activeEntries={1} upcomingShows={1} totalDogs={1} />);
    expect(screen.getByText('Active Entry')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Show')).toBeInTheDocument();
    expect(screen.getByText('Dog Registered')).toBeInTheDocument();
  });

  it('uses plural label when count is not 1', () => {
    render(<CompactStatsRow {...defaultProps} activeEntries={0} upcomingShows={5} totalDogs={3} />);
    expect(screen.getByText('Active Entries')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Shows')).toBeInTheDocument();
    expect(screen.getByText('Dogs Registered')).toBeInTheDocument();
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

  it('navigates to dogs page when dogs card is clicked', async () => {
    const onNavigate = vi.fn();
    render(<CompactStatsRow {...defaultProps} onNavigate={onNavigate} />);

    const dogsCard = screen.getByLabelText(/Dog.*View details/i);
    await userEvent.click(dogsCard);
    expect(onNavigate).toHaveBeenCalledWith('/dogs');
  });

  it('applies custom className', () => {
    const { container } = render(<CompactStatsRow {...defaultProps} className="mt-4" />);
    expect(container.firstChild).toHaveClass('mt-4');
  });

  it('renders zero counts correctly', () => {
    render(<CompactStatsRow {...defaultProps} activeEntries={0} upcomingShows={0} totalDogs={0} />);
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(3);
  });
});
