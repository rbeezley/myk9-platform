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

  it('renders all three stat badges', () => {
    render(<CompactStatsRow {...defaultProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('active entries')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('upcoming shows')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('dog registered')).toBeInTheDocument(); // singular
  });

  it('uses singular label when count is 1', () => {
    render(<CompactStatsRow {...defaultProps} activeEntries={1} upcomingShows={1} totalDogs={1} />);
    expect(screen.getByText('active entry')).toBeInTheDocument();
    expect(screen.getByText('upcoming show')).toBeInTheDocument();
    expect(screen.getByText('dog registered')).toBeInTheDocument();
  });

  it('uses plural label when count is not 1', () => {
    render(<CompactStatsRow {...defaultProps} activeEntries={0} upcomingShows={5} totalDogs={3} />);
    expect(screen.getByText('active entries')).toBeInTheDocument();
    expect(screen.getByText('upcoming shows')).toBeInTheDocument();
    expect(screen.getByText('dogs registered')).toBeInTheDocument();
  });

  it('navigates to entries page when entries badge is clicked', async () => {
    const onNavigate = vi.fn();
    render(<CompactStatsRow {...defaultProps} onNavigate={onNavigate} />);

    const entriesBadge = screen.getByLabelText(/active entries.*View details/i);
    await userEvent.click(entriesBadge);
    expect(onNavigate).toHaveBeenCalledWith('/exhibitor/entries');
  });

  it('navigates to shows page when shows badge is clicked', async () => {
    const onNavigate = vi.fn();
    render(<CompactStatsRow {...defaultProps} onNavigate={onNavigate} />);

    const showsBadge = screen.getByLabelText(/upcoming shows.*View details/i);
    await userEvent.click(showsBadge);
    expect(onNavigate).toHaveBeenCalledWith('/shows');
  });

  it('navigates to dogs page when dogs badge is clicked', async () => {
    const onNavigate = vi.fn();
    render(<CompactStatsRow {...defaultProps} onNavigate={onNavigate} />);

    const dogsBadge = screen.getByLabelText(/dog.*View details/i);
    await userEvent.click(dogsBadge);
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
